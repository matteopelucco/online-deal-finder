'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/db/client-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Email o password non corretti.'
        : error.message)
      setLoading(false)
    } else {
      router.push(redirectTo)
      router.refresh()
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-white">Online Deal Finder</h1>
        <p className="text-sm text-gray-500 mt-1">Accedi al pannello di controllo</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="email"
          type="email"
          label="Email"
          placeholder="tua@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={loading}
        />

        <Input
          id="password"
          type="password"
          label="Password"
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          disabled={loading}
        />

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full"
          size="lg"
        >
          {loading ? 'Accesso in corso…' : 'Accedi'}
        </Button>
      </form>
    </div>
  )
}
