'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Pause, Trash2, ScanLine, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, scoreVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Task, CountryLog } from '@/types'

interface TaskCardProps {
  task: Task
}

interface ScanDetail {
  ok: boolean
  duration_ms: number
  logs: CountryLog[]
  topError?: string
}

function investmentColor(val?: string) {
  if (val === 'high') return 'text-green-400'
  if (val === 'medium') return 'text-yellow-400'
  if (val === 'low') return 'text-red-400'
  return 'text-gray-500'
}

function CountryLogRow({ log }: { log: CountryLog }) {
  const [expanded, setExpanded] = useState(false)
  const hasListings = (log.listings?.length ?? 0) > 0

  return (
    <div>
      <div className="px-3 py-2 flex items-start gap-2">
        <span className="shrink-0 mt-0.5">{log.flag}</span>
        <span className="text-gray-400 w-6 shrink-0">{log.country.toUpperCase()}</span>

        {log.status === 'error' ? (
          <span className="text-red-400 flex-1">{log.error}</span>
        ) : (
          <span className="text-gray-500 flex-1 space-x-2">
            <span className={log.listings_found === 0 ? 'text-yellow-600' : 'text-gray-400'}>
              {log.listings_found} trovati
            </span>
            <span>·</span>
            <span>{log.listings_new} nuovi</span>
            <span>·</span>
            <span>{log.listings_qualified} qualificati</span>
            <span>·</span>
            <span className={log.alerts_created > 0 ? 'text-green-400 font-medium' : ''}>
              {log.alerts_created} alert
            </span>
          </span>
        )}

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-gray-700">{log.duration_ms}ms</span>
          {hasListings && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {expanded && hasListings && (
        <div className="border-t border-gray-800/60 bg-gray-900/50">
          {/* Intestazione colonne */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 text-gray-600 font-medium border-b border-gray-800/40"
               style={{ fontSize: '10px', letterSpacing: '0.05em' }}>
            <span>TITOLO</span>
            <span className="text-right">PREZZO</span>
            <span className="text-right">SELLER</span>
            <span className="text-right">FILTRO</span>
            <span className="text-right">SCORE</span>
          </div>

          <div className="divide-y divide-gray-800/30 max-h-72 overflow-y-auto">
            {log.listings!.map(item => (
              <div key={item.id}
                   className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 items-center hover:bg-gray-800/30 transition-colors">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-white truncate flex items-center gap-1 min-w-0"
                  style={{ fontSize: '11px' }}
                >
                  <span className="truncate">{item.title}</span>
                  <ExternalLink size={10} className="shrink-0 text-gray-600" />
                </a>
                <span className="text-gray-400 text-right tabular-nums" style={{ fontSize: '11px' }}>
                  €{parseFloat(item.price).toFixed(0)}
                </span>
                <span className="text-gray-500 text-right tabular-nums" style={{ fontSize: '11px' }}>
                  ⭐{item.seller_rating.toFixed(1)} ({item.seller_reviews})
                </span>
                <span style={{ fontSize: '10px' }} className={item.passed_filter ? 'text-green-500 text-right' : 'text-red-500 text-right'} title={item.filter_reason}>
                  {item.passed_filter ? '✓' : `✗ ${item.filter_reason ?? ''}`}
                </span>
                <span className="text-right">
                  {item.ai_score !== undefined ? (
                    <Badge variant={scoreVariant(item.ai_score)} className="text-[10px] px-1.5 py-0">
                      {item.ai_score}
                      {item.ai_investment_value && (
                        <span className={`ml-1 ${investmentColor(item.ai_investment_value)}`}>
                          {item.ai_investment_value[0].toUpperCase()}
                        </span>
                      )}
                    </Badge>
                  ) : (
                    <span className="text-gray-700 text-[10px]">—</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TaskCard({ task }: TaskCardProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<'toggle' | 'delete' | 'scan' | null>(null)
  const [scanDetail, setScanDetail] = useState<ScanDetail | null>(null)

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
    setScanDetail(null)
    try {
      const res = await fetch(`/api/tasks/${task.id}/scan`, { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        setScanDetail({
          ok: true,
          duration_ms: json.summary?.duration_ms ?? 0,
          logs: json.logs ?? [],
          topError: json.summary?.errors?.[0],
        })
        router.refresh()
      } else {
        setScanDetail({ ok: false, duration_ms: 0, logs: [], topError: json.error })
      }
    } catch (err) {
      setScanDetail({ ok: false, duration_ms: 0, logs: [], topError: String(err) })
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
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-white">{task.name}</p>
              <Badge variant={task.is_active ? 'active' : 'inactive'}>
                {task.is_active ? 'Attivo' : 'Pausa'}
              </Badge>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{task.keywords.join(', ')}</p>
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

        {/* Scan log */}
        {scanDetail && (
          <div className="rounded-lg border border-gray-800 bg-gray-950 overflow-hidden text-xs">
            {/* Header log */}
            <div className={`flex items-center gap-2 px-3 py-2 border-b border-gray-800 ${
              scanDetail.ok ? 'text-green-400' : 'text-red-400'
            }`}>
              {scanDetail.ok
                ? <CheckCircle2 size={13} />
                : <XCircle size={13} />
              }
              <span className="font-medium">
                {scanDetail.ok ? 'Scan completato' : 'Scan fallito'}
              </span>
              {scanDetail.duration_ms > 0 && (
                <span className="text-gray-600 ml-auto">{(scanDetail.duration_ms / 1000).toFixed(1)}s</span>
              )}
            </div>

            {/* Errore globale */}
            {scanDetail.topError && (
              <div className="px-3 py-2 text-red-400 border-b border-gray-800 bg-red-500/5">
                {scanDetail.topError}
              </div>
            )}

            {/* Righe per paese */}
            {scanDetail.logs.length > 0 ? (
              <div className="divide-y divide-gray-800/60">
                {scanDetail.logs.map(log => (
                  <CountryLogRow key={log.country} log={log} />
                ))}
              </div>
            ) : (
              !scanDetail.topError && (
                <div className="px-3 py-2 text-gray-600">Nessun paese scansionato.</div>
              )
            )}
          </div>
        )}

        {/* Azioni */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleScan}
            disabled={loading !== null}
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
