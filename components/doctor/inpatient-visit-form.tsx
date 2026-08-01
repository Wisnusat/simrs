/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2, ArrowLeft, Activity, Heart, Thermometer,
  BedDouble, Calendar, FlaskConical, Pill, FileText,
  User, Clock,
} from "lucide-react"
import {
  postClinicalNote, postDiagnosis, postPrescription,
  getClinicalNotesByEpisode, getVitalSigns, getMedications,
  patchInpatientAdmission, patchEpisodeOfCare, patchEncounter,
  createEncounter, postInpatientDailyRecord, postSurgeryRequest,
  postMedicalResume, getMedicalResume, getEncounters,
} from "@/lib/api/client"
import { useLabOrders } from "@/hooks/outpatient/use-lab-orders"
import { useDailyRecords } from "@/hooks/inpatient/use-daily-records"
import { StatusBadge } from "@/components/shared/status-badge"
import { CpptForm } from "@/components/inpatient/cppt-form"
import { LabOrderForm } from "@/components/doctor/lab-order-form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { InpatientAdmission, ClinicalNote, VitalSigns, Medication, MedicalResume } from "@/lib/types/outpatient"

interface InpatientVisitFormProps {
  admission: InpatientAdmission
  onBack: () => void
  onDischarge: () => void
}

export function InpatientVisitForm({ admission, onBack, onDischarge }: InpatientVisitFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [poliServiceId, setPoliServiceId] = useState<string | undefined>(undefined)
  const [poliLoading, setPoliLoading] = useState(true)

  useEffect(() => {
    if (!admission.episode_of_care_id) { setPoliLoading(false); return }
    setPoliLoading(true)
    getEncounters({ episode_of_care_id: admission.episode_of_care_id })
      .then((encs: any[]) => {
        const outpatient = encs.find((e: any) => e.encounter_class === 'outpatient')
        const first = outpatient ?? encs[0]
        if (first?.poli_service_id) setPoliServiceId(first.poli_service_id)
      })
      .catch(() => {})
      .finally(() => setPoliLoading(false))
  }, [admission.episode_of_care_id])
  const [previousNotes, setPreviousNotes] = useState<ClinicalNote[]>([])
  const [latestVitals, setLatestVitals] = useState<VitalSigns | null>(null)
  const [discharging, setDischarging] = useState(false)
  const [dischargeSummary, setDischargeSummary] = useState("")
  const [resumeSaved, setResumeSaved] = useState(false)
  const [resume, setResume] = useState({
    chief_complaint: "",
    history_of_illness: "",
    physical_examination: "",
    summary: "",
    follow_up_plan: "",
  })

  // SOAP for visit note
  const [soap, setSoap] = useState({ subjective: "", objective: "", assessment: "", plan: "" })

  // Surgery state
  const [surgeryType, setSurgeryType] = useState("")
  const [surgeryIndication, setSurgeryIndication] = useState("")
  const [surgeryAnesthesia, setSurgeryAnesthesia] = useState("umum")
  const [surgerySuccess, setSurgerySuccess] = useState(false)
  const [surgeryLoading, setSurgeryLoading] = useState(false)

  // Current encounter for today's visit
  const {
    todayRecords, createDailyRecord, actionLoading: drAction, refresh: refreshDr,
  } = useDailyRecords({
    admissionId: admission.id,
    episodeOfCareId: admission.episode_of_care_id,
    patientId: admission.patient_id,
    poliServiceId,
  })

  const currentEncounterId = todayRecords[0]?.encounter_id ?? null

  const handleSubmitSurgery = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentEncounterId) {
      setError("Mulai kunjungan hari ini terlebih dahulu sebelum memesan tindakan operasi.")
      return
    }
    if (!surgeryType.trim() || !surgeryIndication.trim()) {
      setError("Jenis operasi dan indikasi klinis wajib diisi")
      return
    }
    setSurgeryLoading(true)
    setError("")
    setSurgerySuccess(false)
    try {
      await postSurgeryRequest({
        patient_id: admission.patient_id,
        encounter_id: currentEncounterId,
        episode_of_care_id: admission.episode_of_care_id,
        surgery_type: surgeryType,
        indication: surgeryIndication,
        anesthesia_type: surgeryAnesthesia,
        needs_inpatient_after: true,
      })
      setSurgeryType("")
      setSurgeryIndication("")
      setSurgerySuccess(true)
      setTimeout(() => setSurgerySuccess(false), 5000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSurgeryLoading(false)
    }
  }

  // Lab orders for current encounter
  const { data: labOrders, create: createLab, actionLoading: labActing, error: labError } = useLabOrders({
    encounterId: currentEncounterId ?? undefined,
    fallbackPollMs: 0,
  })

  // Load CPPT history
  useEffect(() => {
    getClinicalNotesByEpisode(admission.episode_of_care_id)
      .then(setPreviousNotes)
      .catch(() => setPreviousNotes([]))
  }, [admission.episode_of_care_id])

  // Load vitals + existing resume
  useEffect(() => {
    if (!currentEncounterId) return
    getVitalSigns(currentEncounterId)
      .then((vs) => setLatestVitals(vs[0] ?? null))
      .catch(() => {})
    getMedicalResume({ encounter_id: currentEncounterId })
      .then((data) => {
        const r = data[0]
        if (r) {
          setResume({
            chief_complaint: r.chief_complaint ?? "",
            history_of_illness: r.history_of_illness ?? "",
            physical_examination: r.physical_examination ?? "",
            summary: r.summary ?? "",
            follow_up_plan: r.follow_up_plan ?? "",
          })
          setResumeSaved(true)
        }
      })
      .catch(() => {})
  }, [currentEncounterId])

  const daysSince = Math.floor(
    (Date.now() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
  )

  // Submit visit note
  const handleSubmitNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentEncounterId) return
    setLoading(true)
    setError("")
    try {
      await postClinicalNote({
        encounter_id: currentEncounterId,
        patient_id: admission.patient_id,
        ...soap,
      })
      setSoap({ subjective: "", objective: "", assessment: "", plan: "" })
      const notes = await getClinicalNotesByEpisode(admission.episode_of_care_id)
      setPreviousNotes(notes)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Discharge approval flow — dokter menyetujui kepulangan, kasir yang menyelesaikan pembayaran
  const handleDischarge = async () => {
    if (!dischargeSummary.trim()) {
      setError("Ringkasan pulang wajib diisi")
      return
    }
    setLoading(true)
    setError("")
    try {
      await patchInpatientAdmission(admission.id, {
        status: "discharge_approved",
        discharge_summary: dischargeSummary,
      })
      onDischarge()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{admission.patients.full_name}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground/60">
            <span>MR: {admission.patients.medical_record_no}</span>
            <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" /> {admission.locations?.name} · Bed {admission.bed_number}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Hari ke-{daysSince + 1}</span>
          </div>
          {admission.episodes_of_care?.diagnosis_primary && (
            <p className="text-xs text-foreground/40 mt-0.5">Dx: {admission.episodes_of_care.diagnosis_primary}</p>
          )}
        </div>
        <StatusBadge status={admission.status} />
      </div>

      {/* Vitals strip */}
      {latestVitals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          {latestVitals.systolic_bp && (
            <div className="flex items-center gap-2 text-sm">
              <Heart className="w-4 h-4 text-red-500" />
              <span className="text-foreground/60">TD:</span>
              <span className="font-medium">{latestVitals.systolic_bp}/{latestVitals.diastolic_bp}</span>
            </div>
          )}
          {latestVitals.heart_rate && (
            <div className="flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4 text-pink-500" />
              <span className="text-foreground/60">Nadi:</span>
              <span className="font-medium">{latestVitals.heart_rate} bpm</span>
            </div>
          )}
          {latestVitals.temperature && (
            <div className="flex items-center gap-2 text-sm">
              <Thermometer className="w-4 h-4 text-orange-500" />
              <span className="text-foreground/60">Suhu:</span>
              <span className="font-medium">{latestVitals.temperature}°C</span>
            </div>
          )}
          {latestVitals.oxygen_saturation && (
            <div className="flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4 text-blue-500" />
              <span className="text-foreground/60">SpO₂:</span>
              <span className="font-medium">{latestVitals.oxygen_saturation}%</span>
            </div>
          )}
        </div>
      )}

      {/* Loading while poli service resolves */}
      {poliLoading ? (
        <div className="flex items-center justify-center gap-3 py-12 text-foreground/50">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Memuat data pasien...</span>
        </div>
      ) : !currentEncounterId ? (
        <div className="p-4 rounded-lg border border-dashed border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20">
          <p className="text-sm font-medium mb-2">Mulai Kunjungan Hari Ini</p>
          <Button size="sm" onClick={() => createDailyRecord()} disabled={drAction}>
            {drAction ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Buat Encounter Visite
          </Button>
        </div>
      ) : null}

      {error && (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      )}

      {/* Main tabs */}
      {currentEncounterId && (
        <Tabs defaultValue="notes" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="notes"><FileText className="w-4 h-4 mr-1" /> Catatan Visite</TabsTrigger>
            <TabsTrigger value="lab"><FlaskConical className="w-4 h-4 mr-1" /> Lab</TabsTrigger>
            <TabsTrigger value="surgery"><Activity className="w-4 h-4 mr-1" /> Operasi (OK)</TabsTrigger>
            <TabsTrigger value="discharge"><BedDouble className="w-4 h-4 mr-1" /> Pulang</TabsTrigger>
          </TabsList>

          {/* Visit Notes Tab */}
          <TabsContent value="notes" className="space-y-4 mt-4">
            <form onSubmit={handleSubmitNote} className="space-y-3">
              {(["subjective", "objective", "assessment", "plan"] as const).map((field) => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs font-medium uppercase tracking-wide text-foreground/60">
                    {field === "subjective" ? "S — Subjective"
                      : field === "objective" ? "O — Objective"
                      : field === "assessment" ? "A — Assessment"
                      : "P — Plan"}
                  </Label>
                  <Textarea
                    rows={2}
                    value={soap[field]}
                    onChange={(e) => setSoap((p) => ({ ...p, [field]: e.target.value }))}
                  />
                </div>
              ))}
              <Button type="submit" disabled={loading || (!soap.subjective && !soap.objective)} className="w-full">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : "Simpan Catatan Visite"}
              </Button>
            </form>

            <Separator />

            {/* CPPT Timeline */}
            {previousNotes.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Riwayat CPPT (Semua Profesi)</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {previousNotes.map((note) => {
                    const roleLabel =
                      note.writer_role === "doctor" ? "Dokter" :
                      note.writer_role === "nurse" ? "Perawat" :
                      note.writer_role === "nutritionist" ? "Ahli Gizi" :
                      note.writer_role === "pharmacist" ? "Apoteker" :
                      note.writer_role ?? "—"

                    const roleColor =
                      note.writer_role === "doctor" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                      note.writer_role === "nurse" ? "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" :
                      note.writer_role === "nutritionist" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                      "bg-muted text-foreground/60"

                    return (
                      <div key={note.id} className="p-3 rounded-lg border bg-muted/20 text-sm space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-foreground/40" />
                            <span className="font-medium">{(note as any).practitioners?.full_name ?? "—"}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleColor}`}>
                              {roleLabel}
                            </span>
                          </div>
                          <span className="flex items-center gap-1 text-xs text-foreground/40">
                            <Clock className="w-3 h-3" />
                            {new Date(note.note_date).toLocaleString("id-ID", {
                              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {note.subjective && <p className="text-xs"><span className="font-semibold text-foreground/60">S:</span> {note.subjective}</p>}
                        {note.objective && <p className="text-xs"><span className="font-semibold text-foreground/60">O:</span> {note.objective}</p>}
                        {note.assessment && <p className="text-xs"><span className="font-semibold text-foreground/60">A:</span> {note.assessment}</p>}
                        {note.plan && <p className="text-xs"><span className="font-semibold text-foreground/60">P:</span> {note.plan}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Lab Tab */}
          <TabsContent value="lab" className="mt-4">
            <LabOrderForm
              encounterId={currentEncounterId}
              patientId={admission.patient_id}
              onSubmit={async (input) => { const ok = await createLab(input); return ok }}
              onCancel={() => {}}
              loading={labActing}
              error={labError}
            />
            {labOrders.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="font-semibold text-sm">Lab Orders</h4>
                {labOrders.map((lo) => (
                  <div key={lo.id} className="flex justify-between items-center p-3 rounded-lg border text-sm">
                    <div>
                      <p className="font-medium">{lo.lab_order_items.map((i) => i.test_name).join(", ")}</p>
                      <p className="text-xs text-foreground/50">{lo.priority}</p>
                    </div>
                    <StatusBadge status={lo.status} />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Discharge / Resume Tab */}
          <TabsContent value="discharge" className="space-y-5 mt-4">
            {/* Resume Medis */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Resume Medis Rawat Inap
                </h4>
                {resumeSaved && <Badge variant="outline" className="text-xs text-green-600 border-green-400">Tersimpan</Badge>}
              </div>

              {[
                { key: "chief_complaint",    label: "Keluhan Utama Masuk",         rows: 2, placeholder: "Keluhan utama saat pasien masuk rumah sakit..." },
                { key: "history_of_illness", label: "Riwayat Penyakit",            rows: 3, placeholder: "Anamnesis singkat, riwayat penyakit dahulu, riwayat keluarga..." },
                { key: "physical_examination", label: "Pemeriksaan Fisik",         rows: 3, placeholder: "Keadaan umum, tanda vital, pemeriksaan head-to-toe..." },
                { key: "summary",            label: "Ringkasan Perawatan",         rows: 4, placeholder: "Diagnosis masuk, diagnosis akhir, tindakan yang dilakukan, hasil lab/radiologi, terapi yang diberikan selama perawatan..." },
                { key: "follow_up_plan",     label: "Instruksi Pulang & Kontrol", rows: 3, placeholder: "Obat yang dibawa pulang, jadwal kontrol, aktivitas yang diperbolehkan/dilarang, tanda bahaya yang perlu diwaspadai..." },
              ].map(({ key, label, rows, placeholder }) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-foreground/60">{label}</Label>
                  <Textarea
                    rows={rows}
                    value={resume[key as keyof typeof resume]}
                    onChange={(e) => setResume((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                  />
                </div>
              ))}

              <Button
                type="button"
                disabled={loading}
                variant="outline"
                className="w-full"
                onClick={async () => {
                  if (!currentEncounterId) return
                  setLoading(true)
                  setError("")
                  try {
                    await postMedicalResume({
                      encounter_id: currentEncounterId,
                      patient_id: admission.patient_id,
                      ...resume,
                    })
                    setResumeSaved(true)
                  } catch (err: any) {
                    setError(err.message)
                  } finally {
                    setLoading(false)
                  }
                }}
              >
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : "Simpan Resume Medis"}
              </Button>
            </div>

            <Separator />

            {/* Discharge action */}
            <div className="p-4 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 space-y-3">
              <h4 className="font-semibold text-sm">Proses Kepulangan</h4>
              <p className="text-xs text-foreground/60">Isi kondisi pulang lalu pulangkan pasien. Pastikan resume medis sudah disimpan.</p>
              <div className="space-y-2">
                <Label>Kondisi Saat Pulang *</Label>
                <Textarea
                  rows={2}
                  value={dischargeSummary}
                  onChange={(e) => setDischargeSummary(e.target.value)}
                  placeholder="Contoh: Sembuh / Membaik / Pulang atas permintaan sendiri / Dirujuk..."
                />
              </div>
              <Button
                onClick={handleDischarge}
                disabled={loading || !dischargeSummary.trim()}
                className="w-full bg-orange-600 hover:bg-orange-700"
              >
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Memproses...</> : "Setujui Kepulangan"}
              </Button>
            </div>
          </TabsContent>

          {/* Surgery Tab */}
          <TabsContent value="surgery" className="space-y-4 mt-4">
            <form onSubmit={handleSubmitSurgery} className="space-y-4 p-4 rounded-lg border bg-muted/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
                <Activity className="w-4 h-4" /> Form Permintaan Tindakan Operasi (OK)
              </div>
              <p className="text-xs text-foreground/60">
                Kirim permintaan operasi untuk diproses dan dijadwalkan oleh perawat di Dashboard OK. 
                Secara default, pasien ini akan kembali dirawat di bangsal rawat inap pasca-operasi.
              </p>

              {surgerySuccess && (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300">
                  <AlertDescription>Permintaan tindakan operasi berhasil dikirim ke antrian OK!</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Jenis Operasi *</Label>
                  <Input
                    value={surgeryType}
                    onChange={(e) => setSurgeryType(e.target.value)}
                    placeholder="Ex: Appendectomy, Sectio Caesarea, debridement"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Indikasi Klinis *</Label>
                  <Input
                    value={surgeryIndication}
                    onChange={(e) => setSurgeryIndication(e.target.value)}
                    placeholder="Ex: Appendicitis Akut, Fetal Distress"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Jenis Anestesi</Label>
                  <Select value={surgeryAnesthesia} onValueChange={setSurgeryAnesthesia}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="umum">Umum (General)</SelectItem>
                      <SelectItem value="spinal">Spinal (Regional)</SelectItem>
                      <SelectItem value="lokal">Lokal</SelectItem>
                      <SelectItem value="regional">Regional Block</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                type="submit"
                disabled={surgeryLoading || !surgeryType.trim() || !surgeryIndication.trim()}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                {surgeryLoading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengirim...</>
                ) : (
                  <><Activity className="w-4 h-4 mr-2" />Kirim Permintaan Operasi</>
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
