'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { COUNTRY_CONFIGS, ALL_COUNTRIES } from '@/lib/vinted/countries'
import type { TaskCategory, VintedCountry } from '@/types'

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: 'pokemon_cards', label: 'Carte Pokémon' },
  { value: 'sneakers', label: 'Sneakers' },
  { value: 'vintage_hifi', label: 'Hi-Fi Vintage' },
  { value: 'lego', label: 'LEGO' },
  { value: 'watches', label: 'Orologi' },
  { value: 'comics', label: 'Fumetti' },
  { value: 'general', label: 'Generico' },
]

const DEFAULT_FORM = {
  name: '',
  description: '',
  category: 'pokemon_cards' as TaskCategory,
  keywordsRaw: '',
  countries: ['it'] as VintedCountry[],
  price_min: '',
  price_max: '',
  min_seller_rating: '4.5',
  min_seller_reviews: '5',
  ai_score_threshold: '7',
  ai_prompt_extra: '',
  notify_telegram: true,
  scan_interval_minutes: '15',
}

export default function TaskFormModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set<K extends keyof typeof DEFAULT_FORM>(key: K, value: typeof DEFAULT_FORM[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleCountry(country: VintedCountry) {
    setForm(prev => ({
      ...prev,
      countries: prev.countries.includes(country)
        ? prev.countries.filter(c => c !== country)
        : [...prev.countries, country],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const keywords = form.keywordsRaw
      .split(',')
      .map(k => k.trim())
      .filter(Boolean)

    if (!keywords.length) { setError('Inserisci almeno una keyword'); return }
    if (!form.countries.length) { setError('Seleziona almeno un paese'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          category: form.category,
          keywords,
          countries: form.countries,
          price_min: form.price_min ? parseFloat(form.price_min) : null,
          price_max: form.price_max ? parseFloat(form.price_max) : null,
          min_seller_rating: parseFloat(form.min_seller_rating),
          min_seller_reviews: parseInt(form.min_seller_reviews),
          ai_score_threshold: parseInt(form.ai_score_threshold),
          ai_prompt_extra: form.ai_prompt_extra || null,
          notify_telegram: form.notify_telegram,
          scan_interval_minutes: parseInt(form.scan_interval_minutes),
        }),
      })

      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Errore creazione task'); return }

      setOpen(false)
      setForm(DEFAULT_FORM)
      router.refresh()
    } catch {
      setError('Errore di rete')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={16} />
        Nuovo task
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Nuovo task di ricerca" className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Base */}
          <div className="space-y-3">
            <Input
              id="name"
              label="Nome task *"
              placeholder="Es. Charizard Base Set"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
              disabled={loading}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-300">Descrizione</label>
              <textarea
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 resize-none text-sm"
                placeholder="Note opzionali sul task"
                rows={2}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-300">Categoria *</label>
              <select
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500/50 text-sm"
                value={form.category}
                onChange={e => set('category', e.target.value as TaskCategory)}
                disabled={loading}
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <hr className="border-gray-800" />

          {/* Ricerca */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ricerca</h3>
            <Input
              id="keywords"
              label="Keywords * (separate da virgola)"
              placeholder="Es. charizard, base set, 1st edition"
              value={form.keywordsRaw}
              onChange={e => set('keywordsRaw', e.target.value)}
              required
              disabled={loading}
            />
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-300">Paesi *</label>
              <div className="flex flex-wrap gap-2">
                {ALL_COUNTRIES.map(country => {
                  const cfg = COUNTRY_CONFIGS[country]
                  const selected = form.countries.includes(country)
                  return (
                    <button
                      key={country}
                      type="button"
                      onClick={() => toggleCountry(country)}
                      disabled={loading}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        selected
                          ? 'bg-green-600/30 border-green-500/50 text-green-400'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {cfg.flag} {cfg.code.toUpperCase()}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <hr className="border-gray-800" />

          {/* Filtri prezzo e venditore */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filtri</h3>
            <div className="grid grid-cols-2 gap-3">
              <Input
                id="price_min"
                label="Prezzo min (€)"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.price_min}
                onChange={e => set('price_min', e.target.value)}
                disabled={loading}
              />
              <Input
                id="price_max"
                label="Prezzo max (€)"
                type="number"
                min="0"
                step="0.01"
                placeholder="Nessun limite"
                value={form.price_max}
                onChange={e => set('price_max', e.target.value)}
                disabled={loading}
              />
              <Input
                id="min_seller_rating"
                label="Rating venditore min (0-5)"
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={form.min_seller_rating}
                onChange={e => set('min_seller_rating', e.target.value)}
                disabled={loading}
              />
              <Input
                id="min_seller_reviews"
                label="Recensioni venditore min"
                type="number"
                min="0"
                step="1"
                value={form.min_seller_reviews}
                onChange={e => set('min_seller_reviews', e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <hr className="border-gray-800" />

          {/* AI */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Analisi AI</h3>
            <Input
              id="ai_score_threshold"
              label="Score minimo per notificare (1-10)"
              type="number"
              min="1"
              max="10"
              step="1"
              value={form.ai_score_threshold}
              onChange={e => set('ai_score_threshold', e.target.value)}
              disabled={loading}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-300">Istruzioni extra per AI</label>
              <textarea
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 resize-none text-sm"
                placeholder="Es. Cerca solo carte in lingua italiana, ignora lotti"
                rows={3}
                value={form.ai_prompt_extra}
                onChange={e => set('ai_prompt_extra', e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <hr className="border-gray-800" />

          {/* Notifiche */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notifiche</h3>
            <div className="flex items-center gap-3">
              <input
                id="notify_telegram"
                type="checkbox"
                checked={form.notify_telegram}
                onChange={e => set('notify_telegram', e.target.checked)}
                disabled={loading}
                className="w-4 h-4 accent-green-500"
              />
              <label htmlFor="notify_telegram" className="text-sm text-gray-300">
                Notifiche Telegram
              </label>
            </div>
            <Input
              id="scan_interval_minutes"
              label="Intervallo scan (minuti)"
              type="number"
              min="5"
              max="1440"
              step="5"
              value={form.scan_interval_minutes}
              onChange={e => set('scan_interval_minutes', e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Annulla
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creazione…' : 'Crea task'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
