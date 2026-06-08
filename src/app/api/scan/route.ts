/**
 * POST /api/scan
 *
 * Endpoint chiamato dal cron job GitHub Actions ogni 15 minuti.
 * Esegue tutti i task attivi che sono "in scadenza" di scan.
 *
 * Autenticazione: Bearer token (CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db/client'
import { rateLimitedSearch } from '@/lib/vinted/client'
import { analyzeListing } from '@/lib/ai/analyzer'
import { sendAlert } from '@/lib/notifications/telegram'
import { isScheduledNow } from '@/lib/scan/schedule'
import type { Task, ScanSummary, VintedCountry, Alert } from '@/types'

export async function POST(request: NextRequest) {
  // Verifica autenticazione cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const summary: ScanSummary = {
    tasks_scanned: 0,
    listings_found: 0,
    listings_new: 0,
    listings_analyzed: 0,
    alerts_sent: 0,
    errors: [],
    duration_ms: 0,
  }

  const supabase = createAdminClient()

  // Carica tutti i task attivi
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .eq('is_active', true)

  if (tasksError) {
    return NextResponse.json(
      { error: 'DB error loading tasks', details: tasksError.message },
      { status: 500 }
    )
  }

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ message: 'No active tasks', summary })
  }

  // Processa ogni task
  for (const task of tasks as Task[]) {
    try {
      await processTask(task, supabase, summary)
    } catch (err) {
      const msg = `Task ${task.id} (${task.name}): ${err}`
      console.error(msg)
      summary.errors.push(msg)
    }
  }

  summary.duration_ms = Date.now() - startTime

  console.log('Scan completed:', summary)

  return NextResponse.json({ success: true, summary })
}

async function processTask(
  task: Task,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  summary: ScanSummary
): Promise<void> {
  // Verifica se è ora di scansionare (intervallo minimo)
  if (task.last_scan_at) {
    const lastScan = new Date(task.last_scan_at).getTime()
    const intervalMs = task.scan_interval_minutes * 60 * 1000
    if (Date.now() - lastScan < intervalMs) {
      return // Non ancora il momento
    }
  }

  // Verifica schedule CRON (se configurato)
  if (task.scan_schedule) {
    if (!isScheduledNow(task.scan_schedule, task.last_scan_at)) {
      return // Fuori dalla finestra programmata
    }
  }

  summary.tasks_scanned++

  // Carica gli ID listing già visti per questo task
  const { data: seenData } = await supabase
    .from('seen_listings')
    .select('vinted_id, country')
    .eq('task_id', task.id)

  const seenSet = new Set(
    (seenData ?? []).map((r: { vinted_id: string; country: string }) => `${r.country}:${r.vinted_id}`)
  )

  // Ricerca su ogni paese configurato
  for (const country of task.countries as VintedCountry[]) {
    try {
      const searchText = task.keywords.join(' ')

      const result = await rateLimitedSearch(country, {
        search_text: searchText,
        price_from: task.price_min ?? undefined,
        price_to: task.price_max ?? undefined,
        order: 'newest_first',
        per_page: 50,
      })

      summary.listings_found += result.items.length

      // Filtra listing già visti
      const newListings = result.items.filter(
        item => !seenSet.has(`${country}:${item.id}`)
      )

      summary.listings_new += newListings.length

      // Registra tutti come "visti" (per deduplicazione futura)
      if (result.items.length > 0) {
        const seenInserts = result.items.map(item => ({
          task_id: task.id,
          vinted_id: item.id,
          country,
        }))
        await supabase
          .from('seen_listings')
          .upsert(seenInserts, { onConflict: 'task_id,vinted_id,country', ignoreDuplicates: true })
      }

      // Pre-filtra per qualità venditore e popolarità
      const qualifiedListings = newListings.filter(listing => {
        return (
          listing.user.feedback_reputation >= task.min_seller_rating &&
          listing.user.feedback_count >= task.min_seller_reviews &&
          listing.favourite_count >= (task.min_favourites ?? 0)
        )
      })

      // Analisi AI e notifiche per i listing qualificati
      for (const listing of qualifiedListings) {
        summary.listings_analyzed++

        const analysis = await analyzeListing(listing, task)

        if (analysis.score < task.ai_score_threshold || analysis.investment_value === 'skip') {
          continue
        }

        // Crea alert in DB
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

        if (alertError) {
          console.error('Error saving alert:', alertError)
          continue
        }

        // Invia notifica Telegram
        if (task.notify_telegram) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('telegram_chat_id, telegram_verified')
            .eq('id', task.user_id)
            .single()

          if (profile?.telegram_chat_id && profile?.telegram_verified) {
            const alertWithTask: Alert & { task: Task } = {
              ...savedAlert,
              task,
            }

            const telegramResult = await sendAlert(profile.telegram_chat_id, alertWithTask)

            if (telegramResult.success) {
              await supabase
                .from('alerts')
                .update({
                  telegram_sent: true,
                  telegram_message_id: String(telegramResult.message_id ?? ''),
                  telegram_sent_at: new Date().toISOString(),
                })
                .eq('id', savedAlert.id)

              summary.alerts_sent++
            }
          }
        }
      }

    } catch (err) {
      console.error(`Error scanning ${country} for task ${task.id}:`, err)
      summary.errors.push(`${country}: ${err}`)
    }
  }

  // Aggiorna statistiche del task
  await supabase
    .from('tasks')
    .update({
      last_scan_at: new Date().toISOString(),
      total_scans: task.total_scans + 1,
    })
    .eq('id', task.id)
}
