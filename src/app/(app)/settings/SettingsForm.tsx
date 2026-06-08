'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
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
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveSuccess(false)
    setError('')
    setTestResult(null)

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

      setSaveSuccess(true)
      router.refresh()
    } catch {
      setError('Errore di rete')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    setError('')

    try {
      const res = await fetch('/api/users/telegram-test', { method: 'POST' })
      const json = await res.json()

      if (res.ok) {
        setTestResult({ ok: true, msg: 'Messaggio inviato! Controlla Telegram.' })
        router.refresh()
      } else {
        setTestResult({ ok: false, msg: json.error ?? 'Test fallito' })
      }
    } catch {
      setTestResult({ ok: false, msg: 'Errore di rete' })
    } finally {
      setTesting(false)
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
        disabled={saving}
      />

      <div className="space-y-2">
        <Input
          id="telegram_chat_id"
          label="Telegram Chat ID"
          placeholder="Es. 123456789"
          value={telegramChatId}
          onChange={e => { setTelegramChatId(e.target.value); setSaveSuccess(false); setTestResult(null) }}
          disabled={saving || testing}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleTest}
          disabled={saving || testing || !telegramChatId.trim()}
        >
          {testing
            ? <Loader2 size={14} className="animate-spin" />
            : <Send size={14} />
          }
          {testing ? 'Invio…' : 'Testa connessione'}
        </Button>
      </div>

      {testResult && (
        <p className={`text-xs px-3 py-2 rounded-lg border ${
          testResult.ok
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {testResult.msg}
        </p>
      )}

      {saveSuccess && (
        <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
          Salvato.
        </p>
      )}
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <Button type="submit" size="sm" disabled={saving || testing}>
        {saving ? <><Loader2 size={14} className="animate-spin" /> Salvataggio…</> : 'Salva'}
      </Button>
    </form>
  )
}
