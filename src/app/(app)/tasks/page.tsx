import { createClient } from '@/lib/db/client'
import { Card, CardContent } from '@/components/ui/card'
import { ListTodo } from 'lucide-react'
import TaskFormModal from '@/components/tasks/TaskFormModal'
import TaskCard from '@/components/tasks/TaskCard'
import type { Task } from '@/types'

export const metadata = {
  title: 'Task — Online Deal Finder',
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
        <TaskFormModal />
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ListTodo size={40} className="text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400 font-medium">Nessun task configurato</p>
            <p className="text-gray-600 text-sm mt-1 mb-6">
              Crea il tuo primo task per iniziare a monitorare Vinted
            </p>
            <TaskFormModal />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  )
}
