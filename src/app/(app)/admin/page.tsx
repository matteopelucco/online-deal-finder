import { createAdminClient } from '@/lib/db/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Profile } from '@/types'

export const metadata = {
  title: 'Admin — Online Deal Finder',
}

async function getAllUsers(): Promise<Profile[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  return (data as Profile[]) ?? []
}

async function getGlobalStats() {
  const supabase = createAdminClient()

  const [tasks, alerts] = await Promise.all([
    supabase.from('tasks').select('id', { count: 'exact', head: true }),
    supabase.from('alerts').select('id', { count: 'exact', head: true }),
  ])

  return {
    totalTasks: tasks.count ?? 0,
    totalAlerts: alerts.count ?? 0,
  }
}

export default async function AdminPage() {
  const [users, stats] = await Promise.all([getAllUsers(), getGlobalStats()])

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin</h1>
        <p className="text-sm text-gray-500 mt-1">Gestione utenti e statistiche globali</p>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-white">{users.length}</p>
            <p className="text-xs text-gray-500 mt-1">Utenti totali</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-white">{stats.totalTasks}</p>
            <p className="text-xs text-gray-500 mt-1">Task totali</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-white">{stats.totalAlerts}</p>
            <p className="text-xs text-gray-500 mt-1">Alert totali</p>
          </CardContent>
        </Card>
      </div>

      {/* Users list */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-300">Utenti</h2>
        </CardHeader>
        <div className="divide-y divide-gray-800">
          {users.map(user => (
            <CardContent key={user.id} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">
                  {user.display_name ?? user.email}
                </p>
                {user.display_name && (
                  <p className="text-xs text-gray-500">{user.email}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {user.role === 'admin' && (
                  <Badge variant="high">Admin</Badge>
                )}
                <Badge variant={user.is_active ? 'active' : 'inactive'}>
                  {user.is_active ? 'Attivo' : 'Disabilitato'}
                </Badge>
              </div>
            </CardContent>
          ))}
        </div>
      </Card>
    </div>
  )
}
