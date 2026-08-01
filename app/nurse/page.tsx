"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from "react"
import DashboardLayout from "@/components/system/dashboard-layout"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Activity, CheckCircle, Clock, LayoutDashboard, Users, UserPlus, BedDouble } from "lucide-react"
import { useQueue } from "@/hooks/outpatient/use-queue"
import { useVitalSigns } from "@/hooks/outpatient/use-vital-signs"
import { createEncounter, patchQueueStatus, postAllergy } from "@/lib/api/client"
import { QueueCard } from "@/components/nurse/queue-card"
import { VitalSignsForm } from "@/components/nurse/vital-signs-form"
import { StatCard } from "@/components/shared/stat-card"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { StatusBadge } from "@/components/shared/status-badge"
import type { QueueEntry } from "@/lib/types/outpatient"
import { WalkinRegistrationForm } from "@/components/nurse/walkin-registration-form"
import { AdmissionRequestsView } from "@/components/nurse/admission-requests-view"
import { announcePatient } from "@/lib/utils"
import { SurgeryDashboard } from "@/components/doctor/surgery-dashboard"

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
const SIDEBAR = (active: string, set: (v: string) => void) => [
  { icon: LayoutDashboard, label: "Dashboard", active: active === "dashboard", onClick: () => set("dashboard") },
  { icon: Users, label: "Antrian Pasien", active: active === "queue", onClick: () => set("queue") },
  // { icon: UserPlus, label: "Registrasi Walk-In", active: active === "walkin", onClick: () => set("walkin") },
  { icon: BedDouble, label: "Permintaan Rawat Inap", active: active === "admissions", onClick: () => set("admissions") },
  { icon: Activity, label: "Dashboard Operasi (OK)", active: active === "surgery", onClick: () => set("surgery") },
  { icon: Clock, label: "Riwayat", active: active === "history", onClick: () => set("history") },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function NurseDashboard() {
  const [view, setView] = useState("dashboard")
  /** Entry selected for vital signs input (status: "called", encounter exists) */
  const [selected, setSelected] = useState<QueueEntry | null>(null)
  /** ID of entry currently being "called" (disables button during async ops) */
  const [callingId, setCallingId] = useState<string | null>(null)
  const [callError, setCallError] = useState<string | null>(null)
  const [poliServiceId, setPoliServiceId] = useState<string | undefined>(undefined)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.success && d.data.poli_service_id) setPoliServiceId(d.data.poli_service_id) })
      .catch(() => {})
  }, [])

  const { data: queue, loading, refresh, stats } = useQueue({ poliServiceId })
  const { submit, loading: vsLoading, error: vsError, clearError } = useVitalSigns()

  const [preparingEncounter, setPreparingEncounter] = useState<string | null>(null)

  // ── Stage 1: Nurse clicks "Panggil" ──────────────────────────────────────
  const handleCallPatient = useCallback(async (entry: QueueEntry) => {
    setCallingId(entry.id)
    setCallError(null)
    try {
      if (entry.status === "waiting") {
        await patchQueueStatus(entry.id, "called")
      }
      // Announce via TTS
      announcePatient(entry.patients.full_name, entry.queue_number)

      if (entry.status === "waiting") {
        await refresh()
      }
    } catch (err: unknown) {
      setCallError(err instanceof Error ? err.message : "Gagal memanggil pasien")
    } finally {
      setCallingId(null)
    }
  }, [refresh])

  // ── Stage 2: Nurse opens vital signs form ────────────────────────────────
  const handleOpenVitalSigns = useCallback(async (entry: QueueEntry) => {
    clearError()
    if (!entry.encounter) {
      setPreparingEncounter(entry.id)
      try {
        const enc = await createEncounter({
          patient_id: entry.patient_id,
          poli_service_id: entry.poli_service_id,
          appointment_id: entry.appointment_id,
          queue_id: entry.id,
          payment_type: entry.appointments?.payment_type,
          encounter_class: "outpatient",
        })
        setSelected({ ...entry, encounter: { id: enc.id, status: "planned" } })
        refresh() // Refresh list in background
      } catch (err: unknown) {
        setCallError(err instanceof Error ? err.message : "Gagal membuat kunjungan")
      } finally {
        setPreparingEncounter(null)
      }
    } else {
      setSelected(entry)
    }
  }, [clearError, refresh])

  // ── Vital signs submitted ─────────────────────────────────────────────────
  const handleVitalSignsSubmit = useCallback(
    async (input: Parameters<typeof submit>[0], allergyInput?: any) => {
      const ok = await submit(input)
      if (ok) {
        if (allergyInput) {
          try {
            await postAllergy(allergyInput)
          } catch (err) {
            console.error("Gagal menyimpan data alergi:", err)
          }
        }
        setSelected(null)
        refresh()
      }
      return ok
    },
    [submit, refresh],
  )

  // Encounter ID comes from the enriched queue entry (populated after "called")
  const encounterId = selected?.encounter?.id ?? null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout title="Perawat" role="nurse" sidebarItems={SIDEBAR(view, setView)}>
      {/* ── DASHBOARD ── */}
      {view === "dashboard" && (
        <div className="space-y-6">
          <PageHeader
            title="Dashboard Perawat"
            description="Kelola antrian dan tanda vital pasien rawat jalan"
            onRefresh={refresh}
            isRefreshing={loading}
          />

          {callError && (
            <Alert variant="destructive">
              <AlertDescription>{callError}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Pasien" value={stats.total} icon={Users} colorClass="text-blue-600" />
            <StatCard label="Menunggu" value={stats.waiting} icon={Clock} colorClass="text-orange-600" />
            <StatCard label="Tanda Vital Dicatat" value={stats.vitalSignsRecorded} icon={CheckCircle} colorClass="text-green-600" />
            <StatCard label="Selesai" value={stats.done} icon={Activity} colorClass="text-pink-600" />
          </div>

          <Card>
            <CardHeader><CardTitle>Antrian Hari Ini</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {queue
                .filter((q) => q.status === "waiting" || q.status === "called")
                .slice(0, 8)
                .map((entry) => (
                  <QueueCard
                    key={entry.id}
                    entry={entry}
                    onCallPatient={handleCallPatient}
                    onInputVitalSigns={handleOpenVitalSigns}
                    calling={callingId === entry.id || preparingEncounter === entry.id}
                  />
                ))}
              {stats.waiting === 0 && (
                <EmptyState message="Tidak ada pasien yang menunggu." icon={Users} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Form Pendaftaran</CardTitle>
            </CardHeader>
            <CardContent>
              <WalkinRegistrationForm onSuccess={() => {
                refresh()
                // setView("queue") // Switch to queue view to see the new patient
              }} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── QUEUE ── */}
      {view === "queue" && (
        <div className="space-y-6">
          <PageHeader
            title="Antrian Pasien"
            description="Antrian aktif hari ini"
            onRefresh={refresh}
            isRefreshing={loading}
          />

          {callError && (
            <Alert variant="destructive">
              <AlertDescription>{callError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            {queue
              .filter((q) => q.status === "waiting" || q.status === "called" || q.status === "in_service")
              .map((entry) => (
                <QueueCard
                  key={entry.id}
                  entry={entry}
                  onCallPatient={handleCallPatient}
                  onInputVitalSigns={handleOpenVitalSigns}
                  calling={callingId === entry.id}
                />
              ))}
            {queue.filter((q) => q.status === "waiting" || q.status === "called" || q.status === "in_service").length === 0 && !loading && (
              <EmptyState message="Tidak ada antrian aktif hari ini." icon={Users} />
            )}
          </div>
        </div>
      )}

      {/* ── HISTORY ── */}
      {view === "history" && (
        <div className="space-y-6">
          <PageHeader
            title="Riwayat Tanda Vital"
            description="Pasien yang sudah dicatat hari ini"
            onRefresh={refresh}
            isRefreshing={loading}
          />
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Antrian</TableHead>
                    <TableHead>Nama Pasien</TableHead>
                    <TableHead>No. MR</TableHead>
                    <TableHead>Keluhan</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.filter((q) => q.vital_signs_recorded).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>#{entry.queue_number}</TableCell>
                      <TableCell className="font-medium">{entry.patients.full_name}</TableCell>
                      <TableCell>{entry.patients.medical_record_no ?? "—"}</TableCell>
                      <TableCell>{entry.appointments?.chief_complaint ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={entry.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {queue.filter((q) => q.vital_signs_recorded).length === 0 && (
                <EmptyState message="Belum ada tanda vital yang dicatat." />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── WALKIN REGISTRATION ── */}
      {/* {view === "walkin" && (
        <div className="space-y-6">
          <PageHeader
            title="Registrasi Walk-In"
            description="Pendaftaran pasien offline / di tempat"
            onRefresh={refresh}
            isRefreshing={loading}
          />
          <Card>
            <CardHeader>
              <CardTitle>Form Pendaftaran</CardTitle>
            </CardHeader>
            <CardContent>
              <WalkinRegistrationForm onSuccess={() => {
                refresh()
                setView("queue") // Switch to queue view to see the new patient
              }} />
            </CardContent>
          </Card>
        </div>
      )} */}

      {/* ── ADMISSION REQUESTS ── */}
      {view === "admissions" && (
        <AdmissionRequestsView />
      )}

      {/* ── SURGERY DASHBOARD ── */}
      {view === "surgery" && (
        <SurgeryDashboard role="nurse" />
      )}

      {/* ── Vital Signs Dialog ── */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogTitle>Input Tanda Vital</DialogTitle>
          {selected && encounterId ? (
            <VitalSignsForm
              encounterId={encounterId}
              patientId={selected.patient_id}
              queueId={selected.id}
              patientName={selected.patients.full_name}
              queueNumber={selected.queue_number}
              onSubmit={handleVitalSignsSubmit}
              onCancel={() => setSelected(null)}
              loading={vsLoading}
              error={vsError}
            />
          ) : selected && !encounterId ? (
            <Alert>
              <AlertDescription>
                Encounter belum tersedia. Pastikan pasien sudah dipanggil terlebih dahulu.
              </AlertDescription>
            </Alert>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
