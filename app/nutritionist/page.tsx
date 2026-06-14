/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

export const dynamic = 'force-dynamic'

import React, { useState, useCallback } from "react"
import DashboardLayout from "@/components/system/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  LayoutDashboard, BedDouble, UtensilsCrossed, AlertTriangle,
  ArrowLeft, ShieldAlert, Apple, Clock, User, Loader2,
} from "lucide-react"

import { useAdmissions } from "@/hooks/inpatient/use-admissions"
import { useAllergies } from "@/hooks/inpatient/use-allergies"
import { useNutritionOrders } from "@/hooks/inpatient/use-nutrition-orders"
import { getEncounters, postClinicalNote, getClinicalNotesByEpisode } from "@/lib/api/client"

import { InpatientPatientList } from "@/components/inpatient/patient-list"
import { NutritionOrderForm } from "@/components/nutritionist/nutrition-order-form"
import { StatCard } from "@/components/shared/stat-card"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"

import type { InpatientAdmission, ClinicalNote } from "@/lib/types/outpatient"

const SIDEBAR = (active: string, set: (v: string) => void) => [
  { icon: LayoutDashboard, label: "Dashboard", active: active === "dashboard", onClick: () => set("dashboard") },
  { icon: BedDouble,       label: "Pasien",    active: active === "patients",  onClick: () => set("patients") },
]

const SOAP_FIELDS = [
  {
    key: "subjective",
    label: "S — Subjektif",
    placeholder: "Keluhan pasien terkait nafsu makan, preferensi makanan, mual/muntah, dll...",
  },
  {
    key: "objective",
    label: "O — Objektif",
    placeholder: "Data antropometri (BB, TB, IMT), recall asupan, pemeriksaan fisik terkait gizi...",
  },
  {
    key: "assessment",
    label: "A — Diagnosis Gizi (NCP)",
    placeholder: "Diagnosis gizi berdasarkan NCP, misal: 'Asupan oral tidak adekuat b.d anoreksia d/d asupan < 60%'...",
  },
  {
    key: "plan",
    label: "P — Intervensi & Rencana",
    placeholder: "Intervensi gizi: pemberian diet, edukasi, monitoring, koordinasi tim...",
  },
] as const

export default function NutritionistDashboard() {
  const [view, setView] = useState("dashboard")
  const [selectedAdm, setSelectedAdm] = useState<InpatientAdmission | null>(null)
  const [currentEncounterId, setCurrentEncounterId] = useState<string | null>(null)
  const [soap, setSoap] = useState({ subjective: "", objective: "", assessment: "", plan: "" })
  const [soapLoading, setSoapLoading] = useState(false)
  const [soapError, setSoapError] = useState<string | null>(null)
  const [notes, setNotes] = useState<ClinicalNote[]>([])

  const { data: admissions, loading: admLoading, refresh: refreshAdm, stats } = useAdmissions()
  const { data: allergies, loading: alLoading } = useAllergies(selectedAdm?.patient_id ?? null)
  const {
    activeOrder, loading: noLoading, actionLoading: noActing, error: noError,
    create: createNutrition, update: updateNutrition,
  } = useNutritionOrders(selectedAdm?.episode_of_care_id ?? null)

  const handleSelectPatient = useCallback(async (adm: InpatientAdmission) => {
    setSelectedAdm(adm)
    setView("detail")
    setCurrentEncounterId(null)
    setNotes([])
    // Get latest active encounter for this episode
    try {
      const encounters = await getEncounters({ episode_of_care_id: adm.episode_of_care_id } as any)
      const latest = encounters.sort((a, b) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      )[0]
      setCurrentEncounterId(latest?.id ?? null)
    } catch { setCurrentEncounterId(null) }
    // Load CPPT history
    try {
      const n = await getClinicalNotesByEpisode(adm.episode_of_care_id)
      setNotes(n)
    } catch { setNotes([]) }
  }, [])

  const handleNutritionSubmit = useCallback(async (input: any) => {
    if (activeOrder) return updateNutrition(activeOrder.id, input)
    return createNutrition(input)
  }, [activeOrder, createNutrition, updateNutrition])

  const handleSoapSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentEncounterId || !selectedAdm) return
    setSoapLoading(true)
    setSoapError(null)
    try {
      await postClinicalNote({
        encounter_id: currentEncounterId,
        patient_id: selectedAdm.patient_id,
        ...soap,
      })
      setSoap({ subjective: "", objective: "", assessment: "", plan: "" })
      const n = await getClinicalNotesByEpisode(selectedAdm.episode_of_care_id)
      setNotes(n)
    } catch (err: any) {
      setSoapError(err.message ?? "Gagal menyimpan catatan gizi")
    } finally {
      setSoapLoading(false)
    }
  }

  const daysSince = (dateStr: string) =>
    Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))

  const roleLabel = (role: string | undefined) =>
    role === "doctor" ? "Dokter" : role === "nurse" ? "Perawat" :
    role === "nutritionist" ? "Ahli Gizi" : role === "pharmacist" ? "Apoteker" : role ?? "—"

  const roleColor = (role: string | undefined) =>
    role === "doctor"       ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
    role === "nurse"        ? "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" :
    role === "nutritionist" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
    "bg-muted text-foreground/60"

  return (
    <DashboardLayout title="Nutrisi & Gizi" role="nutritionist" sidebarItems={SIDEBAR(view, setView)}>

      {/* ── DASHBOARD ── */}
      {view === "dashboard" && (
        <div className="space-y-6">
          <PageHeader
            title="Dashboard Ahli Gizi"
            description="Kelola nutrisi dan catatan gizi pasien rawat inap"
            onRefresh={refreshAdm}
            isRefreshing={admLoading}
          />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Total Pasien"    value={stats.total}          icon={BedDouble}       colorClass="text-blue-600" />
            <StatCard label="Dalam Perawatan" value={stats.inCare}         icon={UtensilsCrossed} colorClass="text-green-600" />
            <StatCard label="Siap Pulang"     value={stats.dischargeReady} icon={AlertTriangle}   colorClass="text-orange-600" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Pasien Aktif</CardTitle>
              <CardDescription>Klik untuk lihat dan isi catatan gizi</CardDescription>
            </CardHeader>
            <CardContent>
              <InpatientPatientList admissions={admissions.slice(0, 6)} loading={admLoading} onSelect={handleSelectPatient} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── PATIENT LIST ── */}
      {view === "patients" && (
        <div className="space-y-6">
          <PageHeader title="Pasien Rawat Inap" description="Pilih pasien untuk kelola nutrisi" onRefresh={refreshAdm} isRefreshing={admLoading} />
          <InpatientPatientList admissions={admissions} loading={admLoading} onSelect={handleSelectPatient} />
        </div>
      )}

      {/* ── PATIENT DETAIL ── */}
      {view === "detail" && selectedAdm && (
        <div className="space-y-6 max-w-4xl">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setSelectedAdm(null); setView("patients") }}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{selectedAdm.patients.full_name}</h2>
              <p className="text-sm text-foreground/60">
                MR: {selectedAdm.patients.medical_record_no} · {selectedAdm.locations?.name} · Bed {selectedAdm.bed_number}
                · Hari ke-{daysSince(selectedAdm.admission_date) + 1}
              </p>
              {selectedAdm.episodes_of_care?.diagnosis_primary && (
                <p className="text-xs text-foreground/40 mt-0.5">Dx: {selectedAdm.episodes_of_care.diagnosis_primary}</p>
              )}
            </div>
            <StatusBadge status={selectedAdm.status} />
          </div>

          {/* Allergies */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="w-4 h-4 text-red-500" /> Alergi Pasien
              </CardTitle>
              <CardDescription>Referensi penyusunan diet — dikaji oleh perawat</CardDescription>
            </CardHeader>
            <CardContent>
              {alLoading ? (
                <p className="text-sm text-foreground/50">Memuat...</p>
              ) : allergies.length === 0 ? (
                <p className="text-sm text-foreground/50 py-2 text-center">Tidak ada alergi tercatat.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allergies.map((al) => (
                    <span key={al.id} className={`text-xs px-2 py-1 rounded-full border font-medium ${al.criticality === "high" ? "bg-red-100 border-red-300 text-red-700" : "bg-orange-50 border-orange-300 text-orange-700"}`}>
                      {al.substance_display}
                      {al.category === "food" ? " (Makanan)" : al.category === "medication" ? " (Obat)" : " (Lingkungan)"}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rencana Menu Harian */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Apple className="w-4 h-4 text-green-500" /> Rencana Menu Harian
              </CardTitle>
              <CardDescription>
                {activeOrder
                  ? `Diperbarui ${new Date(activeOrder.order_date).toLocaleDateString("id-ID")}`
                  : "Belum ada rencana menu"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeOrder && (
                <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(activeOrder.meal_plan ?? {}).map(([meal, desc]) => (
                    <div key={meal} className="p-2 rounded bg-green-50/50 dark:bg-green-950/10 border">
                      <span className="font-medium capitalize">{meal}: </span>
                      <span className="text-foreground/70">{desc || "—"}</span>
                    </div>
                  ))}
                </div>
              )}
              {activeOrder?.notes && (
                <p className="text-sm text-foreground/60 mb-4 italic">{activeOrder.notes}</p>
              )}
              <Separator className="my-4" />
              <NutritionOrderForm
                episodeOfCareId={selectedAdm.episode_of_care_id}
                patientId={selectedAdm.patient_id}
                onSubmit={handleNutritionSubmit}
                loading={noActing}
                error={noError}
                initialData={activeOrder ? {
                  meal_plan: activeOrder.meal_plan ?? undefined,
                  notes: activeOrder.notes ?? undefined,
                } : undefined}
              />
            </CardContent>
          </Card>

          {/* SOAP Gizi */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UtensilsCrossed className="w-4 h-4 text-green-500" /> Catatan SOAP Gizi
              </CardTitle>
              <CardDescription>Muncul di riwayat CPPT dokter dan perawat</CardDescription>
            </CardHeader>
            <CardContent>
              {!currentEncounterId ? (
                <Alert>
                  <AlertDescription>Belum ada encounter aktif untuk pasien ini hari ini. Perawat perlu memulai shift terlebih dahulu.</AlertDescription>
                </Alert>
              ) : (
                <form onSubmit={handleSoapSubmit} className="space-y-4">
                  {soapError && <Alert variant="destructive"><AlertDescription>{soapError}</AlertDescription></Alert>}
                  {SOAP_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                        {field.label}
                      </Label>
                      <Textarea
                        rows={field.key === "plan" ? 3 : 2}
                        value={soap[field.key]}
                        onChange={(e) => setSoap((p) => ({ ...p, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                      />
                    </div>
                  ))}
                  <Button
                    type="submit"
                    disabled={soapLoading || (!soap.subjective && !soap.objective)}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {soapLoading
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</>
                      : "Simpan Catatan SOAP Gizi"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          {/* CPPT History */}
          {notes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Riwayat CPPT (Semua Profesi)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {notes.map((note) => (
                    <div key={note.id} className="p-3 rounded-lg border bg-muted/20 text-sm space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-foreground/40" />
                          <span className="font-medium">{note.practitioners?.full_name ?? "—"}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleColor(note.writer_role)}`}>
                            {roleLabel(note.writer_role)}
                          </span>
                        </div>
                        <span className="flex items-center gap-1 text-xs text-foreground/40">
                          <Clock className="w-3 h-3" />
                          {new Date(note.note_date).toLocaleString("id-ID", {
                            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {note.subjective  && <p><span className="font-semibold text-foreground/60 text-xs">S:</span> {note.subjective}</p>}
                      {note.objective   && <p><span className="font-semibold text-foreground/60 text-xs">O:</span> {note.objective}</p>}
                      {note.assessment  && <p><span className="font-semibold text-foreground/60 text-xs">A:</span> {note.assessment}</p>}
                      {note.plan        && <p><span className="font-semibold text-foreground/60 text-xs">P:</span> {note.plan}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}
