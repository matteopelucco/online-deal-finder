import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/db/client'
import { rateLimitedSearch } from '@/lib/vinted/client'
import { analyzeListing } from '@/lib/ai/analyzer'
import { sendAlert } from '@/lib/notifications/telegram'
import { COUNTRY_CONFIGS } from '@/lib/vinted/countries'
import type { Task, VintedCountry, Alert, ListingDetail } from '@/types'

// ---- Event types (shared with client via this route's response) ----
export type ScanEvent =
  | { type: 'start'; task_name: string; countries: string[] }
  | { type: 'step'; level: 'info' | 'warn' | 'success' | 'error'; message: string }
  | { type: 'country_start'; country: string; flag: string }
  | { type: 'vinted_result'; country: string; found: number; new_count: number }
  | { type: 'listing'; detail: ListingDetail }
  | { type: 'country_done'; country: string; duration_ms: number; alerts: number }
  | { type: 'done'; duration_ms: number; total_alerts: number; errors: string[] }
  | { type: 'error'; message: string }

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (taskError || !task) return new Response('Task non trovato', { status: 404 })

  const adminSupabase = createAdminClient()
  const encoder = new TextEncoder()
  const startTime = Date.now()

  const stream = new TransformStream<Uint8Array, Uint8Array>()
  const writer = stream.writable.getWriter()

  function emit(event: ScanEvent) {
    writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
  }

  // Kick off scan without awaiting — response streams while scan runs
  ;(async () => {
    const errors: string[] = []
    let totalAlerts = 0

    try {
      // Forza la riesecuzione resettando last_scan_at
      await adminSupabase.from('tasks').update({ last_scan_at: null }).eq('id', params.id)

      emit({ type: 'start', task_name: task.name, countries: task.countries })

      const t = task as Task

      // Carica seen listings
      emit({ type: 'step', level: 'info', message: 'Caricamento listing già visti dal DB…' })
      const { data: seenData } = await adminSupabase
        .from('seen_listings')
        .select('vinted_id, country')
        .eq('task_id', t.id)

      const seenSet = new Set(
        (seenData ?? []).map((r: { vinted_id: string; country: string }) => `${r.country}:${r.vinted_id}`)
      )
      emit({ type: 'step', level: 'info', message: `${seenSet.size} listing già noti (deduplicazione)` })

      for (const country of t.countries as VintedCountry[]) {
        const cfg = COUNTRY_CONFIGS[country]
        const countryStart = Date.now()

        emit({ type: 'country_start', country, flag: cfg?.flag ?? '🌍' })
        emit({ type: 'step', level: 'info', message: `Cookie refresh per ${cfg?.name ?? country}…` })

        let result
        try {
          emit({ type: 'step', level: 'info', message: `GET ${cfg?.domain}/api/v2/catalog/items?search_text=${t.keywords.join(' ')}` })
          result = await rateLimitedSearch(country, {
            search_text: t.keywords.join(' '),
            price_from: t.price_min ?? undefined,
            price_to: t.price_max ?? undefined,
            order: 'newest_first',
            per_page: 50,
          })
          emit({ type: 'step', level: 'success', message: `Vinted ha risposto: ${result.items.length} listing (pag. 1/${result.pagination.total_pages}, totale ${result.pagination.total_entries})` })
          // Debug struttura raw (primo item) — utile per diagnosi parsing
          if (result._rawDebug) {
            const d = result._rawDebug
            emit({ type: 'step', level: 'warn', message: `[STRUTTURA API] price_raw=${JSON.stringify(d.price_raw).slice(0, 60)} | user_keys=[${d.user_keys.join(',')}] | rep=${d.rep_raw} count=${d.count_raw} | root_keys=[${d.root_keys.join(',')}]` })
          }
        } catch (err) {
          const msg = `Vinted API fallita per ${country}: ${err}`
          emit({ type: 'step', level: 'error', message: msg })
          errors.push(msg)
          emit({ type: 'country_done', country, duration_ms: Date.now() - countryStart, alerts: 0 })
          continue
        }

        const newListings = result.items.filter(item => !seenSet.has(`${country}:${item.id}`))
        emit({ type: 'vinted_result', country, found: result.items.length, new_count: newListings.length })

        // Registra come visti
        if (result.items.length > 0) {
          await adminSupabase
            .from('seen_listings')
            .upsert(
              result.items.map(item => ({ task_id: t.id, vinted_id: item.id, country })),
              { onConflict: 'task_id,vinted_id,country', ignoreDuplicates: true }
            )
        }

        let countryAlerts = 0

        // Analisi AI su tutti i listing nuovi (qualificati e non) per visibilità debug
        for (const listing of newListings) {
          // Seller filter: si applica SOLO se Vinted ha restituito i dati di reputazione
          const hasRep = listing.user.reputation_available
          const passedRating = !hasRep || listing.user.feedback_reputation >= t.min_seller_rating
          const passedReviews = !hasRep || listing.user.feedback_count >= t.min_seller_reviews
          const passedFavourites = listing.favourite_count >= (t.min_favourites ?? 0)
          const passed = passedRating && passedReviews && passedFavourites

          let filterReason: string | undefined
          if (!passedRating) filterReason = `rating ${listing.user.feedback_reputation.toFixed(1)} < ${t.min_seller_rating}`
          else if (!passedReviews) filterReason = `recensioni ${listing.user.feedback_count} < ${t.min_seller_reviews}`
          else if (!passedFavourites) filterReason = `preferiti ${listing.favourite_count} < ${t.min_favourites}`

          const repStr = listing.user.reputation_available
            ? `⭐${listing.user.feedback_reputation.toFixed(1)}(${listing.user.feedback_count})`
            : '⭐N/D'
          emit({ type: 'step', level: 'info', message: `🤖 AI: "${listing.title.slice(0, 50)}" €${listing.price_numeric.toFixed(2)} ${repStr} ♥${listing.favourite_count}` })

          let analysis
          try {
            analysis = await analyzeListing(listing, t)
            const skipReason = analysis.investment_value === 'skip'
              ? 'AI: valore skip'
              : analysis.score < t.ai_score_threshold
                ? `score ${analysis.score} < soglia ${t.ai_score_threshold}`
                : null
          emit({ type: 'step', level: skipReason ? 'info' : 'success',
              message: `   → score ${analysis.score}/10 [${analysis.investment_value}]${skipReason ? ` — ${skipReason}` : ''}${!passed ? ` ✗ filtro: ${filterReason}` : ''}` })
          } catch (err) {
            emit({ type: 'step', level: 'error', message: `   → AI fallita: ${err}` })
            analysis = { score: 0, investment_value: 'skip' as const, reasoning: '', highlights: [], warnings: [] }
          }

          const detail: ListingDetail = {
            id: listing.id,
            title: listing.title,
            price: listing.price,
            price_numeric: listing.price_numeric,
            url: listing.url,
            seller_rating: listing.user.feedback_reputation,
            seller_reviews: listing.user.feedback_count,
            seller_reputation_available: listing.user.reputation_available,
            favourite_count: listing.favourite_count,
            passed_filter: passed,
            filter_reason: filterReason,
            ai_score: analysis.score,
            ai_investment_value: analysis.investment_value,
          }
          emit({ type: 'listing', detail })

          // Crea alert solo se qualificato e score sufficiente
          if (!passed) continue
          if (analysis.investment_value === 'skip') {
            emit({ type: 'step', level: 'info', message: `   → AI: valore skip, nessun alert` })
            continue
          }
          if (analysis.score < t.ai_score_threshold) {
            emit({ type: 'step', level: 'info', message: `   → score ${analysis.score} < soglia ${t.ai_score_threshold}, nessun alert` })
            continue
          }

          emit({ type: 'step', level: 'success', message: `   → 🎯 ALERT! Salvataggio in DB…` })

          const { data: savedAlert, error: alertError } = await adminSupabase
            .from('alerts')
            .insert({
              task_id: t.id, user_id: t.user_id, vinted_id: listing.id, country,
              listing_title: listing.title, listing_price: parseFloat(listing.price),
              listing_currency: listing.currency, listing_url: listing.url,
              listing_photo_url: listing.photo?.url ?? null,
              listing_description: listing.description,
              seller_id: listing.user.id, seller_username: listing.user.login,
              seller_rating: listing.user.feedback_reputation, seller_reviews: listing.user.feedback_count,
              ai_score: analysis.score, ai_reasoning: analysis.reasoning,
              ai_highlights: analysis.highlights, ai_warnings: analysis.warnings,
              ai_investment_value: analysis.investment_value, telegram_sent: false,
            })
            .select().single()

          if (alertError) {
            emit({ type: 'step', level: 'error', message: `   → Errore salvataggio alert: ${alertError.message}` })
            continue
          }

          countryAlerts++
          totalAlerts++

          if (t.notify_telegram) {
            const { data: profile } = await adminSupabase
              .from('profiles').select('telegram_chat_id, telegram_verified').eq('id', t.user_id).single()

            if (profile?.telegram_chat_id && profile?.telegram_verified) {
              emit({ type: 'step', level: 'info', message: `   → Invio notifica Telegram a chat ${profile.telegram_chat_id}…` })
              const tgResult = await sendAlert(profile.telegram_chat_id, { ...savedAlert, task: t } as Alert & { task: Task })
              emit({ type: 'step', level: tgResult.success ? 'success' : 'error',
                message: tgResult.success ? `   → 📱 Telegram inviato (msg_id: ${tgResult.message_id})` : `   → Telegram fallito: ${tgResult.error}` })
            } else {
              emit({ type: 'step', level: 'warn', message: '   → Telegram non configurato o non verificato' })
            }
          }
        }

        emit({ type: 'country_done', country, duration_ms: Date.now() - countryStart, alerts: countryAlerts })
      }

      // Aggiorna statistiche task
      await adminSupabase
        .from('tasks')
        .update({ last_scan_at: new Date().toISOString(), total_scans: (task as Task).total_scans + 1 })
        .eq('id', t.id)

      emit({ type: 'done', duration_ms: Date.now() - startTime, total_alerts: totalAlerts, errors })

    } catch (err) {
      emit({ type: 'error', message: String(err) })
    } finally {
      writer.close()
    }
  })()

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
