/**
 * Vinted API Client — wrapper per le API interne non-ufficiali di Vinted
 *
 * NOTA: Vinted non ha API pubbliche. Questo client usa gli endpoint
 * interni della app mobile/web, ottenuti tramite reverse engineering.
 * Funzionano al momento della scrittura ma potrebbero cambiare.
 *
 * Strategia di resilienza:
 * - Cookie refresh automatico in caso di 401/403
 * - Rate limiting: 1 req ogni VINTED_REQUEST_DELAY_MS ms per paese
 * - Retry con backoff esponenziale
 * - Timeout configurabile
 */

import { createClient } from '@/lib/db/client'
import { COUNTRY_CONFIGS } from './countries'
import type { VintedCountry, VintedListing, VintedSearchParams, VintedSearchResult, VintedUser } from '@/types'

const REQUEST_DELAY = parseInt(process.env.VINTED_REQUEST_DELAY_MS ?? '2000')
const REQUEST_TIMEOUT = parseInt(process.env.VINTED_REQUEST_TIMEOUT_MS ?? '10000')

// User-Agent realistico per evitare blocchi
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// Cache in-memory dei cookie per evitare letture DB eccessive
const cookieCache: Map<VintedCountry, { cookies: string; expires: number }> = new Map()

/**
 * Ottieni i cookie di sessione per un paese.
 * Prima cerca in cache, poi in DB, infine li rinnova.
 */
async function getSessionCookies(country: VintedCountry): Promise<string> {
  const now = Date.now()
  const cached = cookieCache.get(country)

  if (cached && cached.expires > now) {
    return cached.cookies
  }

  // Cerca in DB (può fallire per RLS — non fatale)
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('vinted_sessions')
      .select('cookies, expires_at')
      .eq('country', country)
      .single()

    if (data && data.expires_at && new Date(data.expires_at).getTime() > now) {
      cookieCache.set(country, { cookies: data.cookies, expires: new Date(data.expires_at).getTime() })
      return data.cookies
    }
  } catch {
    // Ignora errori DB per vinted_sessions (RLS blocca accesso utente normale)
  }

  return await refreshSessionCookies(country)
}

/**
 * Rinnova i cookie di sessione per un paese facendo una GET alla homepage.
 */
/**
 * Segue i redirect manualmente raccogliendo i cookie da ogni step.
 * Necessario perché Vinted imposta _vinted_XX_session nei redirect intermedi,
 * non nell'ultima risposta — redirect:'follow' perderebbe quei cookie.
 */
async function refreshSessionCookies(country: VintedCountry): Promise<string> {
  const config = COUNTRY_CONFIGS[country]
  const cookieJar: Record<string, string> = {}
  let url = config.domain
  let maxRedirects = 8

  try {
    while (maxRedirects-- > 0) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

      const cookieHeader = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ')

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
          'Connection': 'keep-alive',
          ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
        },
        redirect: 'manual',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Raccogli cookie da questa risposta
      const setCookieHeaders = response.headers.getSetCookie?.() ?? []
      for (const raw of setCookieHeaders) {
        const [nameValue] = raw.split(';')
        const eqIdx = nameValue.indexOf('=')
        if (eqIdx > 0) {
          const name = nameValue.slice(0, eqIdx).trim()
          const value = nameValue.slice(eqIdx + 1).trim()
          cookieJar[name] = value
        }
      }

      // Segui redirect
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (location) {
          url = location.startsWith('http') ? location : `${config.domain}${location}`
          continue
        }
      }

      // Risposta finale
      break
    }

    const cookies = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ')

    if (cookies) {
      const expiresAt = new Date(Date.now() + 3600 * 1000)
      try {
        const supabase = createClient()
        await supabase.from('vinted_sessions').upsert({
          country,
          cookies,
          updated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        }, { onConflict: 'country' })
      } catch { /* RLS blocca scrittura — ok, usiamo solo la cache in-memory */ }

      cookieCache.set(country, { cookies, expires: Date.now() + 3600 * 1000 })
    }

    return cookies

  } catch (err) {
    console.warn(`Cookie refresh failed for ${country}:`, err)
    return ''
  }
}

/**
 * Esegui una ricerca su Vinted per un paese specifico.
 */
export async function searchVinted(
  country: VintedCountry,
  params: VintedSearchParams,
  retries = 2
): Promise<VintedSearchResult> {
  const config = COUNTRY_CONFIGS[country]
  const cookies = await getSessionCookies(country)

  const searchParams = new URLSearchParams({
    search_text: params.search_text,
    order: params.order ?? 'newest_first',
    per_page: String(params.per_page ?? 96),
    ...(params.page && { page: String(params.page) }),
    ...(params.price_from !== undefined && { price_from: String(params.price_from) }),
    ...(params.price_to !== undefined && { price_to: String(params.price_to) }),
  })

  const url = `${config.domain}/api/v2/catalog/items?${searchParams}`

  const requestHeaders: Record<string, string> = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'it-IT,it;q=0.9',
    'Referer': config.domain,
    'X-Requested-With': 'XMLHttpRequest',
  }
  // Includi Cookie solo se non vuoto: passare Cookie:'' causa 401 su Vinted
  if (cookies) {
    requestHeaders['Cookie'] = cookies
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: requestHeaders,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.status === 401 || response.status === 403) {
      cookieCache.delete(country)
      if (retries > 0) {
        await delay(1000)
        return searchVinted(country, params, retries - 1)
      }
      throw new Error(`HTTP ${response.status} da Vinted per ${country} — possibile blocco IP o rate limit`)
    }

    if (!response.ok) {
      throw new Error(`Vinted API HTTP ${response.status} per ${country}`)
    }

    const json = await response.json()
    return parseSearchResponse(json, country)

  } catch (err) {
    clearTimeout(timeoutId)
    if (retries > 0 && !(err instanceof Error && err.message.startsWith('HTTP'))) {
      await delay(REQUEST_DELAY * 2)
      return searchVinted(country, params, retries - 1)
    }
    throw err
  }
}

/**
 * Parsa la risposta dell'API Vinted nel formato interno.
 * Supporta sia items con user embed sia items con user_id + mappa users separata.
 */
function parseSearchResponse(json: Record<string, unknown>, country: VintedCountry): VintedSearchResult {
  const rawItems = (json.items as Record<string, unknown>[]) ?? []
  const pagination = (json.pagination as Record<string, unknown>) ?? {}
  // Mappa users separata (alcune versioni API restituiscono users come dizionario root)
  const usersMap = (json.users as Record<string, Record<string, unknown>>) ?? {}

  const listings: VintedListing[] = rawItems.map(item => {
    // Risolvi user: embedded OR lookup in usersMap tramite user_id / user.id
    let userObj: Record<string, unknown> = {}
    if (item.user && typeof item.user === 'object') {
      userObj = item.user as Record<string, unknown>
    } else {
      const uid = String(item.user_id ?? '')
      if (uid && usersMap[uid]) userObj = usersMap[uid]
    }

    const photo = (item.photo as Record<string, unknown>) ?? null
    const priceNumeric = parsePrice(item)

    return {
      id: String(item.id),
      title: String(item.title ?? ''),
      price: priceNumeric.toFixed(2),
      price_numeric: priceNumeric,
      currency: parseCurrency(item),
      url: String(item.url ?? `https://www.vinted.${country}/items/${item.id}`),
      photo: photo ? {
        url: String(photo.url ?? photo.full_size_url ?? ''),
        dominant_color: photo.dominant_color ? String(photo.dominant_color) : undefined,
      } : null,
      description: String(item.description ?? ''),
      user: parseVintedUser(userObj),
      favourite_count: Number(item.favourite_count ?? item.favourites_count ?? 0),
      brand_title: item.brand_title ? String(item.brand_title) : undefined,
      size_title: item.size_title ? String(item.size_title) : undefined,
      status: item.status ? String(item.status) : undefined,
      country,
    }
  })

  // Debug info per diagnostica (primo item raw)
  const fi = rawItems[0]
  const fiUser = fi ? ((fi.user as Record<string, unknown>) ?? {}) : {}
  const _rawDebug = fi ? {
    price_raw: fi.price,
    price_numeric_raw: fi.price_numeric,
    user_keys: Object.keys(fiUser),
    rep_raw: fiUser.feedback_reputation ?? fiUser.account_reputation ?? fiUser.score,
    count_raw: fiUser.feedback_count ?? fiUser.feedbacks_count ?? fiUser.total_reviews,
    root_keys: Object.keys(json),
  } : undefined

  return {
    items: listings,
    pagination: {
      current_page: Number(pagination.current_page ?? 1),
      total_pages: Number(pagination.total_pages ?? 1),
      total_entries: Number(pagination.total_entries ?? listings.length),
    },
    _rawDebug,
  }
}

/**
 * Parsing robusto del prezzo. Vinted usa formati diversi:
 * - stringa: "12.50" o "12,50" (locale europea)
 * - numero: 12.5
 * - oggetto: { amount: "12.50", currency_code: "EUR" }
 * - campo alternativo: price_numeric (float), total_item_price (oggetto)
 */
function parsePrice(item: Record<string, unknown>): number {
  // 1. price_numeric (float diretto — più affidabile)
  const pn = item.price_numeric
  if (typeof pn === 'number' && isFinite(pn) && pn >= 0) return pn
  if (typeof pn === 'string') {
    const n = parseFloat(pn.replace(',', '.'))
    if (isFinite(n) && n >= 0) return n
  }

  // 2. price (stringa, numero, o oggetto)
  const raw = item.price
  if (typeof raw === 'number' && isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const n = parseFloat(raw.replace(',', '.'))
    if (isFinite(n)) return n
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    // { amount: "12.50" } o { amount: 12.5 }
    const amt = obj.amount ?? obj.value ?? obj.price
    if (typeof amt === 'number' && isFinite(amt)) return amt
    if (typeof amt === 'string') {
      const n = parseFloat(amt.replace(',', '.'))
      if (isFinite(n)) return n
    }
  }

  // 3. total_item_price (oggetto annidato)
  const tip = item.total_item_price
  if (tip && typeof tip === 'object') {
    const obj = tip as Record<string, unknown>
    const amt = obj.amount ?? obj.value
    if (typeof amt === 'number' && isFinite(amt)) return amt
    if (typeof amt === 'string') {
      const n = parseFloat(amt.replace(',', '.'))
      if (isFinite(n)) return n
    }
  }

  return 0
}

function parseCurrency(item: Record<string, unknown>): string {
  if (typeof item.currency === 'string' && item.currency) return item.currency
  // currency embedded nel price object: { amount: "6.0", currency_code: "EUR" }
  if (item.price && typeof item.price === 'object') {
    const cc = (item.price as Record<string, unknown>).currency_code
    if (typeof cc === 'string' && cc) return cc
  }
  const tip = item.total_item_price as Record<string, unknown> | null
  return String(tip?.currency_code ?? 'EUR')
}

/**
 * Parsing robusto del profilo venditore.
 *
 * NOTA: la Vinted catalog API (/api/v2/catalog/items) NON include
 * dati di reputazione nell'user object degli item. Il campo
 * reputation_available=false indica che il filtro seller non è applicabile.
 */
function parseVintedUser(user: Record<string, unknown>): VintedUser {
  const repRaw = user.feedback_reputation ??
    user.account_reputation ??
    user.avg_review_rating ??
    user.score

  const countRaw = user.feedback_count ??
    user.feedbacks_count ??
    user.total_reviews ??
    user.review_count

  const reputation_available = repRaw !== undefined && repRaw !== null

  const rawRep = Number(repRaw ?? 0)
  // Scala 0-1 → 0-5. Guard: se già > 1 è già in scala 0-5
  const rating = rawRep > 0 && rawRep <= 1 ? rawRep * 5 : rawRep

  return {
    id: String(user.id ?? ''),
    login: String(user.login ?? user.username ?? ''),
    feedback_reputation: Math.round(rating * 100) / 100,
    feedback_count: Number(countRaw ?? 0),
    item_count: user.item_count != null ? Number(user.item_count) : undefined,
    reputation_available,
  }
}

/**
 * Helper: delay in ms
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Rate-limited wrapper: esegue una ricerca rispettando il delay configurato
 */
const lastRequestTime: Map<VintedCountry, number> = new Map()

export async function rateLimitedSearch(
  country: VintedCountry,
  params: VintedSearchParams
): Promise<VintedSearchResult> {
  const lastTime = lastRequestTime.get(country) ?? 0
  const elapsed = Date.now() - lastTime
  if (elapsed < REQUEST_DELAY) {
    await delay(REQUEST_DELAY - elapsed)
  }
  lastRequestTime.set(country, Date.now())
  return searchVinted(country, params)
}
