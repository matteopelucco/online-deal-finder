/**
 * Telegram Notification Service
 *
 * Setup:
 * 1. Crea bot con @BotFather → ottieni BOT_TOKEN
 * 2. L'utente invia /start al bot → si registra il chat_id
 * 3. Usa sendAlert() per inviare notifiche
 */

import type { Alert, Task } from '@/types'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`

export interface TelegramSendResult {
  success: boolean
  message_id?: number
  error?: string
}

/**
 * Invia una notifica di alert all'utente via Telegram.
 * Invia prima la foto (se disponibile), poi il testo.
 */
export async function sendAlert(
  chatId: string,
  alert: Alert & { task?: Task }
): Promise<TelegramSendResult> {
  const text = formatAlertMessage(alert)

  try {
    let result: TelegramSendResult

    if (alert.listing_photo_url) {
      // Invia con foto
      result = await sendPhoto(chatId, alert.listing_photo_url, text)
    } else {
      // Invia solo testo
      result = await sendMessage(chatId, text)
    }

    return result
  } catch (err) {
    return {
      success: false,
      error: String(err),
    }
  }
}

/**
 * Formatta il messaggio di alert per Telegram (HTML)
 */
function formatAlertMessage(alert: Alert & { task?: Task }): string {
  const scoreEmoji = getScoreEmoji(alert.ai_score ?? 5)
  const investmentEmoji = {
    high: '🚀',
    medium: '📊',
    low: '📉',
    skip: '⏭️',
  }[alert.ai_investment_value ?? 'medium']

  const countryFlag: Record<string, string> = {
    it: '🇮🇹', fr: '🇫🇷', de: '🇩🇪', es: '🇪🇸',
    pl: '🇵🇱', be: '🇧🇪', nl: '🇳🇱', uk: '🇬🇧',
    pt: '🇵🇹', at: '🇦🇹', cz: '🇨🇿',
  }

  const lines: string[] = [
    `${scoreEmoji} <b>${escapeHtml(alert.task?.name ?? 'Alert')}</b> — Score: <b>${alert.ai_score}/10</b> ${investmentEmoji}`,
    '',
    `📦 <b>${escapeHtml(alert.listing_title)}</b>`,
    `💶 <b>€${alert.listing_price.toFixed(2)}</b> ${alert.listing_currency !== 'EUR' ? `(${alert.listing_currency})` : ''} · ${countryFlag[alert.country] ?? '🌍'} ${alert.country.toUpperCase()}`,
  ]

  if (alert.seller_username) {
    const rating = alert.seller_rating?.toFixed(1) ?? '?'
    const reviews = alert.seller_reviews ?? 0
    lines.push(`👤 Venditore: <b>${escapeHtml(alert.seller_username)}</b> — ⭐ ${rating}/5 (${reviews} rec.)`)
  }

  if (alert.ai_reasoning) {
    lines.push('')
    lines.push(`🤖 <i>${escapeHtml(alert.ai_reasoning)}</i>`)
  }

  if (alert.ai_highlights && alert.ai_highlights.length > 0) {
    lines.push('')
    lines.push('✅ <b>Punti di forza:</b>')
    alert.ai_highlights.forEach(h => lines.push(`  • ${escapeHtml(h)}`))
  }

  if (alert.ai_warnings && alert.ai_warnings.length > 0) {
    lines.push('⚠️ ' + alert.ai_warnings.map(escapeHtml).join(' · '))
  }

  lines.push('')
  lines.push(`🔗 <a href="${alert.listing_url}">Vedi su Vinted →</a>`)

  return lines.join('\n')
}

function getScoreEmoji(score: number): string {
  if (score >= 9) return '🔥'
  if (score >= 7) return '🎯'
  if (score >= 5) return '👀'
  return '😐'
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function sendMessage(chatId: string, text: string): Promise<TelegramSendResult> {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  })

  const data = await response.json()
  if (!data.ok) {
    return { success: false, error: data.description }
  }
  return { success: true, message_id: data.result.message_id }
}

async function sendPhoto(
  chatId: string,
  photoUrl: string,
  caption: string
): Promise<TelegramSendResult> {
  const response = await fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption: caption.slice(0, 1024), // Telegram caption limit
      parse_mode: 'HTML',
    }),
  })

  const data = await response.json()
  if (!data.ok) {
    // Fallback: invia solo testo se la foto fallisce
    console.warn('Telegram photo failed, falling back to text:', data.description)
    return sendMessage(chatId, caption)
  }
  return { success: true, message_id: data.result.message_id }
}

/**
 * Invia un messaggio di test per verificare la connessione
 */
export async function sendTestMessage(chatId: string): Promise<TelegramSendResult> {
  return sendMessage(chatId, '✅ <b>Online Deal Finder</b>\n\nConnessione Telegram verificata con successo! Riceverai gli alert qui.')
}

/**
 * Invia codice di verifica per collegare l'account Telegram
 */
export async function sendVerificationCode(chatId: string, code: string): Promise<TelegramSendResult> {
  return sendMessage(chatId, `🔐 <b>Online Deal Finder — Codice di verifica</b>\n\nIl tuo codice è: <code>${code}</code>\n\nInseriscilo nell'app per completare la connessione.\n(Scade tra 10 minuti)`)
}
