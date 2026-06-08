import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/db/client'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, telegram_chat_id, telegram_verified, role, is_active')
    .eq('id', user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Solo questi campi sono modificabili dall'utente
  const allowed: Record<string, unknown> = {}
  if ('display_name' in body) allowed.display_name = body.display_name?.trim() || null
  if ('telegram_chat_id' in body) {
    allowed.telegram_chat_id = body.telegram_chat_id?.trim() || null
    // Resetta la verifica quando cambia il chat_id
    allowed.telegram_verified = false
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'Nessun campo valido da aggiornare' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(allowed)
    .eq('id', user.id)
    .select('id, email, display_name, telegram_chat_id, telegram_verified')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
