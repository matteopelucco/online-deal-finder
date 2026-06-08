-- Aggiunge l'espressione CRON per definire quando il task può essere scansionato
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS scan_schedule TEXT DEFAULT NULL;
