import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/db/client'
import type { Task } from '@/types'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Il nome è obbligatorio' }, { status: 400 })
  }
  if (!body.keywords?.length) {
    return NextResponse.json({ error: 'Almeno una keyword è obbligatoria' }, { status: 400 })
  }
  if (!body.countries?.length) {
    return NextResponse.json({ error: 'Seleziona almeno un paese' }, { status: 400 })
  }

  const taskData: Partial<Task> = {
    user_id: user.id,
    name: body.name.trim(),
    description: body.description?.trim() || null,
    is_active: true,
    category: body.category ?? 'general',
    keywords: body.keywords,
    countries: body.countries,
    price_min: body.price_min ? Number(body.price_min) : null,
    price_max: body.price_max ? Number(body.price_max) : null,
    min_seller_rating: Number(body.min_seller_rating ?? 4.5),
    min_seller_reviews: Number(body.min_seller_reviews ?? 5),
    ai_score_threshold: Number(body.ai_score_threshold ?? 7),
    ai_prompt_extra: body.ai_prompt_extra?.trim() || null,
    notify_telegram: body.notify_telegram ?? true,
    scan_interval_minutes: Number(body.scan_interval_minutes ?? 15),
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
