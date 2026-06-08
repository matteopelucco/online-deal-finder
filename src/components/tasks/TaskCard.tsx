'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Pause, Trash2, ScanLine, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Task } from '@/types'

interface TaskCardProps {
  task: Task
}

export default function TaskCard({ task }: TaskCardProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<'toggle' | 'delete' | 'scan' | null>(null)
  const [scanResult, setScanResult] = useState<string | null>(null)

  async function handleToggle() {
    setLoading('toggle')
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !task.is_active }),
      })
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  async function handleDelete() {
    if (!confirm(`Eliminare il task "${task.name}"? Verranno eliminati anche tutti gli alert associati.`)) return
    setLoading('delete')
    try {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  async function handleScan() {
    setLoading('scan')
    setScanResult(null)
    try {
      const res = await fetch(`/api/tasks/${task.id}/scan`, { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        const s = json.summary
        setScanResult(`Scan completato: ${s.listings_found} listing trovati, ${s.alerts_sent} alert inviati`)
        router.refresh()
      } else {
        setScanResult(`Errore: ${json.error}`)
      }
    } finally {
      setLoading(null)
    }
  }

  const lastScan = task.last_scan_at
    ? new Date(task.last_scan_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'Mai'

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-white">{task.name}</p>
              <Badge variant={task.is_active ? 'active' : 'inactive'}>
                {task.is_active ? 'Attivo' : 'Pausa'}
              </Badge>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              {task.keywords.join(', ')}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              {task.countries.map(c => c.toUpperCase()).join(' · ')}
              {task.price_max ? ` · max €${task.price_max}` : ''}
              {task.price_min ? ` · min €${task.price_min}` : ''}
            </p>
          </div>

          <div className="text-right text-xs text-gray-600 shrink-0">
            <p className="text-gray-400">{task.total_alerts} alert</p>
            <p>{task.total_scans} scan</p>
            <p className="mt-1">Ultimo: {lastScan}</p>
          </div>
        </div>

        {scanResult && (
          <p className={`text-xs px-3 py-1.5 rounded-lg border ${
            scanResult.startsWith('Errore')
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : 'bg-green-500/10 border-green-500/20 text-green-400'
          }`}>
            {scanResult}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleScan}
            disabled={loading !== null}
            title="Scan ora"
          >
            {loading === 'scan'
              ? <Loader2 size={14} className="animate-spin" />
              : <ScanLine size={14} />
            }
            Scan ora
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleToggle}
            disabled={loading !== null}
          >
            {loading === 'toggle'
              ? <Loader2 size={14} className="animate-spin" />
              : task.is_active ? <Pause size={14} /> : <Play size={14} />
            }
            {task.is_active ? 'Pausa' : 'Attiva'}
          </Button>

          <Button
            size="sm"
            variant="danger"
            onClick={handleDelete}
            disabled={loading !== null}
            className="ml-auto"
          >
            {loading === 'delete'
              ? <Loader2 size={14} className="animate-spin" />
              : <Trash2 size={14} />
            }
            Elimina
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
