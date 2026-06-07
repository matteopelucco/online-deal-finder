import { createClient } from '@/lib/db/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ListTodo, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Task } from '@/types'

export const metadata = {
  title: 'Task — Vinted Scout',
}

async function getTasks(userId: string): Promise<Task[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  return (data as Task[]) ?? []
}

export default async function TasksPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const tasks = await getTasks(user.id)

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Task</h1>
          <p className="text-sm text-gray-500 mt-1">Gestisci i tuoi task di ricerca su Vinted</p>
        </div>
        <Button size="sm">
          <Plus size={16} />
          Nuovo task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ListTodo size={40} className="text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400 font-medium">Nessun task configurato</p>
            <p className="text-gray-600 text-sm mt-1 mb-6">
              Crea il tuo primo task per iniziare a monitorare Vinted
            </p>
            <Button size="sm">
              <Plus size={16} />
              Crea il primo task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <Card key={task.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-white">{task.name}</p>
                    <Badge variant={task.is_active ? 'active' : 'inactive'}>
                      {task.is_active ? 'Attivo' : 'Pausa'}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    {task.keywords.join(', ')} · {task.countries.join(', ').toUpperCase()}
                    {task.price_max && ` · max €${task.price_max}`}
                  </p>
                </div>
                <div className="text-right text-xs text-gray-600 shrink-0">
                  <p>{task.total_alerts} alert</p>
                  <p>{task.total_scans} scan</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
