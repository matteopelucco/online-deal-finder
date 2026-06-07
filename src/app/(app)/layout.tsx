import { redirect } from 'next/navigation'
import { createClient } from '@/lib/db/client'
import Sidebar from '@/components/navigation/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'
  const userEmail = profile?.email ?? user.email ?? ''

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar isAdmin={isAdmin} userEmail={userEmail} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
