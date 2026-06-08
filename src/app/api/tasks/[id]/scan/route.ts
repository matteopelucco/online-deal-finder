import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/db/client'
import { rateLimitedSearch } from '@/lib/vinted/client'
import { analyzeListing } from '@/lib/ai/analyzer'
import { sendAlert } from '@/lib/notifications/telegram'
import { COUNTRY_CONFIGS } from '@/lib/vinted/countries'
import type { Task, ScanSummary, VintedCountry, Alert, CountryLog } from '@/types'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  await adminSupabase
    .from('tasks')
    .update({ last_scan_at: null })
    .eq('id', params.id)

  const summary: ScanSummary = {
    tasks_scanned: 0,
    listings_found: 0,
    listings_new: 0,
    listings_analyzed: 0,
    alerts_sent: 0,
    errors: [],
    duration_ms: 0,
  }
  const logs: CountryLog[] = []
  const startTime = Date.now()

  try {
    await processTask(task as Task, adminSupabase, summary, logs)
  } catch (err) {
    summary.errors.push(String(err))
  }

  summary.duration_ms = Date.now() - startTime

  return NextResponse.json({ success: true, summary, logs })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processTask(task: Task, supabase: any, summary: ScanSummary, logs: CountryLog[]): Promise<void> {
  summary.tasks_scanned++

  const { data: seenData } = await supabase
    .from('seen_listings')
    .select('vinted_id, country')
    .eq('task_id', task.id)

  const seenSet = new Set(
    (seenData ?? []).map((r: { vinted_id: string; country: string }) => `${r.country}:${r.vinted_id}`)
  )

  for (const country of task.countries as VintedCountry[]) {
    const countryStart = Date.now()
    const log: CountryLog = {
      country,
      flag: COUNTRY_CONFIGS[country]?.flag ?? '🌍',
      status: 'ok',
      listings_found: 0,
      listings_new: 0,
      listings_qualified: 0,
      listings_analyzed: 0,
      alerts_created: 0,
      duration_ms: 0,
    }

    try {
      const result = await rateLimitedSearch(country, {
        search_text: task.keywords.join(' '),
        price_from: task.price_min ?? undefined,
        price_to: task.price_max ?? undefined,
        order: 'newest_first',
        per_page: 50,
      })

      log.listings_found = result.items.length
      summary.listings_found += result.items.length

      const newListings = result.items.filter(item => !seenSet.has(`${country}:${item.id}`))
      log.listings_new = newListings.length
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
      log.listings_qualified = qualifiedListings.length

      for (const listing of qualifiedListings) {
        summary.listings_analyzed++
        log.listings_analyzed++

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

        log.alerts_created++
        summary.alerts_sent++

        if (task.notify_telegram) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('telegram_chat_id, telegram_verified')
            .eq('id', task.user_id)
            .single()

          if (profile?.telegram_chat_id && profile?.telegram_verified) {
            const alertWithTask: Alert & { task: Task } = { ...savedAlert, task }
            await sendAlert(profile.telegram_chat_id, alertWithTask)
          }
        }
      }

    } catch (err) {
      log.status = 'error'
      log.error = String(err)
      summary.errors.push(`${country}: ${err}`)
    }

    log.duration_ms = Date.now() - countryStart
    logs.push(log)
  }

  await supabase
    .from('tasks')
    .update({ last_scan_at: new Date().toISOString(), total_scans: task.total_scans + 1 })
    .eq('id', task.id)
}
