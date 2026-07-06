'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  RefreshCw, Play, RotateCcw, Clock, ExternalLink,
  CheckCircle2, AlertTriangle, ArrowLeft,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServiceHealth { status: 'ok' | 'error'; latencyMs: number; detail?: string }
interface HealthData {
  supabase: ServiceHealth
  redis: ServiceHealth
  satusehat: ServiceHealth
  checkedAt: string
}
interface QueueCounts { pending: number; processing: number; success: number; failed: number; dead: number }
interface QueueJob {
  id: string; resource_type: string; local_id: string; action: string
  attempts: number; max_attempts: number; last_error: string | null; status: string; updated_at: string
}
interface SentryIssue {
  id: string; title: string; culprit: string; count: number; lastSeen: string; level: string; permalink: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function colorFor(ms: number): string {
  if (ms <= 150) return '#10b981'
  if (ms <= 800) return '#f59e0b'
  return '#f43f5e'
}
function nodeColor(h: ServiceHealth | undefined): string {
  if (!h) return '#4b5563'
  return h.status === 'ok' ? colorFor(h.latencyMs) : '#f43f5e'
}
function relativeTime(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} mnt lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  return `${Math.floor(h / 24)} hari lalu`
}

// ─── Topology SVG ─────────────────────────────────────────────────────────────

function Topology({
  health, refreshing, onRefresh, lastRefreshed,
}: {
  health: HealthData | null
  refreshing: boolean
  onRefresh: () => void
  lastRefreshed: Date | null
}) {
  // Node centres
  const C = { x: 450, y: 195 }       // App Server (center)
  const DB = { x: 110, y: 145 }      // Supabase — radius 34
  const RD = { x: 145, y: 305 }      // Redis     — radius 30
  const SS = { x: 760, y: 195 }      // SATUSEHAT — radius 34

  const dbColor = nodeColor(health?.supabase)
  const rdColor = nodeColor(health?.redis)
  const ssColor = nodeColor(health?.satusehat)

  // Cubic bezier paths node-edge → center-edge
  const pathDB = `M ${DB.x + 34},${DB.y} C ${(DB.x + C.x) / 2},${DB.y} ${(DB.x + C.x) / 2},${C.y} ${C.x - 44},${C.y}`
  const pathRD = `M ${RD.x + 30},${RD.y} C ${(RD.x + C.x) / 2},${RD.y} ${(RD.x + C.x) / 2 + 30},${C.y + 15} ${C.x - 44},${C.y + 12}`
  const pathSS = `M ${C.x + 44},${C.y} C ${(SS.x + C.x) / 2},${C.y} ${(SS.x + C.x) / 2},${SS.y} ${SS.x - 34},${SS.y}`

  const online = health
    ? [health.supabase, health.redis, health.satusehat].filter(s => s.status === 'ok').length
    : 0
  const avgMs = health
    ? Math.round((health.supabase.latencyMs + health.redis.latencyMs + health.satusehat.latencyMs) / 3)
    : null

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: '#0b0b18' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          <span className="text-white font-semibold text-sm tracking-wide">Live Service Topology</span>
        </div>
        <div className="flex items-center gap-2">
          {health && (
            <>
              <span className="text-[11px] text-white/50 border border-white/15 rounded-full px-2.5 py-0.5">
                {online}/3 online
              </span>
              {avgMs !== null && (
                <span className="text-[11px] text-white/50 border border-white/15 rounded-full px-2.5 py-0.5">
                  {avgMs}ms avg
                </span>
              )}
            </>
          )}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-[11px] text-white/60 border border-white/15 rounded-full px-3 py-1 hover:bg-white/8 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            {lastRefreshed ? lastRefreshed.toLocaleTimeString('id-ID') : 'Refresh'}
          </button>
        </div>
      </div>

      {/* SVG Topology */}
      <svg viewBox="0 0 880 400" className="w-full" style={{ height: 380 }}>
        <defs>
          <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="7" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glowSm" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="gradCenter" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3730a3" />
            <stop offset="100%" stopColor="#0d0d1f" />
          </radialGradient>
          <radialGradient id="gradOk" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#064e3b" />
            <stop offset="100%" stopColor="#0d0d1f" />
          </radialGradient>
          <radialGradient id="gradErr" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7f1d1d" />
            <stop offset="100%" stopColor="#0d0d1f" />
          </radialGradient>
          <radialGradient id="gradGray" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1f2937" />
            <stop offset="100%" stopColor="#0d0d1f" />
          </radialGradient>
        </defs>

        {/* ── Group boxes ── */}
        <rect x="30" y="60" width="218" height="300" rx="14"
          fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="5 4" strokeOpacity="0.22" />
        <text x="139" y="47" fill="#3b82f6" fontSize="9.5" fontWeight="700"
          letterSpacing="2.5" textAnchor="middle" opacity="0.55">DATABASE</text>

        <rect x="636" y="80" width="208" height="178" rx="14"
          fill="none" stroke="#a855f7" strokeWidth="1" strokeDasharray="5 4" strokeOpacity="0.22" />
        <text x="740" y="67" fill="#a855f7" fontSize="9.5" fontWeight="700"
          letterSpacing="2.5" textAnchor="middle" opacity="0.55">EXTERNAL API</text>

        {/* ── Connection: Supabase → Center ── */}
        <path d={pathDB} stroke={dbColor} strokeWidth="1.5" fill="none" opacity="0.45" />
        <circle r="4" fill={dbColor} opacity="0.9" filter="url(#glowSm)">
          <animateMotion dur="2.4s" repeatCount="indefinite" path={pathDB} />
        </circle>
        <circle r="2.5" fill={dbColor} opacity="0.55">
          <animateMotion dur="2.4s" begin="-1.2s" repeatCount="indefinite" path={pathDB} />
        </circle>

        {/* ── Connection: Redis → Center ── */}
        <path d={pathRD} stroke={rdColor} strokeWidth="1.5" fill="none" opacity="0.45" />
        <circle r="4" fill={rdColor} opacity="0.9" filter="url(#glowSm)">
          <animateMotion dur="1.9s" repeatCount="indefinite" path={pathRD} />
        </circle>
        <circle r="2.5" fill={rdColor} opacity="0.55">
          <animateMotion dur="1.9s" begin="-0.95s" repeatCount="indefinite" path={pathRD} />
        </circle>

        {/* ── Connection: Center → SATUSEHAT ── */}
        <path d={pathSS} stroke={ssColor} strokeWidth="1.5" fill="none" opacity="0.45" />
        <circle r="4" fill={ssColor} opacity="0.9" filter="url(#glowSm)">
          <animateMotion dur="2.9s" repeatCount="indefinite" path={pathSS} />
        </circle>
        <circle r="2.5" fill={ssColor} opacity="0.55">
          <animateMotion dur="2.9s" begin="-1.45s" repeatCount="indefinite" path={pathSS} />
        </circle>

        {/* ── CENTER NODE — App Server ── */}
        {/* Outer pulse ring */}
        <circle cx={C.x} cy={C.y} r="52" fill="none" stroke="#4f46e5" strokeWidth="1" opacity="0.35" filter="url(#glow)">
          <animate attributeName="r" values="52;64;52" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.35;0.08;0.35" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx={C.x} cy={C.y} r="46" fill="none" stroke="#4f46e5" strokeWidth="1.5" opacity="0.2">
          <animate attributeName="r" values="46;56;46" dur="3s" begin="-1s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.2;0.04;0.2" dur="3s" begin="-1s" repeatCount="indefinite" />
        </circle>
        {/* Main disc */}
        <circle cx={C.x} cy={C.y} r="42" fill="url(#gradCenter)" stroke="#4f46e5" strokeWidth="2" filter="url(#glow)" />
        {/* Server rack icon */}
        {[-10, 0, 10].map((dy, i) => (
          <g key={i}>
            <rect x={C.x - 14} y={C.y + dy - 3.5} width="28" height="7" rx="1.5"
              fill="#a5b4fc" opacity={1 - i * 0.22} />
            <circle cx={C.x + 10} cy={C.y + dy} r="1.5" fill="#10b981" />
          </g>
        ))}
        {/* Label */}
        <text x={C.x} y={C.y + 62} textAnchor="middle" fill="white" fontSize="13" fontWeight="600">App Server</text>
        <text x={C.x} y={C.y + 77} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="10">Vercel · Next.js 15</text>

        {/* ── SUPABASE NODE ── */}
        <circle cx={DB.x} cy={DB.y} r="34"
          fill={health?.supabase?.status === 'ok' ? 'url(#gradOk)' : health?.supabase ? 'url(#gradErr)' : 'url(#gradGray)'}
          stroke={dbColor} strokeWidth="2" filter="url(#glowSm)" />
        {/* DB cylinder icon */}
        <ellipse cx={DB.x} cy={DB.y - 8} rx="11" ry="3.5" fill={dbColor} opacity="0.85" />
        <rect x={DB.x - 11} y={DB.y - 8} width="22" height="14" fill={dbColor} opacity="0.3" />
        <ellipse cx={DB.x} cy={DB.y + 6} rx="11" ry="3.5" fill={dbColor} opacity="0.85" />
        <line x1={DB.x - 11} y1={DB.y - 2} x2={DB.x + 11} y2={DB.y - 2} stroke={dbColor} strokeWidth="0.5" opacity="0.5" />
        {/* Labels */}
        <text x={DB.x} y={DB.y + 50} textAnchor="middle" fill="white" fontSize="11" fontWeight="600">Supabase DB</text>
        <text x={DB.x} y={DB.y + 64} textAnchor="middle" fill={dbColor} fontSize="12" fontWeight="700">
          {health?.supabase ? `${health.supabase.latencyMs}ms` : '···'}
        </text>

        {/* ── REDIS NODE ── */}
        <circle cx={RD.x} cy={RD.y} r="30"
          fill={health?.redis?.status === 'ok' ? 'url(#gradOk)' : health?.redis ? 'url(#gradErr)' : 'url(#gradGray)'}
          stroke={rdColor} strokeWidth="2" filter="url(#glowSm)" />
        {/* Lightning bolt */}
        <polygon
          points={`${RD.x - 5},${RD.y - 12} ${RD.x + 4},${RD.y - 1} ${RD.x - 1},${RD.y - 1} ${RD.x + 5},${RD.y + 12} ${RD.x - 4},${RD.y + 1} ${RD.x + 1},${RD.y + 1}`}
          fill={rdColor} opacity="0.85"
        />
        <text x={RD.x} y={RD.y + 44} textAnchor="middle" fill="white" fontSize="11" fontWeight="600">Upstash Redis</text>
        <text x={RD.x} y={RD.y + 57} textAnchor="middle" fill={rdColor} fontSize="12" fontWeight="700">
          {health?.redis ? `${health.redis.latencyMs}ms` : '···'}
        </text>

        {/* ── SATUSEHAT NODE ── */}
        <circle cx={SS.x} cy={SS.y} r="34"
          fill={health?.satusehat?.status === 'ok' ? 'url(#gradOk)' : health?.satusehat ? 'url(#gradErr)' : 'url(#gradGray)'}
          stroke={ssColor} strokeWidth="2" filter="url(#glowSm)" />
        {/* Pulsing signal rings */}
        <circle cx={SS.x} cy={SS.y} r="20" fill="none" stroke={ssColor} strokeWidth="1" opacity="0.35">
          <animate attributeName="r" values="20;28;20" dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.35;0.05;0.35" dur="2.2s" repeatCount="indefinite" />
        </circle>
        {/* Globe lines */}
        <circle cx={SS.x} cy={SS.y} r="13" fill="none" stroke={ssColor} strokeWidth="1.5" opacity="0.8" />
        <ellipse cx={SS.x} cy={SS.y} rx="7" ry="13" fill="none" stroke={ssColor} strokeWidth="1" opacity="0.5" />
        <line x1={SS.x - 13} y1={SS.y} x2={SS.x + 13} y2={SS.y} stroke={ssColor} strokeWidth="1" opacity="0.5" />
        {/* Labels */}
        <text x={SS.x} y={SS.y + 51} textAnchor="middle" fill="white" fontSize="11" fontWeight="600">SATUSEHAT API</text>
        <text x={SS.x} y={SS.y + 65} textAnchor="middle" fill={ssColor} fontSize="12" fontWeight="700">
          {health?.satusehat ? `${health.satusehat.latencyMs}ms` : '···'}
        </text>
        {health?.satusehat?.detail && (
          <text x={SS.x} y={SS.y + 78} textAnchor="middle" fill="rgba(255,255,255,0.28)" fontSize="9.5">
            {health.satusehat.detail}
          </text>
        )}

        {/* ── Legend ── */}
        <g transform="translate(290,368)">
          <circle cx="6" cy="5" r="4.5" fill="#10b981" />
          <text x="15" y="9" fill="rgba(255,255,255,0.38)" fontSize="9.5">≤150ms</text>
          <circle cx="76" cy="5" r="4.5" fill="#f59e0b" />
          <text x="85" y="9" fill="rgba(255,255,255,0.38)" fontSize="9.5">151-800ms</text>
          <circle cx="162" cy="5" r="4.5" fill="#f43f5e" />
          <text x="171" y="9" fill="rgba(255,255,255,0.38)" fontSize="9.5">{'>'}800ms</text>
        </g>
      </svg>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [counts, setCounts] = useState<QueueCounts | null>(null)
  const [failures, setFailures] = useState<QueueJob[]>([])
  const [sentryIssues, setSentryIssues] = useState<SentryIssue[]>([])
  const [sentryUnavailable, setSentryUnavailable] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const fetchAll = useCallback(async () => {
    setRefreshing(true)
    try {
      const [healthRes, queueRes, sentryRes] = await Promise.allSettled([
        fetch('/api/cms/health').then(r => r.json()),
        fetch('/api/cms/queue-stats').then(r => r.json()),
        fetch('/api/cms/sentry-issues').then(r => r.json()),
      ])
      if (healthRes.status === 'fulfilled' && healthRes.value.success) setHealth(healthRes.value.data)
      if (queueRes.status === 'fulfilled' && queueRes.value.success) {
        setCounts(queueRes.value.data.counts)
        setFailures(queueRes.value.data.recentFailures)
      }
      if (sentryRes.status === 'fulfilled' && sentryRes.value.success) {
        setSentryIssues(sentryRes.value.data.issues ?? [])
        setSentryUnavailable(sentryRes.value.data.unavailable ?? false)
      }
      setLastRefreshed(new Date())
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, 60_000)
    return () => clearInterval(id)
  }, [fetchAll])

  async function doAction(action: string, label: string) {
    setActionLoading(action)
    setActionMsg(null)
    try {
      const res = await fetch('/api/cms/queue-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (data.success) {
        setActionMsg(
          action === 'trigger_worker'
            ? `Worker selesai: ${data.data.stats?.succeeded ?? 0} sukses, ${data.data.stats?.failed ?? 0} gagal`
            : `${label}: ${data.data.reset ?? 0} job direset`
        )
        await fetchAll()
      } else {
        setActionMsg(`Error: ${data.error}`)
      }
    } catch (e: any) {
      setActionMsg(`Error: ${e.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-7">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <a href="/cms" className="text-foreground/40 hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </a>
        <div>
          <h1 className="text-3xl font-bold text-foreground">System Monitor</h1>
          <p className="text-foreground/50 text-sm mt-0.5">Status layanan, antrian sinkronisasi SATUSEHAT, dan log error</p>
        </div>
      </div>

      {/* Animated topology */}
      <Topology
        health={health}
        refreshing={refreshing}
        onRefresh={fetchAll}
        lastRefreshed={lastRefreshed}
      />

      {/* Queue stats */}
      <Card className="border border-border/40">
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Antrian Sinkronisasi SATUSEHAT</h2>
          </div>

          {/* Counts */}
          <div className="grid grid-cols-5 gap-2">
            {([
              { label: 'Pending', key: 'pending', color: 'text-amber-500' },
              { label: 'Processing', key: 'processing', color: 'text-blue-500' },
              { label: 'Sukses', key: 'success', color: 'text-emerald-500' },
              { label: 'Gagal', key: 'failed', color: 'text-rose-500' },
              { label: 'Dead', key: 'dead', color: 'text-foreground/40' },
            ] as const).map(({ label, key, color }) => (
              <div key={key} className="text-center p-3 rounded-xl bg-muted/40">
                <p className={`text-2xl font-bold ${color}`}>{counts ? counts[key] : '—'}</p>
                <p className="text-xs text-foreground/50 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/40">
            <Button size="sm" onClick={() => doAction('trigger_worker', 'Trigger Worker')} disabled={!!actionLoading}>
              <Play className={`w-3.5 h-3.5 mr-2 ${actionLoading === 'trigger_worker' ? 'animate-pulse' : ''}`} />
              Jalankan Worker
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => doAction('retry_failed', 'Retry Failed')}
              disabled={!!actionLoading || (counts?.failed ?? 0) === 0}>
              <RotateCcw className="w-3.5 h-3.5 mr-2" />
              Retry Gagal ({counts?.failed ?? 0})
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => doAction('reset_stuck', 'Reset Stuck')}
              disabled={!!actionLoading}>
              <Clock className="w-3.5 h-3.5 mr-2" />
              Reset Macet
            </Button>
            {actionMsg && <span className="text-xs text-foreground/60">{actionMsg}</span>}
          </div>

          {/* Recent failures */}
          {failures.length > 0 && (
            <div className="pt-2 border-t border-border/40 space-y-2">
              <p className="text-sm font-medium text-foreground/60">Job Gagal / Dead Terbaru</p>
              {failures.map(job => (
                <div key={job.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 text-xs">
                  <Badge variant={job.status === 'dead' ? 'secondary' : 'destructive'} className="shrink-0 mt-0.5">
                    {job.status}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground/80">{job.resource_type} · {job.local_id.slice(0, 8)}…</p>
                    <p className="text-foreground/50 mt-0.5 truncate">{job.last_error ?? '—'}</p>
                  </div>
                  <div className="text-right shrink-0 text-foreground/40">
                    <p>{job.attempts}/{job.max_attempts}×</p>
                    <p>{relativeTime(job.updated_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sentry errors */}
      <Card className="border border-border/40">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Error Monitoring — Sentry</h2>
            <a href="https://ursatrioo.sentry.io/projects/javascript-nextjs/"
              target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary flex items-center gap-1 hover:underline">
              Buka Sentry <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          {sentryUnavailable ? (
            <div className="flex items-center gap-2 text-sm text-foreground/50">
              <AlertTriangle className="w-4 h-4" />
              SENTRY_AUTH_TOKEN belum dikonfigurasi
            </div>
          ) : sentryIssues.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
              Tidak ada issue aktif dalam 7 hari terakhir
            </div>
          ) : (
            <div className="space-y-2">
              {sentryIssues.map(issue => (
                <a key={issue.id} href={issue.permalink} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors text-xs group">
                  <Badge
                    variant={issue.level === 'error' || issue.level === 'fatal' ? 'destructive' : 'secondary'}
                    className="shrink-0 mt-0.5"
                  >
                    {issue.level}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground/80 truncate group-hover:text-foreground">{issue.title}</p>
                    <p className="text-foreground/40 mt-0.5">{issue.culprit}</p>
                  </div>
                  <div className="text-right shrink-0 text-foreground/40">
                    <p className="font-medium text-foreground/60">{issue.count.toLocaleString('id-ID')}×</p>
                    <p>{relativeTime(issue.lastSeen)}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
