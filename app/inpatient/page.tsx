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
  FlaskConical, Stethoscope, Clock, Loader2, ChevronDown, ChevronRight, LogOut,
} from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

import { useAdmissions } from "@/hooks/inpatient/use-admissions"
import { useDailyRecords } from "@/hooks/inpatient/use-daily-records"
import { useAllergies } from "@/hooks/inpatient/use-allergies"
import { useNutritionOrders } from "@/hooks/inpatient/use-nutrition-orders"
import { postClinicalNote, getVitalSigns, getClinicalNotesByEpisode, getLabOrders, getSurgeryRequests, getAdmissionRequests, postInpatientAssignment, getLocations, getEncounters } from "@/lib/api/client"
import { useVitalSigns } from "@/hooks/outpatient/use-vital-signs"

import { InpatientPatientList } from "@/components/inpatient/patient-list"
import { CpptForm } from "@/components/inpatient/cppt-form"
import { VitalSignsForm } from "@/components/nurse/vital-signs-form"
import { AllergyForm } from "@/components/nutritionist/allergy-form"
import { StatCard } from "@/components/shared/stat-card"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"

import type { InpatientAdmission, ClinicalNote, VitalSigns as VitalSignsType, LabOrder, SurgeryRequest, EpisodeOfCare, Location, InpatientRoomClass } from "@/lib/types/outpatient"

const SIDEBAR = (active: string, set: (v: string) => void) => [
  { icon: LayoutDashboard, label: "Dashboard", active: active === "dashboard", onClick: () => set("dashboard") },
  { icon: BedDouble, label: "Pasien Rawat Inap", active: active === "patients", onClick: () => set("patients") },
  { icon: ClipboardList, label: "CPPT Harian", active: active === "cppt", onClick: () => set("cppt") },
  { icon: LogOut, label: "Pulang Hari Ini", active: active === "discharged", onClick: () => set("discharged") },
]

export default function InpatientNurseDashboard() {
  const [view, setView] = useState("dashboard")
  const [cpptAdm, setCpptAdm] = useState<InpatientAdmission | null>(null)
  const [vitalsAdm, setVitalsAdm] = useState<InpatientAdmission | null>(null)
  const [allergyAdm, setAllergyAdm] = useState<InpatientAdmission | null>(null)
  const [previousNotes, setPreviousNotes] = useState<ClinicalNote[]>([])
  const [patientVitals, setPatientVitals] = useState<VitalSignsType[]>([])
  const [labOrders, setLabOrders] = useState<LabOrder[]>([])
  const [labOrdersLoading, setLabOrdersLoading] = useState(false)
  const [surgeries, setSurgeries] = useState<SurgeryRequest[]>([])
  const [surgeriesLoading, setSurgeriesLoading] = useState(false)
  const [labOpen, setLabOpen] = useState(false)
  const [cpptPoliServiceId, setCpptPoliServiceId] = useState<string | undefined>(undefined)
  const [cpptSubmitting, setCpptSubmitting] = useState(false)

  // Pending admissions (episodes_of_care without room — waiting for nurse room assignment)
  const [pendingAdmissions, setPendingAdmissions] = useState<EpisodeOfCare[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [rooms, setRooms] = useState<Location[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [assignForm, setAssignForm] = useState({ room_location_id: '', bed_number: '', room_class: 'kelas_3' as InpatientRoomClass })
  const [assignSubmitting, setAssignSubmitting] = useState(false)

  const { data: admissions, loading: admLoading, refresh: refreshAdm, stats } = useAdmissions()
  const { data: dischargedToday, loading: dischargedLoading, refresh: refreshDischarged } = useAdmissions({ status: 'discharged' })

  // Daily records for the selected CPPT patient
  const {
    todayRecords, createDailyRecord, refresh: refreshDr,
  } = useDailyRecords({
    admissionId: cpptAdm?.id ?? null,
    episodeOfCareId: cpptAdm?.episode_of_care_id ?? undefined,
    patientId: cpptAdm?.patient_id ?? undefined,
    poliServiceId: cpptPoliServiceId,
  })

  // Vital signs and lab for current encounter
  const { submit: submitVitals, loading: vsLoading, error: vsError, clearError: clearVsError } = useVitalSigns()
  const currentEncounterId = todayRecords[0]?.encounter_id ?? null

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

  const loadLabOrders = useCallback(async (episodeOfCareId: string) => {
    setLabOrdersLoading(true)
    try {
      const orders = await getLabOrders({ episode_of_care_id: episodeOfCareId })
      setLabOrders(orders)
    } catch {
      setLabOrders([])
    } finally {
      setLabOrdersLoading(false)
    }
  }, [])

  const loadSurgeries = useCallback(async (episodeOfCareId: string) => {
    setSurgeriesLoading(true)
    try {
      const data = await getSurgeryRequests({ episode_of_care_id: episodeOfCareId })
      setSurgeries(data)
    } catch {
      setSurgeries([])
    } finally {
      setSurgeriesLoading(false)
    }
  }, [])

  // Load pending admissions (episodes without room)
  const loadPendingAdmissions = useCallback(async () => {
    setPendingLoading(true)
    try {
      const data = await getAdmissionRequests()
      setPendingAdmissions(data)
    } catch {
      setPendingAdmissions([])
    } finally {
      setPendingLoading(false)
    }
  }, [])

  useEffect(() => { loadPendingAdmissions() }, [loadPendingAdmissions])

  const handleOpenAssign = useCallback(async (episodeId: string) => {
    setAssigningId(episodeId)
    setAssignForm({ room_location_id: '', bed_number: '', room_class: 'kelas_3' })
    if (rooms.length === 0) {
      setRoomsLoading(true)
      getLocations({ type: 'patient_room' }).then(setRooms).catch(() => { }).finally(() => setRoomsLoading(false))
    }
  }, [rooms.length])

  const handleAssignRoom = useCallback(async (episodeId: string) => {
    const { room_location_id, bed_number, room_class } = assignForm
    if (!room_location_id || !bed_number || !room_class) return
    setAssignSubmitting(true)
    try {
      await postInpatientAssignment({ episode_of_care_id: episodeId, room_location_id, bed_number, room_class })
      setAssigningId(null)
      loadPendingAdmissions()
      refreshAdm()
    } catch {
      // error handled by toast from hook or inline
    } finally {
      setAssignSubmitting(false)
    }
  }, [assignForm, loadPendingAdmissions, refreshAdm])

  // Handle opening CPPT for a patient
  const handleOpenCppt = useCallback(async (adm: InpatientAdmission) => {
    setCpptAdm(adm)
    setView("cppt")
    setPatientVitals([]) // reset; will be loaded once encounter is known
    setLabOrders([])
    setSurgeries([])
    setCpptPoliServiceId(undefined)
    // Resolve poli_service_id from the episode's outpatient encounter
    getEncounters({ episode_of_care_id: adm.episode_of_care_id })
      .then((encs) => {
        const outpatient = encs.find((e: any) => e.encounter_class === 'outpatient')
        const first = outpatient ?? encs[0]
        setCpptPoliServiceId(first?.poli_service_id)
      })
      .catch(() => { })
    // Load previous notes from all encounters in this episode
    try {
      const notes = await getClinicalNotesByEpisode(adm.episode_of_care_id)
      setPreviousNotes(notes)
    } catch {
      setPreviousNotes([])
    }
    loadLabOrders(adm.episode_of_care_id)
    loadSurgeries(adm.episode_of_care_id)
  }, [loadLabOrders, loadSurgeries])

  // CPPT note submission
  const handleCpptSubmit = useCallback(async (input: any): Promise<boolean> => {
    setCpptSubmitting(true)
    try {
      await postClinicalNote(input)
      if (cpptAdm) {
        const notes = await getClinicalNotesByEpisode(cpptAdm.episode_of_care_id)
        setPreviousNotes(notes)
      }
      return true
    } catch {
      return false
    } finally {
      setCpptSubmitting(false)
    }
  }, [cpptAdm])

  const handleVitalSubmit = useCallback(async (input: any) => {
    const ok = await submitVitals(input)
    if (ok) { setVitalsAdm(null); refreshDr() }
    return ok
  }, [submitVitals, refreshDr])

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

          {/* Pending admissions — waiting for room assignment */}
          {(pendingLoading || pendingAdmissions.length > 0) && (
            <Card className="border-orange-200 dark:border-orange-800">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="w-4 h-4 text-orange-500" />
                  Pasien Menunggu Kamar
                  {pendingAdmissions.length > 0 && (
                    <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                      {pendingAdmissions.length}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>Pasien sudah disetujui rawat inap, belum mendapat kamar</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingLoading ? (
                  <p className="text-sm text-center py-4 text-muted-foreground">Memuat...</p>
                ) : (
                  <div className="space-y-3">
                    {pendingAdmissions.map((ep) => (
                      <div key={ep.id} className="border rounded-lg p-3 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="font-semibold">{(ep as any).patients?.full_name}</p>
                              <Badge
                                variant="outline"
                                className={
                                  (ep as any).source === 'surgery'
                                    ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 text-[10px] h-5'
                                    : (ep as any).source === 'igd'
                                      ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 text-[10px] h-5'
                                      : 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 text-[10px] h-5'
                                }
                              >
                                {(ep as any).source === 'surgery' ? 'Operasi' : (ep as any).source === 'igd' ? 'IGD' : 'Poli'}
                              </Badge>
                            </div>
                            <p className="text-xs text-foreground/60">
                              MR: {(ep as any).patients?.medical_record_no}
                              {(ep as any).dpjp?.full_name && ` · DPJP: ${(ep as any).dpjp.full_name}`}
                            </p>
                            <p className="text-xs text-foreground/50 mt-0.5">
                              Terdaftar: {new Date((ep as any).created_at ?? '').toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            className="bg-orange-600 hover:bg-orange-700 shrink-0"
                            onClick={() => handleOpenAssign(ep.id)}
                          >
                            <BedDouble className="w-3 h-3 mr-1" /> Assign Kamar
                          </Button>
                        </div>

                        {assigningId === ep.id && (
                          <div className="border-t pt-3 space-y-3 bg-muted/20 rounded-b-lg -mx-3 -mb-3 px-3 pb-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Pilih Kamar *</Label>
                              {roomsLoading ? (
                                <p className="text-xs text-foreground/50 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Memuat kamar...</p>
                              ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                                  {rooms.map((room) => {
                                    const available = room.capacity - (room.occupied ?? 0)
                                    const isFull = available <= 0
                                    return (
                                      <button
                                        key={room.id}
                                        type="button"
                                        disabled={isFull}
                                        className={`p-2 rounded border text-left text-xs transition-all ${assignForm.room_location_id === room.id
                                          ? 'border-orange-500 bg-orange-100 dark:bg-orange-900/30 ring-1 ring-orange-500'
                                          : isFull
                                            ? 'border-border/40 opacity-50 cursor-not-allowed'
                                            : 'border-border hover:border-orange-300 hover:bg-orange-50/50'
                                          }`}
                                        onClick={() => setAssignForm(f => ({ ...f, room_location_id: room.id }))}
                                      >
                                        <p className="font-medium">{room.name}</p>
                                        <p className="text-foreground/50">{room.floor ? `Lt ${room.floor} · ` : ''}Tersedia: {available}/{room.capacity}</p>
                                      </button>
                                    )
                                  })}
                                  {rooms.length === 0 && <p className="text-xs text-foreground/50 col-span-2 py-2">Tidak ada kamar.</p>}
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Nomor Bed *</Label>
                                <Input
                                  className="h-8 text-sm"
                                  value={assignForm.bed_number}
                                  onChange={(e) => setAssignForm(f => ({ ...f, bed_number: e.target.value }))}
                                  placeholder="mis. A1, B2"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Kelas Kamar *</Label>
                                <Select value={assignForm.room_class} onValueChange={(v) => setAssignForm(f => ({ ...f, room_class: v as InpatientRoomClass }))}>
                                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="vip">VIP</SelectItem>
                                    <SelectItem value="kelas_1">Kelas 1</SelectItem>
                                    <SelectItem value="kelas_2">Kelas 2</SelectItem>
                                    <SelectItem value="kelas_3">Kelas 3</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="outline" onClick={() => setAssigningId(null)}>Batal</Button>
                              <Button
                                size="sm"
                                className="bg-orange-600 hover:bg-orange-700"
                                disabled={assignSubmitting || !assignForm.room_location_id || !assignForm.bed_number}
                                onClick={() => handleAssignRoom(ep.id)}
                              >
                                {assignSubmitting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Menyimpan...</> : 'Simpan'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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

          {/* ── Pemeriksaan Lab (collapsible) ── */}
          <div className="rounded-lg border overflow-hidden">
            <button
              type="button"
              onClick={() => setLabOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2 text-foreground/70">
                <FlaskConical className="w-4 h-4 text-blue-500" />
                <span>Pemeriksaan Lab</span>
                {labOrders.length > 0 && (
                  <span className="text-[11px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-semibold">
                    {labOrders.length} permintaan
                  </span>
                )}
              </div>
              {labOpen
                ? <ChevronDown className="w-4 h-4 text-foreground/40" />
                : <ChevronRight className="w-4 h-4 text-foreground/40" />
              }
            </button>

            {labOpen && (
              <div className="border-t px-4 py-3">
                {labOrdersLoading ? (
                  <p className="text-xs text-foreground/40">Memuat data lab...</p>
                ) : labOrders.length === 0 ? (
                  <p className="text-xs text-foreground/40">Belum ada permintaan lab.</p>
                ) : (
                  <div className="space-y-3">
                    {labOrders.map((lo) => (
                      <div key={lo.id} className="border rounded-md p-3 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 text-xs text-foreground/60">
                            <span>{new Date(lo.order_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            <span className="capitalize font-medium text-foreground/80">{lo.priority}</span>
                          </div>
                          <StatusBadge status={lo.status} />
                        </div>
                        <div className="space-y-1">
                          {(lo.lab_order_items ?? []).map((item: any) => {
                            let parsed: Array<{ label: string; value: string; unit?: string; reference_range?: string; result_status?: string }> | null = null
                            if (item.result_value) {
                              try {
                                const p = JSON.parse(item.result_value)
                                if (Array.isArray(p) && p.length > 0 && "label" in p[0]) parsed = p
                              } catch { /* plain string */ }
                            }
                            return (
                              <div key={item.id} className="text-xs py-1 border-t border-border/40">
                                <span className="font-medium">{item.test_name}</span>
                                {parsed ? (
                                  <table className="w-full mt-1">
                                    <thead>
                                      <tr className="text-foreground/40">
                                        <th className="text-left font-normal pb-0.5">Parameter</th>
                                        <th className="text-left font-normal pb-0.5">Nilai</th>
                                        <th className="text-left font-normal pb-0.5">Rujukan</th>
                                        <th className="text-right font-normal pb-0.5">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {parsed.map((p, i) => (
                                        <tr key={i} className="border-t border-border/20">
                                          <td className="py-0.5">{p.label || "—"}</td>
                                          <td className={`py-0.5 font-semibold ${p.result_status === 'critical' ? 'text-red-600' : p.result_status?.startsWith('abnormal') ? 'text-orange-600' : 'text-green-700'}`}>
                                            {p.value || "—"} {p.unit}
                                          </td>
                                          <td className="py-0.5 text-foreground/40">{p.reference_range || "—"}</td>
                                          <td className="py-0.5 text-right">
                                            <span className={`font-medium ${p.result_status === 'critical' ? 'text-red-600' : p.result_status?.startsWith('abnormal') ? 'text-orange-600' : 'text-green-700'}`}>
                                              {p.result_status === "normal" ? "N" : p.result_status === "abnormal_low" ? "↓" : p.result_status === "abnormal_high" ? "↑" : p.result_status === "critical" ? "!" : "—"}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : item.result_value ? (
                                  <div className="flex items-center justify-between mt-0.5">
                                    <span className={`font-semibold ${item.result_status === 'critical' ? 'text-red-600' : item.result_status === 'abnormal_high' || item.result_status === 'abnormal_low' ? 'text-orange-600' : 'text-green-700'}`}>
                                      {item.result_value} {item.result_unit}
                                    </span>
                                    {item.reference_range && <span className="text-foreground/40">Ref: {item.reference_range}</span>}
                                  </div>
                                ) : (
                                  <span className="text-foreground/40 italic ml-1">Belum ada hasil</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Riwayat Operasi ── */}
          {(surgeriesLoading || surgeries.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-purple-500" />
                  <CardTitle className="text-base">Riwayat Operasi</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {surgeriesLoading ? (
                  <p className="text-xs text-foreground/40">Memuat data operasi...</p>
                ) : (
                  <div className="space-y-3">
                    {surgeries.map((sr) => {
                      const start = sr.surgery_start_at ? new Date(sr.surgery_start_at) : null
                      const end = sr.surgery_end_at ? new Date(sr.surgery_end_at) : null
                      const durationMin = start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : null
                      return (
                        <div key={sr.id} className="border rounded-md p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{sr.surgery_type}</span>
                            <StatusBadge status={sr.status} />
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-foreground/60">
                            {(sr as any).surgeon?.full_name && (
                              <span>Dokter Bedah: <span className="text-foreground/80 font-medium">{(sr as any).surgeon.full_name}</span></span>
                            )}
                            {sr.anesthesia_type && (
                              <span>Anestesi: <span className="text-foreground/80">{sr.anesthesia_type}</span></span>
                            )}
                            {start && (
                              <span>Tgl Operasi: <span className="text-foreground/80">{start.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
                            )}
                            {durationMin !== null && (
                              <span>Durasi: <span className="text-foreground/80">{durationMin} menit</span></span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* CPPT Form — blocked while patient is in surgery */}
          {surgeries.some(s => s.status === 'intra_operative') ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 text-center">
              <Stethoscope className="w-8 h-8 text-amber-500 animate-pulse" />
              <p className="font-semibold text-amber-700 dark:text-amber-300">Pasien Sedang Dalam Tindakan Operasi</p>
              <p className="text-sm text-amber-600/80 dark:text-amber-400/70 max-w-sm">
                CPPT tidak dapat diinput selama operasi berlangsung. Input akan tersedia kembali setelah pasien dikembalikan ke bangsal.
              </p>
            </div>
          ) : (
            <CpptForm
              encounterId={currentEncounterId}
              patientId={cpptAdm.patient_id}
              onSubmit={handleCpptSubmit}
              onCreateShift={createDailyRecord}
              loading={cpptSubmitting}
              error={null}
              previousNotes={previousNotes}
              todayShiftExists={todayRecords.length > 0}
              vitalSigns={patientVitals}
            />
          )}
        </div>
      )}

      {/* ── PULANG HARI INI ── */}
      {view === "discharged" && (
        <div className="space-y-6">
          <PageHeader
            title="Pulang Hari Ini"
            description="Pasien yang sudah selesai pembayaran dan boleh dipulangkan"
            onRefresh={refreshDischarged}
            isRefreshing={dischargedLoading}
          />
          {dischargedToday.length === 0 && !dischargedLoading && (
            <div className="text-center py-12 text-foreground/50 text-sm">Belum ada pasien yang pulang hari ini.</div>
          )}
          <div className="space-y-3">
            {dischargedToday
              .filter((adm) => {
                // Show only those discharged today
                if (!adm.discharge_date) return true
                const d = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
                return adm.discharge_date.startsWith(d)
              })
              .map((adm) => (
                <div key={adm.id} className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                  <div>
                    <p className="font-semibold">{adm.patients.full_name}</p>
                    <p className="text-sm text-foreground/60">
                      MR: {adm.patients.medical_record_no}
                      {adm.locations?.name && ` · ${adm.locations.name}`}
                      {adm.bed_number && ` · Bed ${adm.bed_number}`}
                    </p>
                    {adm.discharge_date && (
                      <p className="text-xs text-foreground/50 mt-0.5">
                        Pulang: {new Date(adm.discharge_date).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700 font-medium flex items-center gap-1">
                    <Heart className="w-3 h-3" /> Sudah Pulang
                  </span>
                </div>
              ))}
          </div>
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
