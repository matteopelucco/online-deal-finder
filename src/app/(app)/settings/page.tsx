import { createClient } from '@/lib/db/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import SettingsForm from './SettingsForm'
import type { Profile } from '@/types'

export const metadata = {
  title: 'Impostazioni — Vinted Scout',
}

export default async function SettingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, display_name, telegram_chat_id, telegram_verified, role, is_active')
    .eq('id', user.id)
    .single()

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Impostazioni</h1>
        <p className="text-sm text-gray-500 mt-1">Profilo e configurazione notifiche</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-300">Profilo</h2>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-gray-600 mb-4">{profile?.email}</p>
          <SettingsForm profile={profile as Profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-300">Telegram</h2>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="text-xs text-gray-500 space-y-1.5 bg-gray-800/50 rounded-lg p-3 border border-gray-800">
            <p className="font-medium text-gray-400">Come trovare il tuo Chat ID:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Apri Telegram e cerca <span className="text-gray-300">@userinfobot</span></li>
              <li>Invia <span className="text-gray-300">/start</span></li>
              <li>Il bot risponde con il tuo Chat ID numerico</li>
              <li>Incollalo qui sotto e salva</li>
            </ol>
          </div>

          {profile?.telegram_verified && (
            <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
              Telegram verificato e attivo
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
