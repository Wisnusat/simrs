"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from "react"
import { useRealtimeSync } from "@/hooks/use-realtime-sync"
import { usePolling } from "@/hooks/use-polling"
import DashboardLayout from "@/components/system/dashboard-layout"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Activity, CheckCircle, Clock, FlaskConical, LayoutDashboard, MapPin, TestTube, Mic } from "lucide-react"
import { useLabOrders } from "@/hooks/outpatient/use-lab-orders"
import { getEncounters, patchEncounter } from "@/lib/api/client"
import { ResultEntryForm, type LabParam } from "@/components/lab/result-entry-form"
import { StatCard } from "@/components/shared/stat-card"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import { announcePatient } from "@/lib/utils"
import type { LabOrder, LabOrderStatus, LabResultInput, Encounter } from "@/lib/types/outpatient"

const STATUS_CFG: Record<LabOrderStatus, { next: LabOrderStatus | null; nextLabel: string | null }> = {
  lab_ordered:     { next: "sample_taken",    nextLabel: "Ambil Sampel" },
  sample_taken:    { next: "processing",      nextLabel: "Mulai Analisa" },
  processing:      { next: "result_uploaded", nextLabel: "Input Hasil" },
  result_uploaded: { next: "verified",        nextLabel: "Verifikasi" },
  verified:        { next: null,              nextLabel: null },
}

const SIDEBAR = (active: string, set: (v: string) => void) => [
  { icon: LayoutDashboard, label: "Dashboard",      active: active === "dashboard",  onClick: () => set("dashboard") },
  { icon: TestTube,        label: "Antrian Lab",    active: active === "orders",     onClick: () => set("orders") },
  { icon: CheckCircle,     label: "Hasil Selesai",  active: active === "completed",  onClick: () => set("completed") },
]

export default function LabDashboard() {
  const [view,         setView]         = useState("dashboard")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [resultOrder,  setResultOrder]  = useState<LabOrder | null>(null)
  const [encounters,   setEncounters]   = useState<Encounter[]>([])
  const [encLoading,   setEncLoading]   = useState(false)
  const [labDoneId,    setLabDoneId]    = useState<string | null>(null) // encounter being completed
  const [callingId,    setCallingId]    = useState<string | null>(null)

  const { data: orders, loading, refresh, stats, advanceStatus, submitResults, actionLoading, error } = useLabOrders({ today: true })

  // Fetch encounters in waiting_lab status
  const refreshEncounters = useCallback(async () => {
    setEncLoading(true)
    try {
      const enc = await getEncounters({ status: "waiting_lab", today: true })
      setEncounters(enc)
    } catch { /* silent */ }
    finally { setEncLoading(false) }
  }, [])

  useEffect(() => { refreshEncounters() }, [refreshEncounters])

  useRealtimeSync({ table: 'encounters', filter: 'status=eq.waiting_lab', onchange: refreshEncounters })
  usePolling(refreshEncounters, 60_000)

  const handleRefreshAll = () => { refresh(); refreshEncounters() }

  const filtered = statusFilter === "all" ? orders : orders.filter((lo) => lo.status === statusFilter)
  const active   = orders.filter((lo) => !["result_uploaded", "verified"].includes(lo.status))

  const handleResultSubmit = async (results: LabResultInput[]) => {
    if (!resultOrder) return false
    const ok = await submitResults(resultOrder.id, results)
    if (ok) {
      // Auto-return outpatient encounter to doctor when results uploaded
      const isWaitingLab = encounters.some(e => e.id === resultOrder.encounter_id)
      if (isWaitingLab) {
        await patchEncounter(resultOrder.encounter_id, { status: "in_progress" } as any).catch(() => {})
      }
      setResultOrder(null)
      handleRefreshAll()
    }
    return ok
  }

  // Mark lab done manually (fallback — normally auto-triggered by handleResultSubmit)
  const handleLabDone = async (encounter: Encounter) => {
    setLabDoneId(encounter.id)
    try {
      await patchEncounter(encounter.id, { status: "in_progress" } as any)
      await refreshEncounters()
    } finally {
      setLabDoneId(null)
    }
  }

  const ActionButton = ({ order }: { order: LabOrder }) => {
    const cfg = STATUS_CFG[order.status]
    if (!cfg.next) return null
    if (cfg.next === "result_uploaded") {
      return (
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setResultOrder(order)} disabled={actionLoading}>
          {cfg.nextLabel}
        </Button>
      )
    }
    return (
      <Button size="sm" variant="outline" onClick={async () => { await advanceStatus(order.id, cfg.next!); handleRefreshAll() }} disabled={actionLoading}>
        {cfg.nextLabel}
      </Button>
    )
  }

  // Encounter card for the lab waiting queue
  const EncounterLabCard = ({ enc }: { enc: Encounter }) => {
    const latestVS = enc.vital_signs?.[0]
    const latestLab = enc.lab_orders?.[0]
    const isDone = latestLab?.status === "verified" || latestLab?.status === "result_uploaded"

    return (
      <Card className="border-blue-200 dark:border-blue-800">
        <CardContent className="pt-4 space-y-3">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <p className="font-semibold">{(enc as any).patients?.full_name}</p>
              <p className="text-sm text-foreground/60">No. MR: {(enc as any).patients?.medical_record_no ?? "—"}</p>
              <div className="flex items-center gap-1.5 mt-1 text-xs text-foreground/50">
                <MapPin className="w-3 h-3" />
                <span>Poli: {(enc as any).poli_services?.name ?? "—"}</span>
              </div>
            </div>
            <div className="text-right space-y-2">
              {!isDone && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-500 text-blue-600 hover:bg-blue-50"
                  onClick={() => {
                    setCallingId(enc.id)
                    announcePatient((enc as any).patients?.full_name, undefined, undefined, "silakan masuk ke ruang Laboratorium")
                    setTimeout(() => setCallingId(null), 1000)
                  }}
                  disabled={callingId === enc.id}
                >
                  <Mic className="w-4 h-4 mr-1" />
                  {callingId === enc.id ? "Memanggil..." : "Panggil"}
                </Button>
              )}
              {isDone && <Badge variant="default" className="block text-xs bg-green-600">Hasil Siap</Badge>}
            </div>
          </div>

          {/* Vital signs strip */}
          {latestVS && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 rounded-md bg-muted/40 text-xs">
              {latestVS.systolic_bp && <span>TD: <strong>{latestVS.systolic_bp}/{latestVS.diastolic_bp}</strong></span>}
              {latestVS.heart_rate  && <span>Nadi: <strong>{latestVS.heart_rate} bpm</strong></span>}
              {latestVS.temperature && <span>Suhu: <strong>{latestVS.temperature}°C</strong></span>}
              {latestVS.oxygen_saturation && <span>SpO₂: <strong>{latestVS.oxygen_saturation}%</strong></span>}
            </div>
          )}

          {/* Lab orders */}
          {enc.lab_orders && enc.lab_orders.length > 0 && (
            <div className="space-y-1">
              {enc.lab_orders.map((lo: any) => (
                <div key={lo.id} className="flex justify-between items-center text-sm p-2 rounded bg-muted/30">
                  <span>{lo.lab_order_items?.map((i: any) => i.test_name).join(", ")}</span>
                  <StatusBadge status={lo.status} />
                </div>
              ))}
            </div>
          )}

          {/* Done button — only when at least one order is verified/result_uploaded */}
          {isDone && (
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              disabled={labDoneId === enc.id}
              onClick={() => handleLabDone(enc)}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {labDoneId === enc.id ? "Memproses..." : "Selesai — Kembalikan ke Dokter"}
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <DashboardLayout title="Laboratorium" role="lab_nurse" sidebarItems={SIDEBAR(view, setView)}>
      {/* DASHBOARD */}
      {view === "dashboard" && (
        <div className="space-y-6">
          <PageHeader title="Dashboard Laboratorium" description="Kelola permintaan dan hasil lab" onRefresh={handleRefreshAll} isRefreshing={loading || encLoading} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Menunggu Lab"     value={encounters.length} icon={FlaskConical} colorClass="text-blue-600" />
            <StatCard label="Menunggu Sampel"  value={stats.pending}     icon={Clock}        colorClass="text-orange-600" />
            <StatCard label="Sedang Diproses"  value={stats.processing}  icon={Activity}     colorClass="text-blue-500" />
            <StatCard label="Selesai"          value={stats.done}        icon={CheckCircle}  colorClass="text-green-600" />
          </div>

          {/* Encounters waiting for lab */}
          <div>
            <h3 className="text-base font-semibold mb-3">Pasien Menunggu Pemeriksaan Lab</h3>
            {encounters.length === 0 && !encLoading
              ? <EmptyState message="Tidak ada pasien yang menunggu lab." icon={FlaskConical} />
              : <div className="grid md:grid-cols-2 gap-4">
                  {encounters.map((enc) => <EncounterLabCard key={enc.id} enc={enc} />)}
                </div>
            }
          </div>

          {/* Active lab orders */}
          <div>
            <h3 className="text-base font-semibold mb-3">Order Lab Aktif</h3>
            <div className="space-y-2">
              {active.slice(0, 6).map((lo) => (
                <div key={lo.id} className="flex justify-between items-center p-3 rounded-lg bg-muted/40">
                  <div>
                    <p className="font-medium">{lo.patients.full_name}</p>
                    <p className="text-sm text-foreground/60">{lo.lab_order_items.map((i) => i.test_name).join(", ")}</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <StatusBadge status={lo.status} />
                    <ActionButton order={lo} />
                  </div>
                </div>
              ))}
              {active.length === 0 && !loading && <EmptyState message="Tidak ada order lab yang tertunda." icon={FlaskConical} />}
            </div>
          </div>
        </div>
      )}

      {/* ALL ORDERS */}
      {view === "orders" && (
        <div className="space-y-6">
          <PageHeader title="Antrian Lab" description="Semua order dan pasien menunggu hari ini" onRefresh={handleRefreshAll} isRefreshing={loading || encLoading}>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Filter status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="lab_ordered">Menunggu Sampel</SelectItem>
                <SelectItem value="sample_taken">Sampel Diambil</SelectItem>
                <SelectItem value="processing">Dianalisa</SelectItem>
                <SelectItem value="result_uploaded">Hasil Diupload</SelectItem>
                <SelectItem value="verified">Terverifikasi</SelectItem>
              </SelectContent>
            </Select>
          </PageHeader>

          {/* Encounter waiting cards */}
          {encounters.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground/60 mb-3">PASIEN MENUNGGU LAB ({encounters.length})</h3>
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                {encounters.map((enc) => <EncounterLabCard key={enc.id} enc={enc} />)}
              </div>
            </div>
          )}

          <Card>
            <CardHeader><CardTitle>Order Lab</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pasien</TableHead>
                    <TableHead>MR</TableHead>
                    <TableHead>Pemeriksaan</TableHead>
                    <TableHead>Prioritas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((lo) => (
                    <TableRow key={lo.id}>
                      <TableCell className="font-medium">{lo.patients.full_name}</TableCell>
                      <TableCell className="text-foreground/60">{lo.patients.medical_record_no ?? "—"}</TableCell>
                      <TableCell>{lo.lab_order_items.map((i) => i.test_name).join(", ")}</TableCell>
                      <TableCell><Badge variant="outline">{lo.priority}</Badge></TableCell>
                      <TableCell><StatusBadge status={lo.status} /></TableCell>
                      <TableCell><ActionButton order={lo} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filtered.length === 0 && !loading && <EmptyState message="Tidak ada permintaan lab." />}
            </CardContent>
          </Card>
        </div>
      )}

      {/* COMPLETED */}
      {view === "completed" && (
        <div className="space-y-6">
          <PageHeader title="Hasil Selesai" description="Hasil yang sudah diupload atau terverifikasi" onRefresh={handleRefreshAll} isRefreshing={loading} />
          {orders.filter((lo) => ["result_uploaded", "verified"].includes(lo.status)).map((lo) => (
            <Card key={lo.id}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <p className="font-semibold">{lo.patients.full_name}</p>
                    <p className="text-sm text-foreground/60">MR: {lo.patients.medical_record_no ?? "—"} · Dr. {lo.doctor.full_name}</p>
                  </div>
                  <StatusBadge status={lo.status} />
                </div>
                {lo.lab_order_items.map((item) => {
                  let parsed: LabParam[] | null = null
                  if (item.result_value) {
                    try {
                      const p = JSON.parse(item.result_value)
                      if (Array.isArray(p) && p.length > 0 && "label" in p[0]) parsed = p
                    } catch {}
                  }
                  return (
                    <div key={item.id} className="p-2 rounded bg-muted/30 space-y-1.5">
                      <p className="text-sm font-semibold">{item.test_name}</p>
                      {parsed ? (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-foreground/50">
                              <th className="text-left font-normal pb-1">Parameter</th>
                              <th className="text-left font-normal pb-1">Nilai</th>
                              <th className="text-left font-normal pb-1">Rujukan</th>
                              <th className="text-right font-normal pb-1">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsed.map((p, i) => (
                              <tr key={i} className="border-t border-border/30">
                                <td className="py-0.5 font-medium">{p.label || "—"}</td>
                                <td className="py-0.5">{p.value || "—"} {p.unit}</td>
                                <td className="py-0.5 text-foreground/60">{p.reference_range || "—"}</td>
                                <td className="py-0.5 text-right">
                                  <Badge variant={
                                    p.result_status === "critical" ? "destructive"
                                    : p.result_status?.startsWith("abnormal") ? "secondary"
                                    : "default"
                                  } className="text-xs">
                                    {p.result_status === "normal" ? "Normal"
                                      : p.result_status === "abnormal_low" ? "↓ Rendah"
                                      : p.result_status === "abnormal_high" ? "↑ Tinggi"
                                      : p.result_status === "critical" ? "Kritis" : "—"}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-sm text-foreground/60">{item.result_value ?? "—"}</p>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ))}
          {orders.filter((lo) => ["result_uploaded", "verified"].includes(lo.status)).length === 0 && (
            <EmptyState message="Belum ada hasil lab yang selesai." icon={FlaskConical} />
          )}
        </div>
      )}

      {/* Result Entry Dialog */}
      <Dialog open={!!resultOrder} onOpenChange={(o) => { if (!o) setResultOrder(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogTitle>Input Hasil Pemeriksaan Lab</DialogTitle>
          {resultOrder && (
            <ResultEntryForm
              order={resultOrder}
              onSubmit={handleResultSubmit}
              onCancel={() => setResultOrder(null)}
              loading={actionLoading}
              error={error}
            />
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
