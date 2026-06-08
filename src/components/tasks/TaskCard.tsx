'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Play, Pause, Trash2, ScanLine, Loader2,
  ChevronDown, ChevronUp, ExternalLink, Clock, Edit2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, scoreVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import TaskFormModal from '@/components/tasks/TaskFormModal'
import { describeCron } from '@/lib/scan/schedule'
import type { Task, ListingDetail } from '@/types'
import type { ScanEvent } from '@/app/api/tasks/[id]/scan/route'

interface TaskCardProps { task: Task }

// ---- Countdown timer ----
function useCountdown(lastScanAt: string | null, intervalMinutes: number) {
  const [display, setDisplay] = useState<{ label: string; urgent: boolean }>({ label: '', urgent: false })

  useEffect(() => {
    if (!lastScanAt) { setDisplay({ label: 'Prossimo: ora', urgent: true }); return }

    const nextMs = new Date(lastScanAt).getTime() + intervalMinutes * 60 * 1000

    function tick() {
      const diff = nextMs - Date.now()
      if (diff <= 0) { setDisplay({ label: 'Prossimo: ora', urgent: true }); return }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setDisplay({ label: `Prossimo: ${m}:${s.toString().padStart(2, '0')}`, urgent: m < 2 })
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lastScanAt, intervalMinutes])

  return display
}

// ---- Live log line rendering ----
interface LogLine { ts: number; event: ScanEvent }

function renderLine(e: ScanEvent, idx: number) {
  switch (e.type) {
    case 'start':
      return <div key={idx} className="text-green-400 font-medium">▶ Avvio scan "{e.task_name}" — paesi: {e.countries.map(c => c.toUpperCase()).join(', ')}</div>

    case 'step': {
      const color = e.level === 'error' ? 'text-red-400' : e.level === 'success' ? 'text-green-400' : e.level === 'warn' ? 'text-yellow-400' : 'text-gray-400'
      return <div key={idx} className={color}>{e.message}</div>
    }

    case 'country_start':
      return <div key={idx} className="text-blue-400 font-medium mt-1">{e.flag} {e.country.toUpperCase()} ─────────────────</div>

    case 'vinted_result':
      return <div key={idx} className={`font-medium ${e.found === 0 ? 'text-yellow-500' : 'text-gray-200'}`}>
        📦 {e.found} trovati · {e.new_count} nuovi
      </div>

    case 'listing': {
      const d = e.detail
      const scoreEl = d.ai_score !== undefined
        ? <Badge variant={scoreVariant(d.ai_score)} className="text-[10px] px-1 py-0 ml-1">{d.ai_score}</Badge>
        : null
      return (
        <div key={idx} className="flex items-center gap-1 ml-2 flex-wrap">
          <span className={d.passed_filter ? 'text-green-500' : 'text-red-500'}>{d.passed_filter ? '✓' : '✗'}</span>
          <a href={d.url} target="_blank" rel="noopener noreferrer"
            className="text-gray-300 hover:text-white truncate max-w-[280px]">{d.title}</a>
          <span className="text-gray-500">€{parseFloat(d.price).toFixed(0)}</span>
          <span className="text-gray-600">⭐{d.seller_rating.toFixed(1)}({d.seller_reviews})</span>
          <span className="text-gray-600">♥{d.favourite_count}</span>
          {!d.passed_filter && <span className="text-red-700 text-[10px]">[{d.filter_reason}]</span>}
          {scoreEl}
        </div>
      )
    }

    case 'country_done':
      return <div key={idx} className="text-gray-500 text-xs mt-0.5">
        ✓ {e.country.toUpperCase()} completato in {(e.duration_ms / 1000).toFixed(1)}s — {e.alerts} alert creati
      </div>

    case 'done':
      return <div key={idx} className="text-green-400 font-medium mt-1 border-t border-gray-800 pt-1">
        ✅ Scan completato in {(e.duration_ms / 1000).toFixed(1)}s — {e.total_alerts} alert totali
        {e.errors.length > 0 && <span className="text-red-400"> · {e.errors.length} errori</span>}
      </div>

    case 'error':
      return <div key={idx} className="text-red-400 font-medium">❌ {e.message}</div>

    default:
      return null
  }
}

// ---- Per-country listing table ----
function ListingsTable({ listings }: { listings: ListingDetail[] }) {
  const [open, setOpen] = useState(false)
  if (!listings.length) return null

  return (
    <div className="mt-1 border-t border-gray-800/60">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {open ? 'Nascondi' : `Mostra`} {listings.length} listing
      </button>

      {open && (
        <div className="max-h-64 overflow-y-auto">
          <div className="grid px-3 py-1 text-gray-600 font-medium border-b border-gray-800/40"
            style={{ fontSize: '10px', gridTemplateColumns: '1fr 48px 80px 36px 24px 36px' }}>
            <span>TITOLO</span><span className="text-right">€</span>
            <span className="text-right">SELLER</span>
            <span className="text-right">♥</span>
            <span className="text-right">OK</span>
            <span className="text-right">AI</span>
          </div>
          {listings.map(item => (
            <div key={item.id}
              className="grid px-3 py-1 items-center hover:bg-gray-800/30 border-b border-gray-800/20"
              style={{ fontSize: '11px', gridTemplateColumns: '1fr 48px 80px 36px 24px 36px' }}>
              <a href={item.url} target="_blank" rel="noopener noreferrer"
                className="text-gray-300 hover:text-white truncate flex items-center gap-1 min-w-0">
                <span className="truncate">{item.title}</span>
                <ExternalLink size={9} className="shrink-0 text-gray-600" />
              </a>
              <span className="text-gray-400 text-right tabular-nums">{parseFloat(item.price).toFixed(0)}</span>
              <span className="text-gray-500 text-right tabular-nums text-[10px]"
                title={item.filter_reason}>
                ⭐{item.seller_rating.toFixed(1)}({item.seller_reviews})
              </span>
              <span className="text-gray-500 text-right tabular-nums">{item.favourite_count}</span>
              <span className={`text-right text-[11px] ${item.passed_filter ? 'text-green-500' : 'text-red-500'}`}>
                {item.passed_filter ? '✓' : '✗'}
              </span>
              <span className="text-right">
                {item.ai_score !== undefined
                  ? <Badge variant={scoreVariant(item.ai_score)} className="text-[10px] px-1 py-0">{item.ai_score}</Badge>
                  : <span className="text-gray-700">—</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Main component ----
export default function TaskCard({ task }: TaskCardProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<'toggle' | 'delete' | null>(null)
  const [scanning, setScanning] = useState(false)
  const [liveLog, setLiveLog] = useState<ScanEvent[]>([])
  const [listings, setListings] = useState<ListingDetail[]>([])
  const [scanDone, setScanDone] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const countdown = useCountdown(task.last_scan_at, task.scan_interval_minutes)

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [liveLog])

  async function handleScan() {
    setScanning(true)
    setScanDone(false)
    setLiveLog([])
    setListings([])

    try {
      const res = await fetch(`/api/tasks/${task.id}/scan`, { method: 'POST' })
      if (!res.ok || !res.body) {
        setLiveLog([{ type: 'error', message: `HTTP ${res.status}` }])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          try {
            const event: ScanEvent = JSON.parse(part.slice(6))
            setLiveLog(prev => [...prev, event])
            if (event.type === 'listing') {
              setListings(prev => [...prev, event.detail])
            }
            if (event.type === 'done') {
              setScanDone(true)
              router.refresh()
            }
          } catch { /* malformed event */ }
        }
      }
    } finally {
      setScanning(false)
    }
  }

  async function handleToggle() {
    setLoading('toggle')
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !task.is_active }),
      })
      router.refresh()
    } finally { setLoading(null) }
  }

  async function handleDelete() {
    if (!confirm(`Eliminare il task "${task.name}"? Verranno eliminati anche tutti gli alert associati.`)) return
    setLoading('delete')
    try {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
      router.refresh()
    } finally { setLoading(null) }
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

          <div className="text-right text-xs shrink-0 space-y-0.5">
            <p className="text-gray-400">{task.total_alerts} alert · {task.total_scans} scan</p>
            <p className="text-gray-600">Ultimo: {lastScan}</p>
            {task.scan_schedule && (
              <p className="text-blue-500 text-[10px]" title={task.scan_schedule}>
                🕐 {describeCron(task.scan_schedule)}
              </p>
            )}
            {task.is_active && countdown.label && (
              <p className={`flex items-center justify-end gap-1 ${countdown.urgent ? 'text-green-400' : 'text-gray-500'}`}>
                <Clock size={10} />
                {countdown.label}
              </p>
            )}
          </div>
        </div>

        {/* Live log */}
        {liveLog.length > 0 && (
          <div className="rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">
                {scanning ? <span className="flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" />Scan in corso…</span> : ''}
                {scanDone ? <span className="text-green-400">✓ Completato</span> : ''}
              </span>
            </div>
            <div className="px-3 py-2 space-y-0.5 font-mono max-h-80 overflow-y-auto" style={{ fontSize: '11px' }}>
              {liveLog.map((e, i) => renderLine(e, i))}
              <div ref={logEndRef} />
            </div>
            {!scanning && listings.length > 0 && (
              <ListingsTable listings={listings} />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <Button size="sm" variant="ghost" onClick={handleScan} disabled={scanning || loading !== null}>
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
            {scanning ? 'Scanning…' : 'Scan ora'}
          </Button>

          <Button size="sm" variant="secondary" onClick={handleToggle} disabled={scanning || loading !== null}>
            {loading === 'toggle' ? <Loader2 size={14} className="animate-spin" /> : task.is_active ? <Pause size={14} /> : <Play size={14} />}
            {task.is_active ? 'Pausa' : 'Attiva'}
          </Button>

          <TaskFormModal
            task={task}
            trigger={
              <Button size="sm" variant="secondary" disabled={scanning || loading !== null}>
                <Edit2 size={14} />
                Modifica
              </Button>
            }
          />

          <Button size="sm" variant="danger" onClick={handleDelete} disabled={scanning || loading !== null} className="ml-auto">
            {loading === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Elimina
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
