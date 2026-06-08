'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Profile } from '@/types'

interface SettingsFormProps {
  profile: Profile
}

export default function SettingsForm({ profile }: SettingsFormProps) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState(profile.display_name ?? '')
  const [telegramChatId, setTelegramChatId] = useState(profile.telegram_chat_id ?? '')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setSuccess(false)
    setError('')

    try {
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName || null,
          telegram_chat_id: telegramChatId || null,
        }),
      })

      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Errore salvataggio'); return }

      setSuccess(true)
      router.refresh()
    } catch {
      setError('Errore di rete')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        id="display_name"
        label="Nome visualizzato"
        placeholder="Il tuo nome"
        value={displayName}
        onChange={e => setDisplayName(e.target.value)}
        disabled={loading}
      />
      <Input
        id="telegram_chat_id"
        label="Telegram Chat ID"
        placeholder="Es. 123456789"
        value={telegramChatId}
        onChange={e => { setTelegramChatId(e.target.value); setSuccess(false) }}
        disabled={loading}
      />

      {success && (
        <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          Salvato. Telegram attivo — riceverai le prossime notifiche.
        </p>
      )}
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <Button type="submit" size="sm" disabled={loading}>
        {loading ? 'Salvataggio…' : 'Salva'}
      </Button>
    </form>
  )
}
