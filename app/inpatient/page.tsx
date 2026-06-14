/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

export const dynamic = 'force-dynamic'

import { useState, useCallback, useEffect } from "react"
import DashboardLayout from "@/components/system/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  LayoutDashboard, BedDouble, ClipboardList,
  Activity, ArrowLeft, ShieldAlert, Apple, UtensilsCrossed, AlertTriangle, FileText, Heart,
} from "lucide-react"

import { useAdmissions } from "@/hooks/inpatient/use-admissions"
import { useDailyRecords } from "@/hooks/inpatient/use-daily-records"
import { useAllergies } from "@/hooks/inpatient/use-allergies"
import { useNutritionOrders } from "@/hooks/inpatient/use-nutrition-orders"
import { postClinicalNote, getVitalSigns, getClinicalNotesByEpisode } from "@/lib/api/client"
import { useVitalSigns } from "@/hooks/outpatient/use-vital-signs"
import { useLabOrders } from "@/hooks/outpatient/use-lab-orders"

import { InpatientPatientList } from "@/components/inpatient/patient-list"
import { CpptForm } from "@/components/inpatient/cppt-form"
import { VitalSignsForm } from "@/components/nurse/vital-signs-form"
import { LabOrderForm } from "@/components/doctor/lab-order-form"
import { AllergyForm } from "@/components/nutritionist/allergy-form"
import { StatCard } from "@/components/shared/stat-card"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"

import type { InpatientAdmission, ClinicalNote, VitalSigns as VitalSignsType } from "@/lib/types/outpatient"

const SIDEBAR = (active: string, set: (v: string) => void) => [
  { icon: LayoutDashboard, label: "Dashboard", active: active === "dashboard", onClick: () => set("dashboard") },
  { icon: BedDouble, label: "Pasien Rawat Inap", active: active === "patients", onClick: () => set("patients") },
  { icon: ClipboardList, label: "CPPT Harian", active: active === "cppt", onClick: () => set("cppt") },
]

export default function InpatientNurseDashboard() {
  const [view, setView] = useState("dashboard")
  const [selectedAdm, setSelectedAdm] = useState<InpatientAdmission | null>(null)
  const [cpptAdm, setCpptAdm] = useState<InpatientAdmission | null>(null)
  const [vitalsAdm, setVitalsAdm] = useState<InpatientAdmission | null>(null)
  const [labAdm, setLabAdm] = useState<InpatientAdmission | null>(null)
  const [allergyAdm, setAllergyAdm] = useState<InpatientAdmission | null>(null)
  const [previousNotes, setPreviousNotes] = useState<ClinicalNote[]>([])
  const [patientVitals, setPatientVitals] = useState<VitalSignsType[]>([])

  const { data: admissions, loading: admLoading, refresh: refreshAdm, stats } = useAdmissions()

  // Daily records for the selected CPPT patient
  const {
    todayRecords, loading: drLoading, actionLoading: drAction,
    createDailyRecord, refresh: refreshDr,
  } = useDailyRecords({
    admissionId: cpptAdm?.id ?? null,
    episodeOfCareId: cpptAdm?.episode_of_care_id ?? undefined,
    patientId: cpptAdm?.patient_id ?? undefined,
    poliServiceId: "9bba8621-c9b7-4d62-8301-3d0dfa048a6b", // TODO: dynamic from admission context
  })

  // Vital signs and lab for current encounter
  const { submit: submitVitals, loading: vsLoading, error: vsError, clearError: clearVsError } = useVitalSigns()
  const currentEncounterId = todayRecords[0]?.encounter_id ?? null
  const { create: createLab, actionLoading: labActing, error: labError } = useLabOrders({ encounterId: currentEncounterId ?? undefined, pollIntervalMs: 0 })

  // Allergies for selected CPPT patient
  const {
    data: allergies, loading: alLoading, actionLoading: alActing, error: alError, create: createAllergy,
  } = useAllergies(cpptAdm?.patient_id ?? null)

  // Nutrition order for selected CPPT patient (read-only for nurse/doctor context)
  const { activeOrder: nutritionOrder } = useNutritionOrders(cpptAdm?.episode_of_care_id ?? null)

  // Load vitals using the correct encounter_id once the daily record is known
  useEffect(() => {
    if (!currentEncounterId) return
    getVitalSigns(currentEncounterId)
      .then((vs) => setPatientVitals(vs))
      .catch(() => setPatientVitals([]))
  }, [currentEncounterId])

  // Handle opening CPPT for a patient
  const handleOpenCppt = useCallback(async (adm: InpatientAdmission) => {
    setCpptAdm(adm)
    setView("cppt")
    setPatientVitals(null) // reset; will be loaded once encounter is known
    // Load previous notes from all encounters in this episode
    try {
      const notes = await getClinicalNotesByEpisode(adm.episode_of_care_id)
      setPreviousNotes(notes)
    } catch {
      setPreviousNotes([])
    }
  }, [])

  // CPPT note submission
  const handleCpptSubmit = useCallback(async (input: any): Promise<boolean> => {
    try {
      await postClinicalNote(input)
      // Refresh notes
      if (cpptAdm) {
        const notes = await getClinicalNotesByEpisode(cpptAdm.episode_of_care_id)
        setPreviousNotes(notes)
      }
      return true
    } catch {
      return false
    }
  }, [cpptAdm])

  const handleVitalSubmit = useCallback(async (input: any) => {
    const ok = await submitVitals(input)
    if (ok) { setVitalsAdm(null); refreshDr() }
    return ok
  }, [submitVitals, refreshDr])

  const handleLabSubmit = useCallback(async (input: any) => {
    const ok = await createLab(input)
    if (ok) setLabAdm(null)
    return ok
  }, [createLab])

  const handleAllergySubmit = useCallback(async (input: any) => {
    const ok = await createAllergy(input)
    if (ok) setAllergyAdm(null)
    return ok
  }, [createAllergy])

  return (
    <DashboardLayout title="Rawat Inap" role="nurse" sidebarItems={SIDEBAR(view, setView)}>
      {/* ── DASHBOARD ── */}
      {view === "dashboard" && (
        <div className="space-y-6">
          <PageHeader
            title="Dashboard Rawat Inap"
            description="Kelola pasien rawat inap dan catatan CPPT harian"
            onRefresh={refreshAdm}
            isRefreshing={admLoading}
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Pasien" value={stats.total} icon={BedDouble} colorClass="text-blue-600" />
            <StatCard label="Baru Masuk" value={stats.admitted} icon={Activity} colorClass="text-green-600" />
            <StatCard label="Dalam Perawatan" value={stats.inCare} icon={ClipboardList} colorClass="text-orange-600" />
            <StatCard label="Siap Pulang" value={stats.dischargeReady} icon={Heart} colorClass="text-pink-600" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Pasien Aktif</CardTitle>
              <CardDescription>Pasien yang sedang dirawat</CardDescription>
            </CardHeader>
            <CardContent>
              <InpatientPatientList
                admissions={admissions.slice(0, 6)}
                loading={admLoading}
                onSelect={(adm) => handleOpenCppt(adm)}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── PATIENT LIST ── */}
      {view === "patients" && (
        <div className="space-y-6">
          <PageHeader
            title="Pasien Rawat Inap"
            description="Semua pasien yang sedang dirawat"
            onRefresh={refreshAdm}
            isRefreshing={admLoading}
          />
          <InpatientPatientList
            admissions={admissions}
            loading={admLoading}
            onSelect={(adm) => handleOpenCppt(adm)}
          />
        </div>
      )}

      {/* ── CPPT VIEW ── */}
      {view === "cppt" && cpptAdm && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setCpptAdm(null); setView("patients") }}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h2 className="text-lg font-bold">{cpptAdm.patients.full_name}</h2>
              <p className="text-sm text-foreground/60">
                MR: {cpptAdm.patients.medical_record_no} · {cpptAdm.locations?.name} · Bed {cpptAdm.bed_number}
              </p>
            </div>
            <StatusBadge status={cpptAdm.status} className="ml-auto" />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { clearVsError(); setVitalsAdm(cpptAdm) }}
              disabled={!currentEncounterId}
            >
              <Activity className="w-4 h-4 mr-1" /> Input Tanda Vital
            </Button>
            {/* <Button
              size="sm"
              variant="outline"
              onClick={() => setLabAdm(cpptAdm)}
              disabled={!currentEncounterId}
            >
              <FlaskConical className="w-4 h-4 mr-1" /> Permintaan Lab
            </Button> */}
            <Button
              size="sm"
              variant="outline"
              className="border-red-400 text-red-600 hover:bg-red-50"
              onClick={() => setAllergyAdm(cpptAdm)}
            >
              <ShieldAlert className="w-4 h-4 mr-1" /> Tambah Alergi
            </Button>
          </div>

          {/* Allergy summary for this patient */}
          {allergies.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allergies.map((al) => (
                <span
                  key={al.id}
                  className={`text-xs px-2 py-1 rounded-full border font-medium ${al.criticality === "high"
                    ? "bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    : "bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                    }`}
                >
                  <AlertTriangle className="w-3 h-3 inline mr-0.5" />
                  {al.substance_display}
                  {al.category === "food" ? " (Makanan)" : al.category === "medication" ? " (Obat)" : " (Lingkungan)"}
                </span>
              ))}
            </div>
          )}
          {alLoading && <p className="text-xs text-foreground/40">Memuat data alergi...</p>}

          {/* Nutrition Plan Card — from nutritionist, read-only */}
          {nutritionOrder && (
            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Apple className="w-4 h-4 text-green-600" />
                  <span className="font-semibold text-sm">Rencana Nutrisi</span>
                  <span className="text-xs text-foreground/50">
                    oleh {nutritionOrder.practitioners?.full_name ?? "Ahli Gizi"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {nutritionOrder.nutritional_status && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-medium border border-green-200 dark:border-green-700">
                      {nutritionOrder.nutritional_status === "baik" ? "Status Gizi Baik" :
                        nutritionOrder.nutritional_status === "kurang" ? "Gizi Kurang" :
                          nutritionOrder.nutritional_status === "lebih" ? "Gizi Lebih" : "Gizi Buruk"}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {nutritionOrder.energy_needs_kcal && (
                  <div className="bg-background/70 rounded-md p-2 border">
                    <p className="text-foreground/50">Kebutuhan Energi</p>
                    <p className="font-semibold">{nutritionOrder.energy_needs_kcal} kkal</p>
                  </div>
                )}
                {nutritionOrder.protein_needs_g && (
                  <div className="bg-background/70 rounded-md p-2 border">
                    <p className="text-foreground/50">Kebutuhan Protein</p>
                    <p className="font-semibold">{nutritionOrder.protein_needs_g} g</p>
                  </div>
                )}
                {nutritionOrder.dietary_restrictions && (
                  <div className="bg-background/70 rounded-md p-2 border col-span-2 sm:col-span-1">
                    <p className="text-foreground/50">Pantangan / Restriksi</p>
                    <p className="font-semibold">{nutritionOrder.dietary_restrictions}</p>
                  </div>
                )}
              </div>
              {nutritionOrder.meal_plan && Object.keys(nutritionOrder.meal_plan).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground/60 flex items-center gap-1">
                    <UtensilsCrossed className="w-3 h-3" /> Rencana Makan
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {Object.entries(nutritionOrder.meal_plan).map(([waktu, menu]) => (
                      <div key={waktu} className="bg-background/70 rounded-md p-2 border text-xs">
                        <span className="font-semibold capitalize">{waktu}:</span>{" "}
                        <span className="text-foreground/70">{menu || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {nutritionOrder.notes && (
                <p className="text-xs text-foreground/60 italic border-t pt-2 flex items-start gap-1">
                  <FileText className="w-3 h-3 mt-0.5 shrink-0" />
                  {nutritionOrder.notes}
                </p>
              )}
            </div>
          )}

          <Separator />

          {/* CPPT Form */}
          <CpptForm
            encounterId={currentEncounterId}
            patientId={cpptAdm.patient_id}
            onSubmit={handleCpptSubmit}
            onCreateShift={createDailyRecord}
            loading={drAction}
            error={null}
            previousNotes={previousNotes}
            todayShiftExists={todayRecords.length > 0}
            vitalSigns={patientVitals}
          />
        </div>
      )}

      {/* ── Vital Signs Dialog ── */}
      <Dialog open={!!vitalsAdm} onOpenChange={(o) => { if (!o) setVitalsAdm(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogTitle>Input Tanda Vital</DialogTitle>
          {vitalsAdm && currentEncounterId && (
            <VitalSignsForm
              encounterId={currentEncounterId}
              patientId={vitalsAdm.patient_id}
              patientName={vitalsAdm.patients.full_name}
              onSubmit={handleVitalSubmit}
              onCancel={() => setVitalsAdm(null)}
              loading={vsLoading}
              error={vsError}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Lab Order Dialog ── */}
      {/* <Dialog open={!!labAdm} onOpenChange={(o) => { if (!o) setLabAdm(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Permintaan Pemeriksaan Lab</DialogTitle>
          {labAdm && currentEncounterId && (
            <LabOrderForm
              encounterId={currentEncounterId}
              patientId={labAdm.patient_id}
              onSubmit={handleLabSubmit}
              onCancel={() => setLabAdm(null)}
              loading={labActing}
              error={labError}
            />
          )}
        </DialogContent>
      </Dialog> */}

      {/* ── Allergy Dialog ── */}
      <Dialog open={!!allergyAdm} onOpenChange={(o) => { if (!o) setAllergyAdm(null) }}>
        <DialogContent className="max-w-lg">
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500" /> Tambah Data Alergi
          </DialogTitle>
          <p className="text-sm text-foreground/60 -mt-2">Pengkajian alergi oleh perawat rawat inap</p>
          {allergyAdm && (
            <AllergyForm
              patientId={allergyAdm.patient_id}
              onSubmit={handleAllergySubmit}
              loading={alActing}
              error={alError}
            />
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
