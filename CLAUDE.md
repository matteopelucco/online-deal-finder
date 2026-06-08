# CLAUDE.md — Online Deal Finder: Specifiche per Claude Code

## Panoramica Progetto

**Online Deal Finder** è un'applicazione Next.js che monitora Vinted in modo avanzato, usando AI per valutare oggetti di interesse e notificando l'utente via Telegram.

Stack: Next.js 14 (App Router) · TypeScript · Supabase · Vercel · Claude API (Haiku) · Telegram Bot API

---

## Architettura

```
vinted-scout/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── api/
│   │   │   ├── auth/               # Login/logout endpoints
│   │   │   ├── tasks/              # CRUD task di ricerca
│   │   │   ├── scan/               # Endpoint chiamato da cron
│   │   │   │   └── route.ts        # POST /api/scan → esegue tutti i task attivi
│   │   │   ├── alerts/             # Storico notifiche
│   │   │   ├── admin/              # Gestione utenti (solo admin)
│   │   │   └── users/              # Profilo utente
│   │   ├── dashboard/              # Pagina principale (risultati recenti)
│   │   ├── tasks/                  # Lista e creazione task
│   │   ├── admin/                  # Pannello admin
│   │   └── login/                  # Pagina login
│   ├── components/
│   │   ├── ui/                     # Componenti base (Button, Input, Card, Badge, Modal)
│   │   ├── dashboard/              # AlertCard, AlertFeed, StatsBar
│   │   ├── tasks/                  # TaskForm, TaskCard, TaskList
│   │   └── alerts/                 # AlertDetail, TelegramPreview
│   ├── lib/
│   │   ├── vinted/
│   │   │   ├── client.ts           # Wrapper API Vinted non-ufficiale
│   │   │   ├── search.ts           # Logica di ricerca multi-paese
│   │   │   ├── types.ts            # Tipi Vinted (Listing, User, etc.)
│   │   │   └── countries.ts        # Domini e configurazione per paese
│   │   ├── ai/
│   │   │   ├── analyzer.ts         # Analisi listing con Claude Haiku
│   │   │   ├── prompts.ts          # Prompt templates per categoria
│   │   │   └── types.ts            # AnalysisResult, ScoreBreakdown
│   │   ├── notifications/
│   │   │   ├── telegram.ts         # Invio messaggi Telegram
│   │   │   └── formatter.ts        # Formatta messaggi con foto e dettagli
│   │   └── db/
│   │       ├── client.ts           # Supabase client
│   │       ├── tasks.ts            # Query per tasks
│   │       ├── listings.ts         # Query per listings visti
│   │       └── alerts.ts           # Query per alert inviati
│   ├── types/
│   │   └── index.ts                # Tipi globali condivisi
│   └── hooks/
│       ├── useTasks.ts
│       └── useAlerts.ts
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  # Schema completo DB
├── docs/
│   ├── SETUP.md                    # Guida setup completa
│   ├── VINTED_API.md               # Documentazione API Vinted non-ufficiale
│   └── DEPLOYMENT.md               # Deploy su Vercel
├── .github/
│   └── workflows/
│       └── scan-cron.yml           # GitHub Actions cron job (ogni 15 min)
├── .env.example                    # Template variabili d'ambiente
├── CLAUDE.md                       # Questo file
└── package.json
```

---

## Database Schema (Supabase)

Vedi `supabase/migrations/001_initial_schema.sql` per lo schema completo.

### Tabelle principali

**`profiles`** — estende auth.users di Supabase
- `id` (uuid, FK auth.users)
- `email` (text)
- `role` (text: 'admin' | 'user')
- `telegram_chat_id` (text, nullable) — ID chat Telegram per notifiche
- `telegram_verified` (boolean)
- `is_active` (boolean)
- `created_at`, `updated_at`

**`tasks`** — task di ricerca configurati dall'utente
- `id` (uuid)
- `user_id` (uuid, FK profiles)
- `name` (text) — nome descrittivo, es. "Carte Pokémon EX rare"
- `is_active` (boolean)
- `category` (text) — categoria Vinted, es. "pokemon_cards"
- `keywords` (text[]) — array di parole chiave
- `countries` (text[]) — array paesi: ['it','fr','de','es','pl','be','nl']
- `price_min` (numeric, nullable)
- `price_max` (numeric, nullable)
- `min_seller_rating` (numeric) — default 4.5
- `min_seller_reviews` (integer) — default 10
- `ai_score_threshold` (integer) — default 7, score minimo per notificare (1-10)
- `ai_prompt_extra` (text, nullable) — istruzioni extra per l'AI
- `notify_telegram` (boolean) — default true
- `scan_interval_minutes` (integer) — default 15
- `last_scan_at` (timestamptz)
- `created_at`, `updated_at`

**`seen_listings`** — deduplicazione
- `id` (uuid)
- `task_id` (uuid, FK tasks)
- `vinted_id` (text) — ID listing su Vinted
- `country` (text)
- `first_seen_at` (timestamptz)
- UNIQUE(task_id, vinted_id, country)

**`alerts`** — notifiche inviate
- `id` (uuid)
- `task_id` (uuid, FK tasks)
- `user_id` (uuid, FK profiles)
- `vinted_id` (text)
- `country` (text)
- `listing_data` (jsonb) — snapshot del listing
- `ai_score` (integer)
- `ai_analysis` (text)
- `ai_reasoning` (text)
- `price` (numeric)
- `telegram_sent` (boolean)
- `telegram_message_id` (text, nullable)
- `created_at`

---

## Logica di Scan (src/lib/vinted/ e src/app/api/scan/)

### Flusso principale `POST /api/scan`

```
1. Autenticazione via CRON_SECRET header
2. Carica tutti i task attivi da DB (is_active = true)
3. Per ogni task:
   a. Verifica se è ora di scansionare (last_scan_at + interval)
   b. Per ogni paese nella lista:
      - Chiama Vinted API con keywords + filtri
      - Filtra per prezzo min/max
      - Filtra per seller rating >= min_seller_rating
      - Filtra per seller reviews >= min_seller_reviews
   c. Deduplicazione: escludi listing già visti (seen_listings)
   d. Per ogni listing NUOVO:
      - Se supera pre-filtri → chiama AI analyzer
      - Se AI score >= threshold → crea alert e invia Telegram
   e. Aggiorna last_scan_at
4. Ritorna summary: {tasksScanned, newListings, alertsSent}
```

### Client Vinted (`src/lib/vinted/client.ts`)

Usa le API interne di Vinted (reverse engineered). Vinted non ha API pubbliche ufficiali.

```typescript
// Endpoint base per paese
const BASE_URLS = {
  it: 'https://www.vinted.it',
  fr: 'https://www.vinted.fr',
  de: 'https://www.vinted.de',
  es: 'https://www.vinted.es',
  pl: 'https://www.vinted.pl',
  be: 'https://www.vinted.be',
  nl: 'https://www.vinted.nl',
  uk: 'https://www.vinted.co.uk',
}

// Endpoint di ricerca
// GET /api/v2/catalog/items?search_text=...&price_from=...&price_to=...&order=newest_first&per_page=96
// Header richiesti: Cookie (session), User-Agent browser realistico
```

**IMPORTANTE**: Vinted usa cookie di sessione. Implementa un sistema di cookie refresh:
1. Al primo avvio, ottenere i cookie con una richiesta GET alla homepage
2. Salvare i cookie in Supabase (tabella `vinted_sessions`)
3. Usare i cookie nelle richieste di ricerca
4. In caso di 401/403, refreshare i cookie automaticamente

Rate limiting: MAX 1 richiesta ogni 2 secondi per paese. Usa delay tra le richieste.

### AI Analyzer (`src/lib/ai/analyzer.ts`)

Usa **Claude claude-haiku-4-5-20251001** (il più economico). Analizza ogni listing PRIMA di notificare.

```typescript
interface AnalysisResult {
  score: number;        // 1-10
  reasoning: string;   // 2-3 frasi perché è interessante
  highlights: string[]; // punti chiave (max 3)
  warnings: string[];   // segnali negativi (venditori dubbi, prezzo anomalo, etc.)
  investment_value: 'high' | 'medium' | 'low' | 'skip';
}
```

Il prompt AI riceve:
- Titolo e descrizione del listing
- Prezzo e paese
- Rating e numero recensioni del venditore
- Foto (URL, analisi visiva se il modello lo supporta)
- Contesto categoria (es. "Carte Pokémon da collezione/investimento")
- Istruzioni extra del task (`ai_prompt_extra`)

---

## Notifiche Telegram (`src/lib/notifications/telegram.ts`)

### Setup Bot
1. Creare bot con @BotFather su Telegram
2. Ottenere `BOT_TOKEN`
3. L'utente avvia il bot e invia `/start` → il bot registra il `chat_id`
4. Salvare `telegram_chat_id` nel profilo utente

### Formato messaggio
```
🎯 [NOME TASK] — Score: 9/10

📦 Titolo listing
💶 €XX.XX · 🌍 IT

⭐ Venditore: 4.9/5 (234 rec.)

🤖 Analisi AI:
[reasoning breve]

✅ Punti di forza:
• punto 1
• punto 2

🔗 [Vedi su Vinted](link)
```

Con foto allegata come immagine se disponibile.

### Webhook per registrazione chat_id
`POST /api/users/telegram-connect` — L'utente inserisce il proprio username Telegram, il sistema invia un codice di verifica, l'utente lo conferma.

---

## Autenticazione (Supabase Auth)

- Login con email/password via Supabase Auth
- Middleware Next.js per proteggere tutte le route (eccetto `/login`)
- Ruoli: `admin` può vedere tutti gli utenti, creare/disabilitare account
- Admin iniziale: creato via script di seed (`supabase/seed.sql`)

---

## Frontend

### Design System
- Tailwind CSS + shadcn/ui components
- Tema: dark mode by default, colori accent verde (#22c55e) per score alti, giallo per medi, rosso per bassi
- Font: Inter (system)

### Pagine

**`/dashboard`** — Home dopo login
- Feed degli ultimi alert ricevuti (tutti i task)
- Stats bar: alert oggi, oggetti scansionati, task attivi
- Quick filters per task e score minimo

**`/tasks`** — Gestione task
- Lista task con status (attivo/pausa) e stats (ultimo scan, alert totali)
- Bottone "Nuovo Task" → modal/drawer con form completo
- Ogni task: edit, pausa/attiva, elimina, "Scan ora" (manual trigger)

**`/tasks/[id]`** — Dettaglio task
- Configurazione completa
- Storico alert del task
- Grafico alert nel tempo (semplice, con recharts)

**`/admin`** — Solo admin
- Lista utenti con status e statistiche
- Crea utente, disabilita/abilita, reset password
- Overview globale: tutti i task, tutti gli alert

**`/login`** — Login form

---

## Variabili d'Ambiente

Vedi `.env.example` per la lista completa. Principali:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Claude API
ANTHROPIC_API_KEY=

# Telegram
TELEGRAM_BOT_TOKEN=

# Sicurezza cron
CRON_SECRET=                    # Token segreto per autenticare le chiamate cron

# Vinted (opzionale, per session management avanzato)
VINTED_SESSION_REFRESH_INTERVAL=3600  # secondi
```

---

## Cron Job (GitHub Actions)

Il file `.github/workflows/scan-cron.yml` esegue ogni 15 minuti:
```
POST https://{VERCEL_APP_URL}/api/scan
Authorization: Bearer {CRON_SECRET}
```

**Alternativa**: Vercel Cron Jobs (free tier: 1 esecuzione/giorno — insufficiente).
GitHub Actions è gratuito fino a 2000 min/mese → 15 min interval = ~2880 chiamate/mese → OK se ogni run dura < 40 secondi.

---

## Ordine di Sviluppo Consigliato (Milestone)

### M1 — Foundation (2-3 ore)
1. Setup Next.js + Supabase + Tailwind
2. Schema DB + migration
3. Auth (login, middleware, profili)
4. Layout base + navigazione

### M2 — Vinted Client (2-3 ore)
5. Client Vinted con cookie management
6. Ricerca base (1 paese, 1 keyword)
7. Test ricerca manuale via API route

### M3 — Task Management (1-2 ore)
8. CRUD task (API + UI)
9. Form task con tutti i campi
10. Visualizzazione task list

### M4 — Scan Engine (2-3 ore)
11. Pipeline scan completa
12. Deduplicazione
13. Pre-filtri (prezzo, venditore)
14. Test scan manuale

### M5 — AI Analysis (1-2 ore)
15. Integrazione Claude Haiku
16. Prompt per categoria "carte Pokémon"
17. Scoring e salvataggio in DB

### M6 — Notifiche (1 ora)
18. Telegram bot setup
19. Invio notifiche con foto
20. Verifica chat_id utente

### M7 — Dashboard & Polish (2 ore)
21. Feed alert dashboard
22. Stats e grafici
23. Admin panel
24. Deploy Vercel + GitHub Actions cron

---

## Note Importanti per l'Implementazione

### Vinted API — Dettagli Tecnici
Le API Vinted non sono documentate ufficialmente. Comportamento osservato:
- Endpoint: `GET /api/v2/catalog/items`
- Query params: `search_text`, `catalog_ids`, `price_from`, `price_to`, `currency`, `order` (newest_first), `per_page` (max 96)
- La risposta include `items[]` con: `id`, `title`, `price`, `currency`, `url`, `photo`, `user` (con `feedback_reputation` e `feedback_count`)
- I cookie necessari si ottengono con una GET alla homepage + seguendo i redirect
- User-Agent: usare un UA di browser reale (Chrome/Firefox)
- Se bloccati: implementare retry con backoff esponenziale

### AI Cost Control
- Eseguire l'AI SOLO sui listing che superano i pre-filtri (prezzo, venditore)
- Stimare: 5-10% dei listing supera i pre-filtri → risparmio 90-95% tokens
- Cache: se lo stesso listing appare in più paesi, analizzarlo una volta sola
- Log dei costi AI in DB per monitoraggio

### Errori Comuni da Evitare
- NON usare `export default` in route.ts di Next.js App Router (usare named exports: `export async function GET`, `export async function POST`)
- I Server Components non possono usare hooks React
- Supabase service role key NON deve mai andare in client-side code
- Il cron job deve essere idempotente (safe to retry)

---

## Comandi Utili

```bash
# Setup
npm install
cp .env.example .env.local
# Compilare le env con i valori reali

# Database
npx supabase db push   # applica migrazioni
npx supabase db seed   # crea admin iniziale

# Dev
npm run dev

# Test scan manuale
curl -X POST http://localhost:3000/api/scan \
  -H "Authorization: Bearer $CRON_SECRET"

# Build
npm run build
```
