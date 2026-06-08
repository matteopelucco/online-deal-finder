-- ============================================================
-- Online Deal Finder — Schema iniziale
-- Eseguire con: npx supabase db push
-- ============================================================

-- Estensioni necessarie
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES — estende auth.users di Supabase
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  display_name  TEXT,
  telegram_chat_id    TEXT,
  telegram_verified   BOOLEAN NOT NULL DEFAULT false,
  telegram_verify_code TEXT,
  telegram_verify_expires_at TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger per aggiornare updated_at automaticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger per creare profilo automaticamente alla registrazione
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- TASKS — task di ricerca configurati dall'utente
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  category              TEXT NOT NULL DEFAULT 'general',
                        -- es: 'pokemon_cards', 'sneakers', 'vintage_hifi', 'general'
  keywords              TEXT[] NOT NULL DEFAULT '{}',
  countries             TEXT[] NOT NULL DEFAULT '{it}',
                        -- valori: it, fr, de, es, pl, be, nl, uk, pt, at, cz
  price_min             NUMERIC(10,2),
  price_max             NUMERIC(10,2),
  min_seller_rating     NUMERIC(3,2) NOT NULL DEFAULT 4.5,
                        -- 0-5 (Vinted usa scala 0-5)
  min_seller_reviews    INTEGER NOT NULL DEFAULT 5,
  ai_score_threshold    INTEGER NOT NULL DEFAULT 7 CHECK (ai_score_threshold BETWEEN 1 AND 10),
  ai_prompt_extra       TEXT,
                        -- istruzioni aggiuntive per l'AI, specifiche per il task
  notify_telegram       BOOLEAN NOT NULL DEFAULT true,
  scan_interval_minutes INTEGER NOT NULL DEFAULT 15,
  last_scan_at          TIMESTAMPTZ,
  total_scans           INTEGER NOT NULL DEFAULT 0,
  total_alerts          INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX idx_tasks_is_active ON public.tasks(is_active);

-- ============================================================
-- SEEN_LISTINGS — deduplicazione listing già processati
-- ============================================================
CREATE TABLE IF NOT EXISTS public.seen_listings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id         UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  vinted_id       TEXT NOT NULL,
  country         TEXT NOT NULL,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, vinted_id, country)
);

CREATE INDEX idx_seen_listings_task_id ON public.seen_listings(task_id);
CREATE INDEX idx_seen_listings_first_seen ON public.seen_listings(first_seen_at);

-- Pulizia automatica listing visti più vecchi di 30 giorni
-- (evita che la tabella cresca indefinitamente)
CREATE OR REPLACE FUNCTION public.cleanup_old_seen_listings()
RETURNS void AS $$
BEGIN
  DELETE FROM public.seen_listings
  WHERE first_seen_at < now() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ALERTS — notifiche inviate all'utente
-- ============================================================
CREATE TABLE IF NOT EXISTS public.alerts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id             UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vinted_id           TEXT NOT NULL,
  country             TEXT NOT NULL,

  -- Snapshot del listing al momento del rilevamento
  listing_title       TEXT NOT NULL,
  listing_price       NUMERIC(10,2) NOT NULL,
  listing_currency    TEXT NOT NULL DEFAULT 'EUR',
  listing_url         TEXT NOT NULL,
  listing_photo_url   TEXT,
  listing_description TEXT,

  -- Dati venditore
  seller_id           TEXT,
  seller_username     TEXT,
  seller_rating       NUMERIC(3,2),
  seller_reviews      INTEGER,

  -- Analisi AI
  ai_score            INTEGER CHECK (ai_score BETWEEN 1 AND 10),
  ai_reasoning        TEXT,
  ai_highlights       TEXT[],
  ai_warnings         TEXT[],
  ai_investment_value TEXT CHECK (ai_investment_value IN ('high', 'medium', 'low', 'skip')),

  -- Notifica
  telegram_sent       BOOLEAN NOT NULL DEFAULT false,
  telegram_message_id TEXT,
  telegram_sent_at    TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_user_id ON public.alerts(user_id);
CREATE INDEX idx_alerts_task_id ON public.alerts(task_id);
CREATE INDEX idx_alerts_created_at ON public.alerts(created_at DESC);
CREATE INDEX idx_alerts_ai_score ON public.alerts(ai_score DESC);

-- ============================================================
-- VINTED_SESSIONS — gestione cookie di sessione Vinted
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vinted_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country     TEXT NOT NULL UNIQUE,
  cookies     TEXT NOT NULL,  -- JSON serializzato dei cookie
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ
);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seen_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vinted_sessions ENABLE ROW LEVEL SECURITY;

-- Funzione helper: SECURITY DEFINER bypassa RLS su profiles,
-- evitando la ricorsione infinita nelle policy delle altre tabelle.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Profiles: utente vede solo il proprio profilo; admin vede tutti
CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_admin_read" ON public.profiles
  FOR SELECT USING (public.is_admin());

CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Tasks: utente gestisce solo i propri; admin gestisce tutti
CREATE POLICY "tasks_own" ON public.tasks
  FOR ALL USING (user_id = auth.uid() OR public.is_admin());

-- Seen listings: seguono i permessi del task
CREATE POLICY "seen_listings_own" ON public.seen_listings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = seen_listings.task_id
      AND (tasks.user_id = auth.uid() OR public.is_admin())
    )
  );

-- Alerts: utente vede solo i propri; admin vede tutti
CREATE POLICY "alerts_own" ON public.alerts
  FOR ALL USING (user_id = auth.uid() OR public.is_admin());

-- Vinted sessions: solo service role (no accesso utente diretto)
CREATE POLICY "vinted_sessions_service_only" ON public.vinted_sessions
  FOR ALL USING (false);  -- Accessibile solo via service role key

-- ============================================================
-- SEED: Admin iniziale
-- Dopo il push, esegui il seed separato o crea manualmente
-- l'utente admin dalla Supabase Dashboard e assegna role='admin'
-- ============================================================
