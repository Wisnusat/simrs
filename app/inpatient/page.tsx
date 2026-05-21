/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState, useCallback, useEffect } from "react"
import DashboardLayout from "@/components/system/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  LayoutDashboard, BedDouble, ClipboardList, FlaskConical,
  Activity, Heart, Thermometer, ArrowLeft, Loader2,
} from "lucide-react"

import { useAdmissions } from "@/hooks/inpatient/use-admissions"
import { useDailyRecords } from "@/hooks/inpatient/use-daily-records"
import { postClinicalNote, getVitalSigns, getClinicalNotesByEpisode } from "@/lib/api/client"
import { useVitalSigns } from "@/hooks/outpatient/use-vital-signs"
import { useLabOrders } from "@/hooks/outpatient/use-lab-orders"

import { InpatientPatientList } from "@/components/inpatient/patient-list"
import { CpptForm } from "@/components/inpatient/cppt-form"
import { VitalSignsForm } from "@/components/nurse/vital-signs-form"
import { LabOrderForm } from "@/components/doctor/lab-order-form"
import { StatCard } from "@/components/shared/stat-card"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"

import type { InpatientAdmission, ClinicalNote, VitalSigns as VitalSignsType } from "@/lib/types/outpatient"

const SIDEBAR = (active: string, set: (v: string) => void) => [
  { icon: LayoutDashboard, label: "Dashboard",         active: active === "dashboard",  onClick: () => set("dashboard") },
  { icon: BedDouble,       label: "Pasien Rawat Inap", active: active === "patients",   onClick: () => set("patients") },
  { icon: ClipboardList,   label: "CPPT Harian",       active: active === "cppt",       onClick: () => set("cppt") },
]

export default function InpatientNurseDashboard() {
  const [view, setView] = useState("dashboard")
  const [selectedAdm, setSelectedAdm] = useState<InpatientAdmission | null>(null)
  const [cpptAdm, setCpptAdm] = useState<InpatientAdmission | null>(null)
  const [vitalsAdm, setVitalsAdm] = useState<InpatientAdmission | null>(null)
  const [labAdm, setLabAdm] = useState<InpatientAdmission | null>(null)
  const [previousNotes, setPreviousNotes] = useState<ClinicalNote[]>([])
  const [patientVitals, setPatientVitals] = useState<VitalSignsType | null>(null)

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

  // Load vitals using the correct encounter_id once the daily record is known
  useEffect(() => {
    if (!currentEncounterId) return
    getVitalSigns(currentEncounterId)
      .then((vs) => setPatientVitals(vs[0] ?? null))
      .catch(() => setPatientVitals(null))
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
            <StatCard label="Total Pasien"     value={stats.total}          icon={BedDouble}     colorClass="text-blue-600" />
            <StatCard label="Baru Masuk"       value={stats.admitted}       icon={Activity}      colorClass="text-green-600" />
            <StatCard label="Dalam Perawatan"  value={stats.inCare}         icon={ClipboardList} colorClass="text-orange-600" />
            <StatCard label="Siap Pulang"      value={stats.dischargeReady} icon={Heart}         colorClass="text-pink-600" />
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

          {/* Vitals strip */}
          {patientVitals && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              {patientVitals.systolic_bp && (
                <div className="flex items-center gap-2 text-sm">
                  <Heart className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-foreground/60">TD:</span>
                  <span className="font-medium">{patientVitals.systolic_bp}/{patientVitals.diastolic_bp} mmHg</span>
                </div>
              )}
              {patientVitals.heart_rate && (
                <div className="flex items-center gap-2 text-sm">
                  <Activity className="w-4 h-4 text-pink-500 shrink-0" />
                  <span className="text-foreground/60">Nadi:</span>
                  <span className="font-medium">{patientVitals.heart_rate} bpm</span>
                </div>
              )}
              {patientVitals.temperature && (
                <div className="flex items-center gap-2 text-sm">
                  <Thermometer className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="text-foreground/60">Suhu:</span>
                  <span className="font-medium">{patientVitals.temperature}°C</span>
                </div>
              )}
              {patientVitals.oxygen_saturation && (
                <div className="flex items-center gap-2 text-sm">
                  <Activity className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="text-foreground/60">SpO₂:</span>
                  <span className="font-medium">{patientVitals.oxygen_saturation}%</span>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { clearVsError(); setVitalsAdm(cpptAdm) }}
              disabled={!currentEncounterId}
            >
              <Activity className="w-4 h-4 mr-1" /> Input Tanda Vital
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLabAdm(cpptAdm)}
              disabled={!currentEncounterId}
            >
              <FlaskConical className="w-4 h-4 mr-1" /> Permintaan Lab
            </Button>
          </div>

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
          />
        </div>
      )}

      {/* ── Vital Signs Dialog ── */}
      <Dialog open={!!vitalsAdm} onOpenChange={(o) => { if (!o) setVitalsAdm(null) }}>
        <DialogContent className="max-w-2xl">
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
      <Dialog open={!!labAdm} onOpenChange={(o) => { if (!o) setLabAdm(null) }}>
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
      </Dialog>
    </DashboardLayout>
  )
}
