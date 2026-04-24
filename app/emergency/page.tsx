"use client"

import { useState } from "react"
import DashboardLayout from "@/components/system/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  LayoutDashboard, AlertTriangle, Activity, Pill, UserPlus,
  ArrowLeft, Clock, BedDouble, FlaskConical, Stethoscope
} from "lucide-react"

import { useEmergency } from "@/hooks/emergency/use-emergency"
import { EmergencyIntakeForm } from "@/components/emergency/emergency-intake-form"
import { EmergencyTriageForm } from "@/components/emergency/emergency-triage-form"
import { EmergencyDispositionForm } from "@/components/emergency/emergency-disposition-form"

import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { LabOrderForm } from "@/components/doctor/lab-order-form"
import { useLabOrders } from "@/hooks/outpatient/use-lab-orders"
import type { EmergencyEncounter } from "@/lib/types/outpatient"
import { CpptForm } from "@/components/inpatient/cppt-form" // Reuse CPPT or make another text notes element

const SIDEBAR = (active: string, set: (v: string) => void) => [
  { icon: LayoutDashboard, label: "Dashboard IGD", active: active === "dashboard", onClick: () => set("dashboard") },
  { icon: Activity,        label: "Daftar Pasien", active: active === "patients",  onClick: () => set("patients") },
]

export default function EmergencyDashboard() {
  const [view, setView] = useState("dashboard")
  const [selectedAdm, setSelectedAdm] = useState<EmergencyEncounter | null>(null)
  const [showIntake, setShowIntake] = useState(false)

  // Fetch only active ones for main dashboard
  const { data: encounters, loading: encLoading, refresh: refreshEnc } = useEmergency({ limit: 50 })
  
  const activeEncounters = encounters.filter(e => !["completed", "referred_out", "admitted_to_inpatient"].includes(e.status))
  
  const stats = {
    total: activeEncounters.length,
    critical: activeEncounters.filter(e => e.is_critical).length,
    waitingTriage: activeEncounters.filter(e => e.status === "emergency_admitted").length,
  }

  // Lab orders for selected encounter
  const { data: labOrders, create: createLab, actionLoading: labActing, error: labError } = useLabOrders({
    encounterId: selectedAdm?.encounter_id ?? undefined,
    pollIntervalMs: 0,
  })

  const getTriageBadge = (triage: string) => {
    switch(triage) {
      case "P1": return <Badge variant="destructive">P1 (Merah)</Badge>
      case "P2": return <Badge className="bg-yellow-500 hover:bg-yellow-600">P2 (Kuning)</Badge>
      case "P3": return <Badge className="bg-green-500 hover:bg-green-600">P3 (Hijau)</Badge>
      case "P4": return <Badge variant="outline" className="bg-slate-800 text-white hover:bg-slate-900">P4 (Hitam)</Badge>
      default: return <Badge variant="outline">Belum Triage</Badge>
    }
  }

  const handleSelectPatient = (enc: EmergencyEncounter) => {
    setSelectedAdm(enc)
    setView("detail")
  }

  return (
    <DashboardLayout title="Instalasi Gawat Darurat" role="nurse" sidebarItems={SIDEBAR(view, setView)}>
      {/* ── DASHBOARD ── */}
      {view === "dashboard" && (
        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <PageHeader
              title="Dashboard IGD"
              description="Kelola pasien Gawat Darurat (Triage & Tindakan)"
              onRefresh={refreshEnc}
              isRefreshing={encLoading}
            />
            <Button onClick={() => setShowIntake(true)} className="bg-orange-600 hover:bg-orange-700">
              <UserPlus className="w-4 h-4 mr-2" /> Pasien Baru IGD
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Total Pasien Aktif" value={stats.total} icon={Activity} colorClass="text-blue-600" />
            <StatCard label="Pasien Kritis (P1)" value={stats.critical} icon={AlertTriangle} colorClass="text-red-500" />
            <StatCard label="Menunggu Triage" value={stats.waitingTriage} icon={Clock} colorClass="text-orange-500" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daftar Pasien Aktif</CardTitle>
              <CardDescription>Menunggu dan sedang dalam penanganan di IGD</CardDescription>
            </CardHeader>
            <CardContent>
              {encLoading ? (
                <p className="text-sm text-center py-4 text-muted-foreground">Memuat pasien...</p>
              ) : activeEncounters.length === 0 ? (
                <p className="text-sm text-center py-4 text-muted-foreground">Tidak ada pasien IGD aktif saat ini.</p>
              ) : (
                <div className="grid gap-3">
                  {activeEncounters.map((enc) => (
                    <button
                      key={enc.id}
                      className="border rounded-lg p-3 flex flex-col md:flex-row md:items-center justify-between text-left hover:border-orange-300 hover:bg-orange-50 transition-colors"
                      onClick={() => handleSelectPatient(enc)}
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{enc.patients.full_name}</h4>
                          {enc.is_critical && <Badge variant="destructive" className="h-5 text-[10px]">KRITIS</Badge>}
                        </div>
                        <p className="text-xs text-foreground/60 mb-2">MR: {enc.patients.medical_record_no} · Masuk: {new Date(enc.created_at).toLocaleTimeString("id-ID")}</p>
                        {enc.triage_complaint && (
                          <p className="text-sm text-foreground/80 line-clamp-1">Keluhan: {enc.triage_complaint}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 mt-2 md:mt-0 min-w-[120px]">
                        {getTriageBadge(enc.triage_category as string)}
                        {/* A bit of custom mapping for emergency status */}
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {enc.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── PATIENT DETAIL ── */}
      {view === "detail" && selectedAdm && (
        <div className="space-y-6 max-w-5xl mx-auto">
          <div className="flex items-center gap-3 bg-white dark:bg-slate-950 p-4 rounded-xl border shadow-sm">
            <Button variant="ghost" size="icon" onClick={() => { setSelectedAdm(null); setView("dashboard") }}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{selectedAdm.patients.full_name}</h2>
                {getTriageBadge(selectedAdm.triage_category as string)}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground/60 mt-1">
                <span>MR: {selectedAdm.patients.medical_record_no}</span>
                <span>Tiba: {new Date(selectedAdm.created_at).toLocaleString("id-ID")}</span>
                <span>Triage oleh: {selectedAdm.triage_nurse?.full_name || "Belum ada"}</span>
              </div>
            </div>
            <Badge variant={selectedAdm.status === "emergency_admitted" ? "destructive" : "secondary"} className="text-sm">
              {selectedAdm.status.replace(/_/g, ' ').toUpperCase()}
            </Badge>
          </div>

          <Tabs defaultValue="triage" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="triage"><Stethoscope className="w-4 h-4 mr-1" /> Triage</TabsTrigger>
              <TabsTrigger value="lab"><FlaskConical className="w-4 h-4 mr-1" /> Lab</TabsTrigger>
              {/* <TabsTrigger value="cppt" disabled><Activity className="w-4 h-4 mr-1" /> CPPT</TabsTrigger> */}
              <TabsTrigger value="disposition"><ArrowLeft className="w-4 h-4 mr-1 rotate-[135deg]" /> Disposisi</TabsTrigger>
            </TabsList>

            <TabsContent value="triage" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <EmergencyTriageForm 
                    encounter={selectedAdm}
                    onSuccess={() => { refreshEnc(); setView("dashboard"); }}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="lab" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <LabOrderForm
                    encounterId={selectedAdm.encounter_id}
                    patientId={selectedAdm.patient_id}
                    onSubmit={async (input) => { const ok = await createLab(input); return ok }}
                    onCancel={() => {}}
                    loading={labActing}
                    error={labError}
                  />
                  {labOrders.length > 0 && (
                    <div className="mt-6 space-y-2">
                      <h4 className="font-semibold text-sm">Riwayat Permintaan Lab</h4>
                      {labOrders.map((lo) => (
                        <div key={lo.id} className="flex justify-between items-center p-3 rounded-lg border text-sm">
                          <div>
                            <p className="font-medium">{lo.lab_order_items.map((i) => i.test_name).join(", ")}</p>
                            <p className="text-xs text-foreground/50">{lo.priority} · {new Date(lo.order_date).toLocaleString('id-ID')}</p>
                          </div>
                          <StatusBadge status={lo.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="disposition" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <EmergencyDispositionForm 
                     encounter={selectedAdm}
                     onSuccess={() => { refreshEnc(); setView("dashboard"); }}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

        </div>
      )}

      {/* Intake Dialog */}
      <Dialog open={showIntake} onOpenChange={setShowIntake}>
        <DialogContent className="max-w-lg">
          <DialogTitle className="sr-only">Registrasi Pasien IGD</DialogTitle>
          <EmergencyIntakeForm 
            onSuccess={() => { setShowIntake(false); refreshEnc(); }}
            onCancel={() => setShowIntake(false)}
          />
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
