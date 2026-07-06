'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Database, Zap, Globe, RefreshCw, Play, RotateCcw, AlertTriangle,
  CheckCircle2, XCircle, Clock, ExternalLink, ArrowLeft,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceHealth {
  status: 'ok' | 'error'
  latencyMs: number
  detail?: string
}

interface HealthData {
  supabase: ServiceHealth
  redis: ServiceHealth
  satusehat: ServiceHealth
  checkedAt: string
}

interface QueueCounts {
  pending: number
  processing: number
  success: number
  failed: number
  dead: number
}

interface QueueJob {
  id: string
  resource_type: string
  local_id: string
  action: string
  attempts: number
  max_attempts: number
  last_error: string | null
  status: string
  updated_at: string
}

interface SentryIssue {
  id: string
  title: string
  culprit: string
  count: number
  lastSeen: string
  level: string
  permalink: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function latencyColor(ms: number) {
  if (ms <= 150) return 'text-emerald-500'
  if (ms <= 800) return 'text-amber-500'
  return 'text-rose-500'
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} mnt lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  return `${Math.floor(h / 24)} hari lalu`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ServiceCard({ label, icon: Icon, data }: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  data: ServiceHealth | undefined
}) {
  const ok = data?.status === 'ok'
  return (
    <Card className="border border-border/40">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-lg ${ok ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
            <Icon className={`w-4 h-4 ${ok ? 'text-emerald-500' : 'text-rose-500'}`} />
          </div>
          <span className="font-medium text-sm">{label}</span>
          <div className="ml-auto">
            {!data ? (
              <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
            ) : ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-500" />
            )}
          </div>
        </div>
        {data ? (
          <>
            <p className={`text-2xl font-bold ${ok ? latencyColor(data.latencyMs) : 'text-rose-500'}`}>
              {ok ? `${data.latencyMs}ms` : 'Error'}
            </p>
            <p className="text-xs text-foreground/40 mt-0.5">{data.detail ?? (ok ? 'Terhubung' : 'Gagal')}</p>
          </>
        ) : (
          <p className="text-sm text-foreground/40">Memeriksa...</p>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-3xl font-bold ${color}`}>{count}</p>
      <p className="text-xs text-foreground/50 mt-0.5">{label}</p>
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

  const allOk = health && [health.supabase, health.redis, health.satusehat].every(s => s.status === 'ok')

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/cms" className="text-foreground/40 hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </a>
          <div>
            <h1 className="text-3xl font-bold text-foreground">System Monitor</h1>
            <p className="text-foreground/60 mt-0.5 text-sm">
              Status layanan, antrian sinkronisasi, dan log error
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-foreground/40">
              Diperbarui {relativeTime(lastRefreshed.toISOString())}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Service Health */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold">Kesehatan Layanan</h2>
          {health && (
            <Badge variant={allOk ? 'default' : 'destructive'} className={allOk ? 'bg-emerald-500' : ''}>
              {allOk ? 'Semua Online' : 'Ada Masalah'}
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ServiceCard label="Supabase DB" icon={Database} data={health?.supabase} />
          <ServiceCard label="Upstash Redis" icon={Zap} data={health?.redis} />
          <ServiceCard label="SATUSEHAT API" icon={Globe} data={health?.satusehat} />
        </div>
      </section>

      {/* SS Sync Queue */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Antrian Sinkronisasi SATUSEHAT</h2>
        <Card className="border border-border/40">
          <CardContent className="p-6 space-y-6">
            {/* Counts */}
            <div className="grid grid-cols-5 gap-4 py-2">
              <StatusBadge count={counts?.pending ?? 0} label="Pending" color="text-amber-500" />
              <StatusBadge count={counts?.processing ?? 0} label="Processing" color="text-blue-500" />
              <StatusBadge count={counts?.success ?? 0} label="Sukses" color="text-emerald-500" />
              <StatusBadge count={counts?.failed ?? 0} label="Gagal" color="text-rose-500" />
              <StatusBadge count={counts?.dead ?? 0} label="Dead" color="text-foreground/40" />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-2 border-t border-border/40">
              <Button
                size="sm"
                onClick={() => doAction('trigger_worker', 'Trigger Worker')}
                disabled={!!actionLoading}
              >
                <Play className={`w-3.5 h-3.5 mr-2 ${actionLoading === 'trigger_worker' ? 'animate-pulse' : ''}`} />
                Jalankan Worker
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => doAction('retry_failed', 'Retry Failed')}
                disabled={!!actionLoading || (counts?.failed ?? 0) === 0}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-2" />
                Retry Gagal ({counts?.failed ?? 0})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => doAction('reset_stuck', 'Reset Stuck')}
                disabled={!!actionLoading}
              >
                <Clock className="w-3.5 h-3.5 mr-2" />
                Reset Macet
              </Button>
              {actionMsg && (
                <span className="text-xs text-foreground/60 self-center">{actionMsg}</span>
              )}
            </div>

            {/* Recent failures */}
            {failures.length > 0 && (
              <div className="pt-2 border-t border-border/40">
                <p className="text-sm font-medium text-foreground/70 mb-3">Job Gagal / Dead Terbaru</p>
                <div className="space-y-2">
                  {failures.map(job => (
                    <div
                      key={job.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 text-xs"
                    >
                      <Badge
                        variant={job.status === 'dead' ? 'secondary' : 'destructive'}
                        className="shrink-0 mt-0.5"
                      >
                        {job.status}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground/80">
                          {job.resource_type} · {job.local_id.slice(0, 8)}…
                        </p>
                        <p className="text-foreground/50 mt-0.5 truncate">{job.last_error ?? '—'}</p>
                      </div>
                      <div className="text-right shrink-0 text-foreground/40">
                        <p>{job.attempts}/{job.max_attempts} percobaan</p>
                        <p>{relativeTime(job.updated_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Sentry Issues */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Error Monitoring (Sentry)</h2>
          <a
            href={`https://ursatrioo.sentry.io/projects/javascript-nextjs/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary flex items-center gap-1 hover:underline"
          >
            Buka Sentry <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <Card className="border border-border/40">
          <CardContent className="p-6">
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
                  <a
                    key={issue.id}
                    href={issue.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors text-xs group"
                  >
                    <Badge
                      variant={issue.level === 'error' || issue.level === 'fatal' ? 'destructive' : 'secondary'}
                      className="shrink-0 mt-0.5"
                    >
                      {issue.level}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground/80 truncate group-hover:text-foreground">
                        {issue.title}
                      </p>
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
      </section>
    </div>
  )
}
