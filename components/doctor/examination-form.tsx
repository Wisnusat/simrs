/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { postClinicalNote, postDiagnosis, postPrescription, patchEncounter, patchQueueStatus, getMedications, getVitalSigns, postEpisodeOfCare, postReferral, postSurgeryRequest, searchICD10 } from "@/lib/api/client"
import type { ICD10Record } from "@/lib/api/client"
import { useLabOrders } from "@/hooks/outpatient/use-lab-orders"
import { useAllergies } from "@/hooks/inpatient/use-allergies"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Search, Activity, Heart, Thermometer, Loader2, FlaskConical, BedDouble, FileIcon, AlertTriangle } from "lucide-react"
import PatientHistoryPanel from "@/components/doctor/patient-history-panel"
import type { Medication, VitalSigns } from "@/lib/types/outpatient"
import { createClient } from "@/lib/supabase/client"

interface ExaminationFormProps {
  patient: {
    id: string
    full_name: string
    medical_record_no?: string
  }
  encounterId: string
  queueId?: string
  chiefComplaint?: string
  queueNumber?: string | number
  onSave: () => void
  onCancel: () => void
}

interface RxItem {
  medication: Medication
  dosage: string
  frequency: string
  duration_days: number
  quantity: number
  instructions: string
}

export default function ExaminationForm({
  patient,
  encounterId,
  queueId,
  chiefComplaint,
  queueNumber,
  onSave,
  onCancel,
}: ExaminationFormProps) {
  // ── SOAP ──
  const [soap, setSoap] = useState({
    subjective: chiefComplaint ?? "",
    objective: "",
    assessment: "",
    plan: "",
  })

  // ── Diagnosis ──
  const [icd10Code, setIcd10Code] = useState("")
  const [icd10Display, setIcd10Display] = useState("")
  const [careStatus, setCareStatus] = useState("rawat_jalan")

  // ── ICD-10 Autocomplete ──
  const [icdSearch, setIcdSearch] = useState("")
  const [icdResults, setIcdResults] = useState<ICD10Record[]>([])
  const [icdSearching, setIcdSearching] = useState(false)
  const [icdDropdownOpen, setIcdDropdownOpen] = useState(false)
  const icdSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const query = icdSearch.trim()
    if (query.length < 3) {
      setIcdResults([])
      setIcdDropdownOpen(false)
      return
    }
    if (icdSearchTimer.current) clearTimeout(icdSearchTimer.current)
    icdSearchTimer.current = setTimeout(async () => {
      setIcdSearching(true)
      try {
        const results = await searchICD10(query)
        setIcdResults(results)
        setIcdDropdownOpen(true)
      } catch {
        setIcdResults([])
      } finally {
        setIcdSearching(false)
      }
    }, 300)
    return () => {
      if (icdSearchTimer.current) clearTimeout(icdSearchTimer.current)
    }
  }, [icdSearch])

  // ── Rujukan ──
  const [referralDestination, setReferralDestination] = useState("")
  const [referralSpecialty, setReferralSpecialty] = useState("")
  const [referralUrgency, setReferralUrgency] = useState<"routine" | "urgent" | "emergency">("routine")
  const [referralReason, setReferralReason] = useState("")

  // ── Surgery Request (OK) ──
  const [surgeryType, setSurgeryType] = useState("")
  const [surgeryIndication, setSurgeryIndication] = useState("")
  const [surgeryAnesthesia, setSurgeryAnesthesia] = useState("umum")
  const [surgeryNeedsInpatient, setSurgeryNeedsInpatient] = useState(false)

  // ── Inpatient Room Selection (Handled by Nurse Dashboard) ──

  // ── Prescription ──
  const [rxSearch, setRxSearch] = useState("")
  const [rxResults, setRxResults] = useState<Medication[]>([])
  const [rxSearching, setRxSearching] = useState(false)
  const [rxItems, setRxItems] = useState<RxItem[]>([])
  const [adding, setAdding] = useState<Medication | null>(null)
  const [addForm, setAddForm] = useState({ dosage: "", frequency: "3x1", duration_days: 5, quantity: 10, instructions: "" })
  const [isCustomFrequency, setIsCustomFrequency] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Vital signs (prefetch for display) ──
  const [vitals, setVitals] = useState<VitalSigns | null>(null)
  useEffect(() => {
    getVitalSigns(encounterId).then((vs) => setVitals(vs[0] ?? null)).catch(() => { })
  }, [encounterId])

  // ── Lab Orders ──
  const { data: labOrders, loading: labLoading } = useLabOrders({ encounterId, pollIntervalMs: 0 })

  // ── Patient Allergies ──
  const { data: allergies } = useAllergies(patient.id)

  // ── Patient history is handled by <PatientHistoryPanel /> ──

  // ── Medicine search (debounced 300ms) ──
  useEffect(() => {
    if (!rxSearch.trim()) { setRxResults([]); return }
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setRxSearching(true)
      try { setRxResults(await getMedications(rxSearch)) }
      catch { /* silent */ }
      finally { setRxSearching(false) }
    }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [rxSearch])

  const selectMedicine = (med: Medication) => {
    setAdding(med)
    setAddForm({ dosage: "", frequency: "3x1", duration_days: 5, quantity: 10, instructions: "" })
    setIsCustomFrequency(false)
    setRxSearch("")
    setRxResults([])
  }

  const confirmAdd = () => {
    if (!adding || !addForm.dosage) return
    setRxItems((prev) => [
      ...prev,
      {
        medication: adding, dosage: addForm.dosage, frequency: addForm.frequency,
        duration_days: addForm.duration_days, quantity: addForm.quantity, instructions: addForm.instructions
      },
    ])
    setAdding(null)
  }

  const removeRx = (idx: number) => setRxItems((prev) => prev.filter((_, i) => i !== idx))

  // ── Submit ──
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      if (!icd10Code || !icd10Display) throw new Error("Kode ICD-10 dan nama diagnosis wajib diisi")



      // Validate referral fields
      if (careStatus === "rujukan") {
        if (!referralDestination.trim()) throw new Error("Faskes tujuan rujukan wajib diisi")
        if (!referralReason.trim()) throw new Error("Alasan klinis rujukan wajib diisi")
      }

      // Validate surgery fields
      if (careStatus === "operasi") {
        if (!surgeryType.trim()) throw new Error("Jenis operasi wajib diisi")
        if (!surgeryIndication.trim()) throw new Error("Indikasi operasi wajib diisi")
      }

      // 1. SOAP note
      await postClinicalNote({
        encounter_id: encounterId,
        patient_id: patient.id,
        subjective: soap.subjective,
        objective: soap.objective,
        assessment: soap.assessment,
        plan: soap.plan,
      })

      // 2. Diagnosis
      await postDiagnosis({
        encounter_id: encounterId,
        patient_id: patient.id,
        icd10_code: icd10Code,
        icd10_display: icd10Display,
        diagnosis_type: "primary",
      })

      // 3. Prescription (if any medicines added)
      if (rxItems.length > 0) {
        await postPrescription({
          encounter_id: encounterId,
          patient_id: patient.id,
          items: rxItems.map((item) => ({
            medication_id: item.medication.id,
            dosage: item.dosage,
            frequency: item.frequency,
            duration_days: item.duration_days,
            quantity: item.quantity,
            instructions: item.instructions,
          })),
        })
      }

      // ── Rawat Inap: request admission, let Nurse assign room ──
      if (careStatus === "rawat_inap") {
        // 4. Create Episode of Care (No room assigned yet)
        const episode = await postEpisodeOfCare({
          patient_id: patient.id,
          dpjp_id: "__self__",
          diagnosis_primary: `${icd10Code} - ${icd10Display}`,
        })

        // 5. Encounter → admitted + link to episode
        await patchEncounter(encounterId, {
          status: "admitted",
          episode_of_care_id: episode.id,
        } as any)

        // 6. Queue → done
        if (queueId) await patchQueueStatus(queueId, "done")

      } else if (careStatus === "rujukan") {
        // 4. Create Referral Record
        await postReferral({
          encounter_id: encounterId,
          patient_id: patient.id,
          destination_facility_name: referralDestination,
          destination_specialty: referralSpecialty,
          referral_reason: referralReason,
          urgency: referralUrgency
        })

        // 5. Encounter → finished
        await patchEncounter(encounterId, { status: "finished" } as any)
        if (queueId) await patchQueueStatus(queueId, "done")

      } else if (careStatus === "operasi") {
        // 4. Create Surgery Request
        await postSurgeryRequest({
          patient_id: patient.id,
          encounter_id: encounterId,
          surgery_type: surgeryType,
          indication: surgeryIndication,
          anesthesia_type: surgeryAnesthesia,
          needs_inpatient_after: surgeryNeedsInpatient,
        })

        // 5. Outpatient encounter completes normally after requesting surgery
        await patchEncounter(encounterId, { status: "finished" } as any)
        if (queueId) await patchQueueStatus(queueId, "done")

      } else {
        // ── Rawat Jalan: finish encounter normally ──
        // 4. Encounter → finished (triggers auto-invoice update on API side)
        await patchEncounter(encounterId, { status: "finished" } as any)

        // 5. Queue → done
        if (queueId) await patchQueueStatus(queueId, "done")
      }

      onSave()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Vital signs summary strip ──
  const VitalStrip = () => {
    if (!vitals) return null
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
        {vitals.systolic_bp && (
          <div className="flex items-center gap-2 text-sm">
            <Heart className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-foreground/60">TD:</span>
            <span className="font-medium">{vitals.systolic_bp}/{vitals.diastolic_bp} mmHg</span>
          </div>
        )}
        {vitals.heart_rate && (
          <div className="flex items-center gap-2 text-sm">
            <Activity className="w-4 h-4 text-pink-500 shrink-0" />
            <span className="text-foreground/60">Nadi:</span>
            <span className="font-medium">{vitals.heart_rate} bpm</span>
          </div>
        )}
        {vitals.temperature && (
          <div className="flex items-center gap-2 text-sm">
            <Thermometer className="w-4 h-4 text-orange-500 shrink-0" />
            <span className="text-foreground/60">Suhu:</span>
            <span className="font-medium">{vitals.temperature}°C</span>
          </div>
        )}
        {vitals.oxygen_saturation && (
          <div className="flex items-center gap-2 text-sm">
            <Activity className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-foreground/60">SpO₂:</span>
            <span className="font-medium">{vitals.oxygen_saturation}%</span>
          </div>
        )}
        {vitals.weight_kg && (
          <div className="flex items-center gap-2 text-sm col-span-2 md:col-span-1">
            <span className="text-foreground/60">BB/TB:</span>
            <span className="font-medium">{vitals.weight_kg} kg{vitals.height_cm ? ` / ${vitals.height_cm} cm` : ""}</span>
          </div>
        )}
        {vitals.notes && (
          <div className="col-span-2 md:col-span-4 mt-1 pt-2 border-t border-blue-200/50 dark:border-blue-800/50 text-sm flex gap-2">
            <span className="text-foreground/60 shrink-0">Catatan Perawat:</span>
            <span className="font-medium italic">{vitals.notes}</span>
          </div>
        )}
        {allergies && allergies.length > 0 && (
          <div className="col-span-2 md:col-span-4 mt-1 pt-2 border-t border-blue-200/50 dark:border-blue-800/50 text-sm flex gap-2 flex-wrap items-center animate-in fade-in duration-200">
            <span className="text-foreground/60 shrink-0 flex items-center text-red-500 font-semibold gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Alergi:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {allergies.map((al) => (
                <Badge
                  key={al.id}
                  variant="outline"
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${al.criticality === "high"
                      ? "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900"
                      : "bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-900"
                    }`}
                >
                  {al.substance_display}
                  {al.category === "food" ? " (Makanan)" : al.category === "medication" ? " (Obat)" : " (Lingkungan)"}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Lab Strip ──
  const LabStrip = () => {
    if (labLoading) return <div className="text-sm text-foreground/50 mb-4 flex items-center"><Loader2 className="w-4 h-4 animate-spin mr-2" />Memuat hasil lab...</div>
    const completedLabs = labOrders.filter(o => o.status === "result_uploaded" || o.status === "verified")
    if (completedLabs.length === 0) return null

    return (
      <div className="mb-4 space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-purple-500" /> Hasil Pemeriksaan Lab
        </h4>
        {completedLabs.map(order => (
          <div key={order.id}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {order.lab_order_items.map(item => {
                const supabase = createClient()
                const fileUrl = item.file_id
                  ? supabase.storage.from("lab_result").getPublicUrl(item.file_id).data.publicUrl
                  : null

                return (
                  <div key={item.id} className="flex flex-col gap-1 bg-background p-2 rounded-md border text-xs">
                    <span className="font-medium">{item.test_name}</span>
                    <div className="flex items-center justify-between mt-1">
                      {fileUrl ? (
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <FileIcon className="w-3 h-3" /> Lihat Dokumen / Gambar
                        </a>
                      ) : (
                        <span>{item.result_value ?? "—"} {item.result_unit ?? ""} </span>
                      )}

                      <Badge variant={
                        item.result_status === "critical" ? "destructive" :
                          item.result_status?.startsWith("abnormal") ? "secondary" : "outline"
                      } className="text-[10px] px-1.5 py-0">
                        {item.result_status === "normal" ? "Normal" :
                          item.result_status === "abnormal_low" ? "Rendah" :
                            item.result_status === "abnormal_high" ? "Tinggi" :
                              item.result_status === "critical" ? "Kritis" : "—"}
                      </Badge>
                    </div>
                    {item.reference_range && !fileUrl && <span className="text-foreground/50">Ref: {item.reference_range}</span>}
                  </div>
                )
              })}
            </div>
            {order.clinical_notes && (
              <p className="mt-2 text-xs text-foreground/60 italic">Catatan: {order.clinical_notes}</p>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div>
        <div className="flex items-start justify-between">
          <div className="text-sm text-foreground/60 space-y-0.5">
            <p><strong>Pasien:</strong> {patient.full_name}</p>
            {patient.medical_record_no && <p><strong>No. MR:</strong> {patient.medical_record_no}</p>}
            <p><strong>Keluhan:</strong> {chiefComplaint ?? "—"}</p>
            <p><strong>Tanggal:</strong> {new Date().toLocaleDateString("id-ID")}</p>
          </div>
          {queueNumber && <Badge variant="outline">#{queueNumber}</Badge>}
        </div>
      </div>

      <div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <VitalStrip />
          <LabStrip />

          {/* ── PATIENT HISTORY ── */}
          <PatientHistoryPanel patientId={patient.id} currentEncounterId={encounterId} />

          <Tabs defaultValue="soap" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="soap">Catatan SOAP</TabsTrigger>
              <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
              <TabsTrigger value="prescription">
                Resep Obat
                {rxItems.length > 0 && (
                  <Badge className="ml-2 h-5 px-1.5 text-xs" variant="secondary">{rxItems.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── SOAP ── */}
            <TabsContent value="soap" className="space-y-4 mt-4">
              {(["subjective", "objective", "assessment", "plan"] as const).map((field) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={field}>
                    {field === "subjective" ? "Subjective (Keluhan Pasien)"
                      : field === "objective" ? "Objective (Pemeriksaan Fisik)"
                        : field === "assessment" ? "Assessment (Penilaian)"
                          : "Plan (Rencana Tatalaksana)"}
                  </Label>
                  <Textarea
                    id={field}
                    rows={3}
                    value={soap[field]}
                    onChange={(e) => setSoap((prev) => ({ ...prev, [field]: e.target.value }))}
                    placeholder={
                      field === "subjective" ? "Keluhan yang dirasakan pasien..."
                        : field === "objective" ? "Hasil pemeriksaan fisik..."
                          : field === "assessment" ? "Penilaian klinis dokter..."
                            : "Rencana pengobatan dan tatalaksana..."
                    }
                  />
                </div>
              ))}
            </TabsContent>

            {/* ── DIAGNOSIS ── */}
            <TabsContent value="diagnosis" className="space-y-6 mt-4">
              <div className="space-y-2">
                <Label htmlFor="icd10Search">Cari & Pilih Diagnosis ICD-10 *</Label>
                {icd10Code ? (
                  <div className="flex items-center justify-between p-3 border rounded-md bg-muted/40 border-muted-foreground/20 shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-center space-x-3">
                      <Badge variant="outline" className="font-mono bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900 px-2.5 py-1 text-xs font-bold rounded-md">
                        {icd10Code}
                      </Badge>
                      <span className="text-sm font-medium text-foreground">{icd10Display}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIcd10Code("")
                        setIcd10Display("")
                        setIcdSearch("")
                        setIcdResults([])
                      }}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full"
                    >
                      ✕
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <Input
                        id="icd10Search"
                        value={icdSearch}
                        onChange={(e) => setIcdSearch(e.target.value)}
                        placeholder="Ketik kode (mis. A91) atau nama diagnosis (mis. Dengue)..."
                        className="pr-10"
                        required={!icd10Code}
                      />
                      <div className="absolute right-3 top-2.5 text-muted-foreground">
                        {icdSearching ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </div>
                    </div>

                    {icdDropdownOpen && icdResults.length > 0 && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIcdDropdownOpen(false)} />
                        <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border border-muted-foreground/20 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {icdResults.map((item) => (
                            <button
                              key={item.code}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 border-b border-muted/20 last:border-b-0 transition-colors"
                              onClick={() => {
                                setIcd10Code(item.code)
                                setIcd10Display(item.name_en)
                                setIcdDropdownOpen(false)
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded text-xs">
                                  {item.code}
                                </span>
                              </div>
                              <div className="mt-1 font-medium">{item.name_en}</div>
                              {item.name_id && (
                                <div className="text-xs text-muted-foreground italic">
                                  {item.name_id}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {icdSearch.trim().length >= 3 && icdResults.length === 0 && !icdSearching && (
                      <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border border-muted-foreground/20 rounded-md shadow-lg p-3 text-xs text-muted-foreground text-center">
                        Tidak ditemukan diagnosis dengan kata kunci &quot;{icdSearch}&quot;
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="font-semibold">Status Perawatan</h4>
                <RadioGroup value={careStatus} onValueChange={setCareStatus} className="flex gap-6">
                  {[["rawat_jalan", "Rawat Jalan"], ["rawat_inap", "Rawat Inap"], ["operasi", "Operasi (OK)"], ["rujukan", "Rujukan"]].map(([v, l]) => (
                    <div key={v} className="flex items-center space-x-2">
                      <RadioGroupItem value={v} id={v} />
                      <Label htmlFor={v}>{l}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>



              {careStatus === "operasi" && (
                <div className="space-y-4 p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
                  <h4 className="font-semibold flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <Activity className="w-4 h-4" /> Pengaturan Permintaan Operasi (OK)
                  </h4>
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
                    <div className="space-y-2 flex flex-col justify-end">
                      <Label className="mb-2">Perawatan Pasca Operasi</Label>
                      <div className="flex items-center space-x-2 h-10">
                        <input
                          type="checkbox"
                          id="needsInpatient"
                          checked={surgeryNeedsInpatient}
                          onChange={(e) => setSurgeryNeedsInpatient(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <Label htmlFor="needsInpatient" className="font-normal cursor-pointer select-none">
                          Butuh Rawat Inap Setelah Operasi
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {careStatus === "rujukan" && (
                <div className="space-y-4 p-4 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
                  <h4 className="font-semibold flex items-center gap-2 text-sm">
                    <Activity className="w-4 h-4 text-purple-500" /> Pengaturan Rujukan Keluar
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Faskes Tujuan *</Label>
                      <Input
                        value={referralDestination}
                        onChange={(e) => setReferralDestination(e.target.value)}
                        placeholder="Ex: RSUD Kota Bandung"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Poli / Spesialisasi</Label>
                      <Input
                        value={referralSpecialty}
                        onChange={(e) => setReferralSpecialty(e.target.value)}
                        placeholder="Ex: Poli Jantung"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Alasan Rujukan *</Label>
                      <Input
                        value={referralReason}
                        onChange={(e) => setReferralReason(e.target.value)}
                        placeholder="Mis. Fasilitas tidak memadai, butuh spesialis"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Urgensi</Label>
                      <Select value={referralUrgency} onValueChange={(v) => setReferralUrgency(v as "routine" | "urgent" | "emergency")}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="routine">Rutin (Biasa)</SelectItem>
                          <SelectItem value="urgent">Urgen (Segera)</SelectItem>
                          <SelectItem value="emergency">Gawat Darurat</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── PRESCRIPTION ── */}
            <TabsContent value="prescription" className="space-y-4 mt-4">
              {/* Search */}
              <div className="relative">
                <div className="flex items-center gap-2 border rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
                  <Search className="w-4 h-4 text-foreground/40 shrink-0" />
                  <input
                    className="flex-1 bg-transparent outline-none text-sm placeholder:text-foreground/40"
                    placeholder="Cari nama obat..."
                    value={rxSearch}
                    onChange={(e) => setRxSearch(e.target.value)}
                  />
                  {rxSearching && <Loader2 className="w-4 h-4 animate-spin text-foreground/40 shrink-0" />}
                </div>
                {rxResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {rxResults.map((med) => (
                      <button
                        key={med.id}
                        type="button"
                        className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors"
                        onClick={() => selectMedicine(med)}
                      >
                        <p className="font-medium text-sm">{med.name}</p>
                        <p className="text-xs text-foreground/50">
                          {med.form} · Stok: {med.stock_available}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Add medicine mini-form */}
              {adding && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="font-semibold text-sm">{adding.name} <span className="text-foreground/50 font-normal">· {adding.form} {adding.strength}</span></p>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>✕</Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Dosis *</Label>
                      <Input size={1} placeholder="mis. 500mg" value={addForm.dosage}
                        onChange={(e) => setAddForm((p) => ({ ...p, dosage: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      {isCustomFrequency ? (
                        <>
                          <div className="flex justify-between items-center">
                            <Label className="text-xs">Frekuensi *</Label>
                            <button
                              type="button"
                              onClick={() => {
                                setIsCustomFrequency(false)
                                setAddForm((p) => ({ ...p, frequency: "3x1" }))
                              }}
                              className="text-[10px] text-blue-600 hover:underline hover:text-blue-800"
                            >
                              Pilih Preset
                            </button>
                          </div>
                          <Input
                            placeholder="mis. 3x1 atau Sesuai kebutuhan"
                            value={addForm.frequency}
                            onChange={(e) => setAddForm((p) => ({ ...p, frequency: e.target.value }))}
                          />
                        </>
                      ) : (
                        <>
                          <Label className="text-xs">Frekuensi</Label>
                          <Select
                            value={addForm.frequency}
                            onValueChange={(v) => {
                              if (v === "Lain - lain") {
                                setIsCustomFrequency(true)
                                setAddForm((p) => ({ ...p, frequency: "" }))
                              } else {
                                setAddForm((p) => ({ ...p, frequency: v }))
                              }
                            }}
                          >
                            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["1x1", "2x1", "3x1", "4x1", "3x1/2", "Lain - lain"].map((f) => (
                                <SelectItem key={f} value={f}>{f}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Durasi (hari)</Label>
                      <Input type="number" min={1} value={addForm.duration_days}
                        onChange={(e) => setAddForm((p) => ({ ...p, duration_days: +e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Jumlah (tablet/kapsul)</Label>
                      <Input type="number" min={1} value={addForm.quantity}
                        onChange={(e) => setAddForm((p) => ({ ...p, quantity: +e.target.value }))} />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Instruksi (opsional)</Label>
                      <Input placeholder="mis. Sesudah makan" value={addForm.instructions}
                        onChange={(e) => setAddForm((p) => ({ ...p, instructions: e.target.value }))} />
                    </div>
                  </div>
                  <Button type="button" size="sm" onClick={confirmAdd} disabled={!addForm.dosage}
                    className="w-full bg-green-600 hover:bg-green-700">
                    <Plus className="w-4 h-4 mr-1" /> Tambahkan ke Resep
                  </Button>
                </div>
              )}

              {/* Added items list */}
              {rxItems.length === 0 && !adding ? (
                <p className="text-sm text-foreground/50 text-center py-6 border rounded-lg border-dashed">
                  Belum ada obat yang ditambahkan. Cari obat di atas.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground/60">{rxItems.length} obat ditambahkan</p>
                  {rxItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 rounded-lg border bg-muted/30">
                      <div className="text-sm">
                        <p className="font-semibold">{item.medication.name}</p>
                        <p className="text-foreground/50">{item.dosage} · {item.frequency} · {item.duration_days} hari · Qty: {item.quantity}</p>
                        {item.instructions && <p className="text-foreground/40 italic">{item.instructions}</p>}
                      </div>
                      <Button type="button" size="icon" variant="ghost" className="text-red-500 hover:text-red-600"
                        onClick={() => removeRx(idx)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <Separator />

          <p className="text-xs text-foreground/50">
            {careStatus === "rawat_inap"
              ? "Setelah menyimpan, pasien akan dipindahkan ke rawat inap dan invoice akan dibuat."
              : careStatus === "operasi"
                ? "Setelah menyimpan, permintaan operasi akan dibuat dan pasien dapat diarahkan ke OK."
                : "Setelah menyimpan, encounter akan selesai dan invoice pasien akan otomatis diperbarui."}
          </p>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1" disabled={loading}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className={`flex-1 ${careStatus === "rawat_inap" ? "bg-blue-600 hover:bg-blue-700" : careStatus === "operasi" ? "bg-red-600 hover:bg-red-700" : "bg-[#2E8B57] hover:bg-[#2E8B57]/90"}`}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</>
                : careStatus === "rawat_inap"
                  ? <><BedDouble className="w-4 h-4 mr-2" />Proses Rawat Inap</>
                  : careStatus === "operasi"
                    ? <><Activity className="w-4 h-4 mr-2" />Kirim Permintaan Operasi</>
                    : `Selesai Periksa${rxItems.length > 0 ? ` (${rxItems.length} Obat)` : ""}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
