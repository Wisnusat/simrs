"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/system/dashboard-layout"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangle, ClipboardList, FlaskConical, History, LayoutDashboard, Pill, Users, Activity, Heart, Thermometer, BedDouble, Loader2 } from "lucide-react"
import { useQueue } from "@/hooks/outpatient/use-queue"
import { useLabOrders } from "@/hooks/outpatient/use-lab-orders"
import { usePrescriptions } from "@/hooks/outpatient/use-prescriptions"
import { patchEncounter, getDiagnoses, getClinicalNotes } from "@/lib/api/client"
import { LabOrderForm } from "@/components/doctor/lab-order-form"
import ExaminationForm from "@/components/doctor/examination-form"
import { StatCard } from "@/components/shared/stat-card"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import { useAdmissions } from "@/hooks/inpatient/use-admissions"
import { InpatientPatientList } from "@/components/inpatient/patient-list"
import { InpatientVisitForm } from "@/components/doctor/inpatient-visit-form"
import type { QueueEntry, InpatientAdmission } from "@/lib/types/outpatient"
import { SurgeryDashboard } from "@/components/doctor/surgery-dashboard"
import { useSurgeryCount } from "@/hooks/use-surgery-count"

const SIDEBAR = (active: string, set: (v: string) => void, surgeryCount = 0) => [
  { icon: LayoutDashboard, label: "Dashboard", active: active === "dashboard", onClick: () => set("dashboard") },
  { icon: Users, label: "Pasien Hari Ini", active: active === "patients", onClick: () => set("patients") },
  // { icon: FlaskConical,    label: "Permintaan Lab",         active: active === "lab",           onClick: () => set("lab") },
  { icon: AlertTriangle, label: "IGD", href: "/emergency" },
  { icon: Activity, label: "Dashboard Operasi (OK)", active: active === "surgery", onClick: () => set("surgery"), badge: surgeryCount || undefined },
  { icon: BedDouble, label: "Rawat Inap", active: active === "inpatient", onClick: () => set("inpatient") },
  { icon: Pill, label: "Resep Obat", active: active === "prescriptions", onClick: () => set("prescriptions") },
  { icon: History, label: "Riwayat Pemeriksaan", active: active === "history", onClick: () => set("history") },
]

export default function DoctorDashboard() {
  const [view, setView] = useState("dashboard")
  const surgeryCount = useSurgeryCount()
  const [examEntry, setExamEntry] = useState<QueueEntry | null>(null)
  const [labEntry, setLabEntry] = useState<QueueEntry | null>(null)
  const [inpatientVisit, setInpatientVisit] = useState<InpatientAdmission | null>(null)
  const [poliServiceId, setPoliServiceId] = useState<string | undefined>(undefined)
  const [historyDetail, setHistoryDetail] = useState<{ entry: QueueEntry; diagnoses: any[]; notes: any[] } | null>(null)
  const [historyDetailLoading, setHistoryDetailLoading] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.success && d.data.poli_service_id) setPoliServiceId(d.data.poli_service_id) })
      .catch(() => {})
  }, [])

  const { data: queue, loading: qLoading, refresh: refreshQueue, stats: qStats } = useQueue({ poliServiceId })
  const { create: createLab, actionLoading: labActing, error: labError } = useLabOrders({ today: true })
  const { data: prescriptions, loading: rxLoading, refresh: refreshRx, stats: rxStats } = usePrescriptions({ today: true })
  const { data: inpatientAdmissions, loading: ipLoading, refresh: refreshIp, stats: ipStats } = useAdmissions()

  // Patients with vital signs that are ready for doctor examination
  // Include in_progress and waiting_lab (returned from lab, need re-examination)
  const readyPatients = queue.filter((q) =>
    q.vital_signs_recorded &&
    q.encounter?.status !== "finished"
  )

  const handleExamSave = () => { setExamEntry(null); refreshQueue(); setView("patients") }

  const handleOpenHistoryDetail = async (entry: QueueEntry) => {
    if (!entry.encounter?.id) return
    setHistoryDetailLoading(entry.id)
    try {
      const [diagnoses, notes] = await Promise.all([
        getDiagnoses(entry.encounter.id),
        getClinicalNotes(entry.encounter.id),
      ])
      setHistoryDetail({ entry, diagnoses, notes })
    } catch {
      setHistoryDetail({ entry, diagnoses: [], notes: [] })
    } finally {
      setHistoryDetailLoading(null)
    }
  }

  const handleLabSubmit = async (input: Parameters<typeof createLab>[0]) => {
    const ok = await createLab(input)
    if (ok && labEntry?.encounter?.id) {
      // Change encounter to waiting_lab so lab dashboard picks it up
      await patchEncounter(labEntry.encounter.id, { status: "waiting_lab" } as any)
      refreshQueue()
    }
    if (ok) setLabEntry(null)
    return ok
  }

  // Vital signs chip for patient cards
  const VitalChip = ({ entry }: { entry: QueueEntry }) => {
    const vs = (entry as any).vital_signs?.[0]
    if (!vs) return null
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
        {vs.systolic_bp && (
          <span className="flex items-center gap-1 text-xs text-foreground/50">
            <Heart className="w-3 h-3 text-red-400" /> {vs.systolic_bp}/{vs.diastolic_bp}
          </span>
        )}
        {vs.heart_rate && (
          <span className="flex items-center gap-1 text-xs text-foreground/50">
            <Activity className="w-3 h-3 text-pink-400" /> {vs.heart_rate} bpm
          </span>
        )}
        {vs.temperature && (
          <span className="flex items-center gap-1 text-xs text-foreground/50">
            <Thermometer className="w-3 h-3 text-orange-400" /> {vs.temperature}°C
          </span>
        )}
      </div>
    )
  }

  return (
    <DashboardLayout title="Dokter" role="doctor" sidebarItems={SIDEBAR(view, setView, surgeryCount)}>
      {/* DASHBOARD */}
      {view === "dashboard" && (
        <div className="space-y-6">
          <PageHeader title="Dashboard Dokter" description="Kelola pemeriksaan pasien rawat jalan"
            onRefresh={() => { refreshQueue(); refreshRx() }} isRefreshing={qLoading} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard label="Pasien Siap Diperiksa" value={readyPatients.length} icon={Users} colorClass="text-blue-600" />
            {/* <StatCard label="Sedang Diperiksa"      value={qStats.inService}        icon={ClipboardList} colorClass="text-orange-600" /> */}
            <StatCard label="Resep Menunggu" value={rxStats.active} icon={Pill} colorClass="text-purple-600" />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Pasien Siap Diperiksa</CardTitle><CardDescription>Tanda vital sudah dicatat</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {readyPatients.slice(0, 4).map((q) => (
                  <div key={q.id} className="flex justify-between items-center p-3 rounded-lg bg-muted/40">
                    <div>
                      <p className="font-medium">{q.patients.full_name}</p>
                      <p className="text-sm text-foreground/60">{q.appointments?.chief_complaint ?? "—"}</p>
                      {q.encounter?.status === "waiting_lab" && (
                        <Badge variant="secondary" className="mt-1 text-xs">🔬 Sedang di Lab</Badge>
                      )}
                    </div>
                    <StatusBadge status={q.encounter?.status ?? q.status} />
                  </div>
                ))}
                {readyPatients.length === 0 && <EmptyState message="Belum ada pasien siap diperiksa." />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Resep Hari Ini</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {prescriptions.slice(0, 4).map((rx) => (
                  <div key={rx.id} className="flex justify-between items-center p-3 rounded-lg bg-muted/40">
                    <div>
                      <p className="font-medium">{rx.patients.full_name}</p>
                      <p className="text-sm text-foreground/60">{rx.prescription_items.length} obat</p>
                    </div>
                    <StatusBadge status={rx.status} />
                  </div>
                ))}
                {prescriptions.length === 0 && <EmptyState message="Belum ada resep hari ini." />}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* PATIENTS */}
      {view === "patients" && (
        <div className="space-y-6">
          <PageHeader title="Pasien Hari Ini" description="Pasien yang siap diperiksa" onRefresh={refreshQueue} isRefreshing={qLoading} />
          <div className="space-y-3">
            {readyPatients.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <Badge variant="outline" className="font-mono shrink-0">#{entry.queue_number}</Badge>
                  <div>
                    <p className="font-semibold">{entry.patients.full_name}</p>
                    <p className="text-sm text-foreground/60">No. MR: {entry.patients.medical_record_no ?? "—"}</p>
                    <p className="text-sm text-foreground/60">Keluhan: {entry.appointments?.chief_complaint ?? "—"}</p>
                    <VitalChip entry={entry} />
                    {entry.encounter?.status === "waiting_lab" && (
                      <Badge variant="outline" className="mt-1 text-xs border-orange-400 text-orange-600">🔬 Menunggu Hasil Lab</Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 items-center shrink-0">
                  <StatusBadge status={entry.encounter?.status ?? entry.status} />
                  {entry.encounter?.id && (
                    <>
                      {entry.encounter?.status === "waiting_lab" ? (
                        <Button size="sm" variant="outline" disabled className="text-orange-600 border-orange-400">
                          🔬 Sedang di Lab
                        </Button>
                      ) : (
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => { setExamEntry(entry); setView("examination") }}>
                          Mulai Periksa
                        </Button>
                      )}
                      {entry.encounter?.status !== "waiting_lab" && (
                        <Button size="sm" variant="outline" onClick={() => setLabEntry(entry)}>
                          <FlaskConical className="w-4 h-4 mr-1" />Lab
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {readyPatients.length === 0 && !qLoading && <EmptyState message="Belum ada pasien siap diperiksa." icon={Users} />}
          </div>
        </div>
      )}

      {/* ── SURGERY DASHBOARD ── */}
      {view === "surgery" && (
        <SurgeryDashboard role="doctor" />
      )}

      {/* HISTORY */}
      {view === "history" && (
        <div className="space-y-6">
          <PageHeader title="Riwayat Pemeriksaan" description="Selesai diperiksa hari ini" onRefresh={refreshQueue} isRefreshing={qLoading} />
          <div className="space-y-3">
            {queue.filter((q) => q.encounter?.status === "finished").map((entry) => (
              <div key={entry.id} className="flex justify-between items-center p-4 border rounded-lg gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{entry.patients.full_name}</p>
                  <p className="text-xs text-foreground/50">{entry.patients.medical_record_no ?? "—"} · #{entry.queue_number}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={entry.encounter?.status ?? entry.status} />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={historyDetailLoading === entry.id}
                    onClick={() => handleOpenHistoryDetail(entry)}
                  >
                    {historyDetailLoading === entry.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : "Lihat Detail"}
                  </Button>
                </div>
              </div>
            ))}
            {queue.filter((q) => q.encounter?.status === "finished").length === 0 && !qLoading && (
              <EmptyState message="Belum ada pasien yang selesai hari ini." />
            )}
          </div>
        </div>
      )}

      {/* LAB REQUESTS (doctor's view — read-only) */}
      {/* {view === "lab" && (
        <div className="space-y-6">
          <PageHeader title="Permintaan Lab" description="Lab yang dipesan hari ini" onRefresh={refreshLab} isRefreshing={labLoading} />
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pasien</TableHead>
                    <TableHead>MR</TableHead>
                    <TableHead>Pemeriksaan</TableHead>
                    <TableHead>Prioritas</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {labOrders.map((lo) => (
                    <TableRow key={lo.id}>
                      <TableCell className="font-medium">{lo.patients.full_name}</TableCell>
                      <TableCell className="text-foreground/60">{lo.patients.medical_record_no ?? "—"}</TableCell>
                      <TableCell>{lo.lab_order_items.map((i) => i.test_name).join(", ")}</TableCell>
                      <TableCell><Badge variant="outline">{lo.priority}</Badge></TableCell>
                      <TableCell><StatusBadge status={lo.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {labOrders.length === 0 && !labLoading && <EmptyState message="Belum ada permintaan lab." />}
            </CardContent>
          </Card>
        </div>
      )} */}

      {/* PRESCRIPTIONS (doctor's readonly view) */}
      {view === "prescriptions" && (
        <div className="space-y-6">
          <PageHeader title="Resep Obat" description="Resep yang ditulis hari ini" onRefresh={refreshRx} isRefreshing={rxLoading} />
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pasien</TableHead>
                    <TableHead>Jumlah Obat</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prescriptions.map((rx) => (
                    <TableRow key={rx.id}>
                      <TableCell className="font-medium">{rx.patients.full_name}</TableCell>
                      <TableCell>{rx.prescription_items.length} obat</TableCell>
                      <TableCell><StatusBadge status={rx.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {prescriptions.length === 0 && !rxLoading && <EmptyState message="Belum ada resep hari ini." />}
            </CardContent>
          </Card>
        </div>
      )}

      {view === "examination" && examEntry?.encounter?.id && (
        <ExaminationForm
          patient={{ id: examEntry.patients.id, full_name: examEntry.patients.full_name, medical_record_no: examEntry.patients.medical_record_no }}
          encounterId={examEntry.encounter.id}
          queueId={examEntry.id}
          chiefComplaint={examEntry.appointments?.chief_complaint}
          queueNumber={examEntry.queue_number}
          onSave={handleExamSave}
          onCancel={() => { setExamEntry(null); setView("patients") }}
        />
      )}

      {/* INPATIENT */}
      {view === "inpatient" && !inpatientVisit && (
        <div className="space-y-6">
          <PageHeader title="Pasien Rawat Inap" description="Pasien yang anda tangani sebagai DPJP" onRefresh={refreshIp} isRefreshing={ipLoading} />
          <InpatientPatientList
            admissions={inpatientAdmissions}
            loading={ipLoading}
            onSelect={(adm) => { setInpatientVisit(adm); setView("inpatient-visit") }}
          />
        </div>
      )}

      {/* INPATIENT VISIT */}
      {(view === "inpatient-visit" || view === "inpatient") && inpatientVisit && (
        <InpatientVisitForm
          admission={inpatientVisit}
          onBack={() => { setInpatientVisit(null); setView("inpatient") }}
          onDischarge={() => { setInpatientVisit(null); refreshIp(); setView("inpatient") }}
        />
      )}

      {/* Lab Order Dialog */}
      <Dialog open={!!labEntry} onOpenChange={(o) => { if (!o) setLabEntry(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Permintaan Pemeriksaan Lab</DialogTitle>
          {labEntry?.encounter?.id && (
            <LabOrderForm
              encounterId={labEntry.encounter.id}
              patientId={labEntry.patients.id}
              onSubmit={handleLabSubmit}
              onCancel={() => setLabEntry(null)}
              loading={labActing}
              error={labError}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* History Detail Dialog */}
      <Dialog open={!!historyDetail} onOpenChange={(o) => { if (!o) setHistoryDetail(null) }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogTitle>
            Detail Pemeriksaan — {historyDetail?.entry.patients.full_name}
          </DialogTitle>
          {historyDetail && (
            <div className="space-y-4 text-sm">
              <p className="text-foreground/50 text-xs">
                {historyDetail.entry.patients.medical_record_no} · #{historyDetail.entry.queue_number}
              </p>

              {/* Diagnoses */}
              <div>
                <p className="font-semibold mb-1.5">Diagnosis</p>
                {historyDetail.diagnoses.length === 0 ? (
                  <p className="text-foreground/50">Tidak ada diagnosis tercatat.</p>
                ) : (
                  <div className="space-y-1">
                    {historyDetail.diagnoses.map((d: any) => (
                      <div key={d.id} className="flex items-start gap-2">
                        <Badge variant="outline" className="font-mono text-xs shrink-0">{d.icd10_code}</Badge>
                        <span className="text-foreground/80">{d.icd10_display}</span>
                        {d.diagnosis_type === 'primary' && (
                          <Badge className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shrink-0">Utama</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SOAP Notes */}
              {historyDetail.notes.length > 0 && (() => {
                const note = historyDetail.notes[0]
                return (
                  <div className="space-y-2">
                    <p className="font-semibold">Catatan SOAP</p>
                    {note.subjective && (
                      <div><p className="text-xs text-foreground/50 uppercase tracking-wide">Subjektif (Keluhan)</p><p>{note.subjective}</p></div>
                    )}
                    {note.objective && (
                      <div><p className="text-xs text-foreground/50 uppercase tracking-wide">Objektif</p><p>{note.objective}</p></div>
                    )}
                    {note.assessment && (
                      <div><p className="text-xs text-foreground/50 uppercase tracking-wide">Assessment</p><p>{note.assessment}</p></div>
                    )}
                    {note.plan && (
                      <div><p className="text-xs text-foreground/50 uppercase tracking-wide">Plan</p><p>{note.plan}</p></div>
                    )}
                  </div>
                )
              })()}

              {historyDetail.notes.length === 0 && historyDetail.diagnoses.length === 0 && (
                <p className="text-foreground/50">Belum ada data pemeriksaan yang tercatat.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
