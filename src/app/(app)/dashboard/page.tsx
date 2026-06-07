import { createClient } from '@/lib/db/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bell, ScanLine, ListTodo } from 'lucide-react'

export const metadata = {
  title: 'Dashboard — Vinted Scout',
}

async function getStats(userId: string) {
  const supabase = createClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [alertsToday, activeTasks] = await Promise.all([
    supabase
      .from('alerts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', today.toISOString()),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true),
  ])

  return {
    alertsToday: alertsToday.count ?? 0,
    activeTasks: activeTasks.count ?? 0,
  }
}

async function getRecentAlerts(userId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('alerts')
    .select('id, listing_title, listing_price, listing_currency, country, ai_score, ai_investment_value, created_at, tasks(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)

  return data ?? []
}

function scoreVariant(score: number | null): 'high' | 'mid' | 'low' | 'default' {
  if (!score) return 'default'
  if (score >= 8) return 'high'
  if (score >= 5) return 'mid'
  return 'low'
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const [stats, alerts] = await Promise.all([
    getStats(user.id),
    getRecentAlerts(user.id),
  ])

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Ultimi alert e statistiche di oggi</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Bell size={20} className="text-green-400 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-white">{stats.alertsToday}</p>
              <p className="text-xs text-gray-500">Alert oggi</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <ListTodo size={20} className="text-green-400 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-white">{stats.activeTasks}</p>
              <p className="text-xs text-gray-500">Task attivi</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <ScanLine size={20} className="text-green-400 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-white">15 min</p>
              <p className="text-xs text-gray-500">Intervallo scan</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent alerts */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Alert recenti
        </h2>

        {alerts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Bell size={32} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Nessun alert ancora.</p>
              <p className="text-gray-600 text-xs mt-1">
                Crea un task di ricerca per iniziare il monitoraggio.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {alerts.map((alert: any) => (
              <Card key={alert.id}>
                <CardContent className="flex items-center gap-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{alert.listing_title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {Array.isArray(alert.tasks) ? alert.tasks[0]?.name : alert.tasks?.name} · {String(alert.country).toUpperCase()} · €{Number(alert.listing_price).toFixed(2)}
                    </p>
                  </div>
                  {alert.ai_score && (
                    <Badge variant={scoreVariant(alert.ai_score as number)}>
                      {alert.ai_score}/10
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
