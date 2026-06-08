-- Aggiunge il criterio di filtraggio per numero minimo di preferiti
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS min_favourites INTEGER NOT NULL DEFAULT 0;
