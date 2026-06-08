import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/db/client'
import { createAdminClient } from '@/lib/db/client'
import { rateLimitedSearch } from '@/lib/vinted/client'
import { analyzeListing } from '@/lib/ai/analyzer'
import { sendAlert } from '@/lib/notifications/telegram'
import type { Task, ScanSummary, VintedCountry, Alert } from '@/types'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verifica ownership
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task non trovato' }, { status: 404 })
  }

  const adminSupabase = createAdminClient()
  const summary: ScanSummary = {
    tasks_scanned: 0,
    listings_found: 0,
    listings_new: 0,
    listings_analyzed: 0,
    alerts_sent: 0,
    errors: [],
    duration_ms: 0,
  }

  const startTime = Date.now()

  // Forza la scansione resettando last_scan_at
  await adminSupabase
    .from('tasks')
    .update({ last_scan_at: null })
    .eq('id', params.id)

  try {
    await processTask(task as Task, adminSupabase, summary)
  } catch (err) {
    summary.errors.push(String(err))
  }

  summary.duration_ms = Date.now() - startTime

  return NextResponse.json({ success: true, summary })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processTask(task: Task, supabase: any, summary: ScanSummary): Promise<void> {
  summary.tasks_scanned++

  const { data: seenData } = await supabase
    .from('seen_listings')
    .select('vinted_id, country')
    .eq('task_id', task.id)

  const seenSet = new Set(
    (seenData ?? []).map((r: { vinted_id: string; country: string }) => `${r.country}:${r.vinted_id}`)
  )

  for (const country of task.countries as VintedCountry[]) {
    try {
      const result = await rateLimitedSearch(country, {
        search_text: task.keywords.join(' '),
        price_from: task.price_min ?? undefined,
        price_to: task.price_max ?? undefined,
        order: 'newest_first',
        per_page: 50,
      })

      summary.listings_found += result.items.length

      const newListings = result.items.filter(item => !seenSet.has(`${country}:${item.id}`))
      summary.listings_new += newListings.length

      if (result.items.length > 0) {
        await supabase
          .from('seen_listings')
          .upsert(
            result.items.map(item => ({ task_id: task.id, vinted_id: item.id, country })),
            { onConflict: 'task_id,vinted_id,country', ignoreDuplicates: true }
          )
      }

      const qualifiedListings = newListings.filter(listing =>
        listing.user.feedback_reputation >= task.min_seller_rating &&
        listing.user.feedback_count >= task.min_seller_reviews
      )

      for (const listing of qualifiedListings) {
        summary.listings_analyzed++
        const analysis = await analyzeListing(listing, task)

        if (analysis.score < task.ai_score_threshold || analysis.investment_value === 'skip') continue

        const alertData = {
          task_id: task.id,
          user_id: task.user_id,
          vinted_id: listing.id,
          country,
          listing_title: listing.title,
          listing_price: parseFloat(listing.price),
          listing_currency: listing.currency,
          listing_url: listing.url,
          listing_photo_url: listing.photo?.url ?? null,
          listing_description: listing.description,
          seller_id: listing.user.id,
          seller_username: listing.user.login,
          seller_rating: listing.user.feedback_reputation,
          seller_reviews: listing.user.feedback_count,
          ai_score: analysis.score,
          ai_reasoning: analysis.reasoning,
          ai_highlights: analysis.highlights,
          ai_warnings: analysis.warnings,
          ai_investment_value: analysis.investment_value,
          telegram_sent: false,
        }

        const { data: savedAlert, error: alertError } = await supabase
          .from('alerts')
          .insert(alertData)
          .select()
          .single()

        if (alertError) { console.error('Error saving alert:', alertError); continue }

        if (task.notify_telegram) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('telegram_chat_id, telegram_verified')
            .eq('id', task.user_id)
            .single()

          if (profile?.telegram_chat_id && profile?.telegram_verified) {
            const alertWithTask: Alert & { task: Task } = { ...savedAlert, task }
            const result = await sendAlert(profile.telegram_chat_id, alertWithTask)

            if (result.success) {
              await supabase
                .from('alerts')
                .update({
                  telegram_sent: true,
                  telegram_message_id: String(result.message_id ?? ''),
                  telegram_sent_at: new Date().toISOString(),
                })
                .eq('id', savedAlert.id)
              summary.alerts_sent++
            }
          }
        }
      }
    } catch (err) {
      summary.errors.push(`${country}: ${err}`)
    }
  }

  await supabase
    .from('tasks')
    .update({ last_scan_at: new Date().toISOString(), total_scans: task.total_scans + 1 })
    .eq('id', task.id)
}
