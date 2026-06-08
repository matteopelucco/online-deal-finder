// ============================================================
// Online Deal Finder — Tipi globali
// ============================================================

export type UserRole = 'admin' | 'user'
export type InvestmentValue = 'high' | 'medium' | 'low' | 'skip'
export type TaskCategory = 'pokemon_cards' | 'sneakers' | 'vintage_hifi' | 'lego' | 'watches' | 'comics' | 'general'
export type VintedCountry = 'it' | 'fr' | 'de' | 'es' | 'pl' | 'be' | 'nl' | 'uk' | 'pt' | 'at' | 'cz'

// ---- Database types ----

export interface Profile {
  id: string
  email: string
  role: UserRole
  display_name: string | null
  telegram_chat_id: string | null
  telegram_verified: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  user_id: string
  name: string
  description: string | null
  is_active: boolean
  category: TaskCategory
  keywords: string[]
  countries: VintedCountry[]
  price_min: number | null
  price_max: number | null
  min_seller_rating: number
  min_seller_reviews: number
  min_favourites: number
  ai_score_threshold: number
  ai_prompt_extra: string | null
  notify_telegram: boolean
  scan_interval_minutes: number
  scan_schedule: string | null
  last_scan_at: string | null
  total_scans: number
  total_alerts: number
  created_at: string
  updated_at: string
}

export interface Alert {
  id: string
  task_id: string
  user_id: string
  vinted_id: string
  country: VintedCountry
  listing_title: string
  listing_price: number
  listing_currency: string
  listing_url: string
  listing_photo_url: string | null
  listing_description: string | null
  seller_id: string | null
  seller_username: string | null
  seller_rating: number | null
  seller_reviews: number | null
  ai_score: number | null
  ai_reasoning: string | null
  ai_highlights: string[] | null
  ai_warnings: string[] | null
  ai_investment_value: InvestmentValue | null
  telegram_sent: boolean
  telegram_message_id: string | null
  telegram_sent_at: string | null
  created_at: string
  // Relations (joined)
  task?: Task
}

// ---- Vinted API types ----

export interface VintedListing {
  id: string
  title: string
  price: string        // valore numerico come stringa, es. "12.50"
  price_numeric: number
  currency: string
  url: string
  photo: {
    url: string
    dominant_color?: string
  } | null
  description: string
  user: VintedUser
  favourite_count: number
  brand_title?: string
  size_title?: string
  status?: string
  country: VintedCountry
}

export interface VintedUser {
  id: string
  login: string
  feedback_reputation: number
  feedback_count: number
  item_count?: number
  /** false quando Vinted non include i dati di reputazione nella risposta catalog */
  reputation_available: boolean
}

export interface VintedSearchParams {
  search_text: string
  price_from?: number
  price_to?: number
  order?: 'newest_first' | 'price_asc' | 'price_desc'
  per_page?: number
  page?: number
}

export interface VintedSearchResult {
  items: VintedListing[]
  pagination: {
    current_page: number
    total_pages: number
    total_entries: number
  }
  /** Debug: struttura raw del primo item (solo diagnostica) */
  _rawDebug?: {
    price_raw: unknown
    price_numeric_raw: unknown
    user_keys: string[]
    rep_raw: unknown
    count_raw: unknown
    root_keys: string[]
  }
}

// ---- AI types ----

export interface AnalysisResult {
  score: number
  reasoning: string
  highlights: string[]
  warnings: string[]
  investment_value: InvestmentValue
}

// ---- Scan types ----

export interface ScanSummary {
  tasks_scanned: number
  listings_found: number
  listings_new: number
  listings_analyzed: number
  alerts_sent: number
  errors: string[]
  duration_ms: number
}

export interface ListingDetail {
  id: string
  title: string
  price: string
  price_numeric: number
  url: string
  seller_rating: number
  seller_reviews: number
  seller_reputation_available: boolean
  favourite_count: number
  passed_filter: boolean
  filter_reason?: string
  ai_score?: number
  ai_investment_value?: InvestmentValue
}

export interface CountryLog {
  country: string
  flag: string
  status: 'ok' | 'error'
  listings_found: number
  listings_new: number
  listings_qualified: number
  listings_analyzed: number
  alerts_created: number
  error?: string
  duration_ms: number
  listings?: ListingDetail[]
}

// ---- API Response types ----

export interface ApiResponse<T> {
  data?: T
  error?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  per_page: number
}
