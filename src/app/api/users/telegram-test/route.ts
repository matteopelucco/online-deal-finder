import { NextResponse } from 'next/server'
import { createClient } from '@/lib/db/client'
import { sendTestMessage } from '@/lib/notifications/telegram'

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', user.id)
    .single()

  if (!profile?.telegram_chat_id) {
    return NextResponse.json({ error: 'Nessun Chat ID configurato. Salvalo prima di testare.' }, { status: 400 })
  }

  const result = await sendTestMessage(profile.telegram_chat_id)

  if (!result.success) {
    return NextResponse.json(
      { error: `Telegram ha risposto con un errore: ${result.error}` },
      { status: 400 }
    )
  }

  // Segna l'utente come verificato dopo il primo test riuscito
  await supabase
    .from('profiles')
    .update({ telegram_verified: true })
    .eq('id', user.id)

  return NextResponse.json({ success: true })
}
