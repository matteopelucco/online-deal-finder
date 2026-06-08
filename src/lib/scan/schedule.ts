import { CronExpressionParser } from 'cron-parser'

export interface CronPreset {
  label: string
  value: string
  description: string
}

export const CRON_PRESETS: CronPreset[] = [
  { label: 'Giorno intero', value: '*/15 6-23 * * *', description: 'Ogni 15 min, dalle 6:00 alle 23:00' },
  { label: 'Orario lavorativo', value: '*/15 8-20 * * *', description: 'Ogni 15 min, dalle 8:00 alle 20:00' },
  { label: 'Lun–Ven', value: '*/15 8-20 * * 1-5', description: 'Ogni 15 min, lun–ven, 8:00–20:00' },
  { label: 'Ogni ora', value: '0 8-22 * * *', description: 'Ogni ora in punto, dalle 8:00 alle 22:00' },
  { label: 'Sempre', value: '*/15 * * * *', description: 'Ogni 15 minuti, 24h/7gg' },
]

/**
 * Controlla se il task dovrebbe essere scansionato ora in base allo schedule CRON.
 *
 * Logica: trova l'ultima occorrenza del cron prima di adesso.
 * Se l'ultimo scan è avvenuto DOPO quella occorrenza, il task è già stato
 * scansionato in questa finestra → skip. Altrimenti → scan.
 */
export function isScheduledNow(cronExpr: string, lastScanAt: string | null): boolean {
  try {
    const interval = CronExpressionParser.parse(cronExpr)
    const prevOccurrence = interval.prev().toDate().getTime()

    if (lastScanAt && new Date(lastScanAt).getTime() >= prevOccurrence) {
      return false // già scansionato dopo l'ultima occorrenza programmata
    }
    return true
  } catch {
    return true // espressione non valida → permetti scan
  }
}

/**
 * Valida un'espressione CRON. Ritorna il messaggio di errore o null se valida.
 */
export function validateCron(expr: string): string | null {
  if (!expr.trim()) return null
  try {
    CronExpressionParser.parse(expr)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Espressione CRON non valida'
  }
}

/**
 * Descrive in linguaggio naturale un'espressione CRON (best-effort).
 */
export function describeCron(expr: string): string {
  const preset = CRON_PRESETS.find(p => p.value === expr)
  if (preset) return preset.description

  try {
    CronExpressionParser.parse(expr)
    return 'Schedule personalizzato'
  } catch {
    return 'Espressione non valida'
  }
}
