# Online Deal Finder — Guida Setup Completa

## Prerequisiti

- Node.js >= 18
- Account GitHub
- Account Vercel (free)
- Account Supabase (free)
- Account Anthropic (pay-per-use, ~$5 di credito iniziale)
- Telegram

---

## Step 1: Clona e configura

```bash
git clone https://github.com/TUO-USERNAME/vinted-scout.git
cd vinted-scout
npm install
cp .env.example .env.local
```

---

## Step 2: Setup Supabase

1. Vai su [supabase.com](https://supabase.com) → New Project
2. Nota: `Project URL` e `anon key` (Settings → API)
3. Nota anche: `service_role key` (Settings → API → Service Role)
4. Installa Supabase CLI: `npm install -g supabase`
5. Login: `supabase login`
6. Collega il progetto: `supabase link --project-ref TUO-PROJECT-REF`
7. Applica lo schema: `supabase db push`

### Crea l'utente admin

Vai su Supabase Dashboard → Authentication → Users → Add User:
- Email: la tua email
- Password: sicura

Poi in SQL Editor:
```sql
UPDATE public.profiles 
SET role = 'admin' 
WHERE email = 'tua@email.com';
```

---

## Step 3: Setup Telegram Bot

1. Apri Telegram, cerca `@BotFather`
2. Invia `/newbot`
3. Scegli un nome (es: "Online Deal Finder")
4. Scegli uno username (es: `vinted_scout_bot`)
5. Copia il **BOT_TOKEN** che ti viene dato
6. Copia `TELEGRAM_BOT_TOKEN` in `.env.local`

### Trova il tuo Chat ID
1. Avvia il bot su Telegram (cerca lo username che hai scelto)
2. Invia `/start`
3. Vai su: `https://api.telegram.org/botTUO_TOKEN/getUpdates`
4. Cerca il campo `"chat": {"id": XXXXXXXX}` — quel numero è il tuo chat_id
5. Inseriscilo nel tuo profilo utente nell'app

---

## Step 4: API Anthropic

1. Vai su [console.anthropic.com](https://console.anthropic.com)
2. API Keys → Create Key
3. Carica $5 di credito (durano mesi per uso personale)
4. Copia `ANTHROPIC_API_KEY` in `.env.local`

---

## Step 5: Test locale

```bash
npm run dev
```

Vai su `http://localhost:3000` → login con le credenziali Supabase.

### Test scan manuale
```bash
curl -X POST http://localhost:3000/api/scan \
  -H "Authorization: Bearer IL_TUO_CRON_SECRET"
```

---

## Step 6: Deploy su Vercel

1. Push su GitHub: `git push origin main`
2. Vai su [vercel.com](https://vercel.com) → New Project → importa repo
3. In Environment Variables, aggiungi TUTTE le variabili da `.env.example`
4. Deploy!
5. Copia l'URL del deployment (es: `https://vinted-scout.vercel.app`)

---

## Step 7: Setup GitHub Actions Cron

1. Vai su GitHub → repo → Settings → Secrets and variables → Actions
2. Aggiungi questi secrets:
   - `CRON_SECRET`: stesso valore di `.env.local`
   - `APP_URL`: URL Vercel (es: `https://vinted-scout.vercel.app`)
3. Vai su Actions → Abilita i workflow
4. Il cron partirà automaticamente ogni 15 minuti

### Test manuale del cron
Actions → "Online Deal Finder — Scan Cron" → Run workflow

---

## Step 8: Crea il primo Task

1. Login nell'app
2. Vai su /tasks → Nuovo Task
3. Esempio configurazione carte Pokémon:
   - Nome: "Carte Pokémon EX Rare"
   - Categoria: pokemon_cards
   - Keywords: `charizard ex`, `blastoise ex`, `venusaur ex`
   - Paesi: IT, FR, DE
   - Prezzo max: €50
   - Min. rating venditore: 4.5
   - Min. recensioni: 10
   - Score AI minimo: 7
   - Istruzioni AI extra: "Cerca soprattutto carte in Near Mint o Lightly Played. Priorità alle First Edition."

---

## Manutenzione

### Pulizia DB (ogni mese)
```sql
SELECT public.cleanup_old_seen_listings();
```

### Monitor costi AI
Controlla [console.anthropic.com](https://console.anthropic.com) → Usage

### Se Vinted blocca le richieste
- Aumenta `VINTED_REQUEST_DELAY_MS` a 5000
- Riduci `per_page` a 20 nel client
- I cookie si rinnovano automaticamente

---

## Struttura Costi (stima mensile)

| Servizio | Piano | Costo |
|----------|-------|-------|
| Vercel | Hobby (free) | €0 |
| Supabase | Free tier | €0 |
| GitHub Actions | Free tier | €0 |
| Anthropic Claude Haiku | ~500 analisi/mese | ~€0.50 |
| **TOTALE** | | **~€0.50/mese** |
