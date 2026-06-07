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

  // Cerca in DB
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

  // Rinnova i cookie
  return await refreshSessionCookies(country)
}

/**
 * Rinnova i cookie di sessione per un paese facendo una GET alla homepage.
 */
async function refreshSessionCookies(country: VintedCountry): Promise<string> {
  const config = COUNTRY_CONFIGS[country]
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const response = await fetch(config.domain, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
      redirect: 'follow',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    // Estrai cookie dai header di risposta
    const setCookieHeaders = response.headers.getSetCookie?.() ?? []
    const cookies = setCookieHeaders
      .map(c => c.split(';')[0])
      .join('; ')

    if (!cookies) {
      throw new Error(`Impossibile ottenere cookie per ${country}`)
    }

    // Salva in DB e in cache
    const expiresAt = new Date(Date.now() + 3600 * 1000) // 1 ora
    const supabase = createClient()
    await supabase
      .from('vinted_sessions')
      .upsert({
        country,
        cookies,
        updated_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      }, { onConflict: 'country' })

    cookieCache.set(country, { cookies, expires: expiresAt.getTime() })

    return cookies

  } catch (err) {
    clearTimeout(timeoutId)
    throw new Error(`Errore refresh cookie per ${country}: ${err}`)
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

  // Costruisci URL di ricerca
  const searchParams = new URLSearchParams({
    search_text: params.search_text,
    order: params.order ?? 'newest_first',
    per_page: String(params.per_page ?? 96),
    ...(params.page && { page: String(params.page) }),
    ...(params.price_from !== undefined && { price_from: String(params.price_from) }),
    ...(params.price_to !== undefined && { price_to: String(params.price_to) }),
  })

  const url = `${config.domain}/api/v2/catalog/items?${searchParams}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'it-IT,it;q=0.9',
        'Cookie': cookies,
        'Referer': config.domain,
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.status === 401 || response.status === 403) {
      // Cookie scaduti, invalida cache e riprova
      cookieCache.delete(country)
      if (retries > 0) {
        await delay(1000)
        return searchVinted(country, params, retries - 1)
      }
      throw new Error(`Autenticazione Vinted fallita per ${country}`)
    }

    if (!response.ok) {
      throw new Error(`Vinted API error ${response.status} per ${country}`)
    }

    const json = await response.json()
    return parseSearchResponse(json, country)

  } catch (err) {
    clearTimeout(timeoutId)
    if (retries > 0 && !(err instanceof Error && err.message.includes('Autenticazione'))) {
      await delay(REQUEST_DELAY * 2)
      return searchVinted(country, params, retries - 1)
    }
    throw err
  }
}

/**
 * Parsa la risposta dell'API Vinted nel formato interno.
 */
function parseSearchResponse(json: Record<string, unknown>, country: VintedCountry): VintedSearchResult {
  // La struttura della risposta Vinted può variare — gestire sia il formato
  // attuale che possibili variazioni future
  const items = (json.items as Record<string, unknown>[]) ?? []
  const pagination = json.pagination as Record<string, unknown> ?? {}

  const listings: VintedListing[] = items.map(item => {
    const user = item.user as Record<string, unknown> ?? {}
    const photo = item.photo as Record<string, unknown> ?? null
    return {
      id: String(item.id),
      title: String(item.title ?? ''),
      price: String(item.price ?? '0'),
      currency: String(item.currency ?? 'EUR'),
      url: String(item.url ?? `https://www.vinted.${country}/items/${item.id}`),
      photo: photo ? {
        url: String(photo.url ?? photo.full_size_url ?? ''),
        dominant_color: photo.dominant_color ? String(photo.dominant_color) : undefined,
      } : null,
      description: String(item.description ?? ''),
      user: parseVintedUser(user),
      brand_title: item.brand_title ? String(item.brand_title) : undefined,
      size_title: item.size_title ? String(item.size_title) : undefined,
      status: item.status ? String(item.status) : undefined,
      country,
    }
  })

  return {
    items: listings,
    pagination: {
      current_page: Number(pagination.current_page ?? 1),
      total_pages: Number(pagination.total_pages ?? 1),
      total_entries: Number(pagination.total_entries ?? listings.length),
    },
  }
}

function parseVintedUser(user: Record<string, unknown>): VintedUser {
  return {
    id: String(user.id ?? ''),
    login: String(user.login ?? ''),
    // Vinted usa scala 0-1, convertiamo a 0-5
    feedback_reputation: Number(user.feedback_reputation ?? 0) * 5,
    feedback_count: Number(user.feedback_count ?? 0),
    item_count: user.item_count ? Number(user.item_count) : undefined,
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
