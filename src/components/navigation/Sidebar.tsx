'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, ListTodo, Shield, LogOut, Radar, Settings } from 'lucide-react'
import { createClient } from '@/lib/db/client-browser'

interface SidebarProps {
  isAdmin: boolean
  userEmail: string
}

const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'Task', icon: ListTodo },
  { href: '/settings', label: 'Impostazioni', icon: Settings },
]

export default function Sidebar({ isAdmin, userEmail }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const links = isAdmin
    ? [...navLinks, { href: '/admin', label: 'Admin', icon: Shield }]
    : navLinks

  return (
    <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Radar size={20} className="text-green-400" />
          <span className="font-bold text-white">Online Deal Finder</span>
        </div>
        <p className="text-xs text-gray-600 mt-1 ml-7">Monitoraggio AI</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5">
        {links.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-green-600/20 text-green-400 font-medium'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User + Logout */}
      <div className="p-3 border-t border-gray-800">
        <p className="text-xs text-gray-600 px-3 mb-2 truncate" title={userEmail}>
          {userEmail}
        </p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors w-full"
        >
          <LogOut size={17} />
          Logout
        </button>
      </div>
    </aside>
  )
}
