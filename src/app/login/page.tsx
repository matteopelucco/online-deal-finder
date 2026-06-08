import { Suspense } from 'react'
import LoginForm from './LoginForm'

export const metadata = {
  title: 'Login — Online Deal Finder',
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-8">
        <Suspense fallback={<div className="text-gray-500 text-sm">Caricamento…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
