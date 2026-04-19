/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { postClinicalNote, postDiagnosis, postPrescription, patchEncounter, patchQueueStatus, getMedications, getVitalSigns } from "@/lib/api/client"
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
import { Plus, Trash2, Search, Activity, Heart, Thermometer, Loader2 } from "lucide-react"
import type { Medication, VitalSigns } from "@/lib/types/outpatient"

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
    subjective:  chiefComplaint ?? "",
    objective:   "",
    assessment:  "",
    plan:        "",
  })

  // ── Diagnosis ──
  const [icd10Code,    setIcd10Code]    = useState("")
  const [icd10Display, setIcd10Display] = useState("")
  const [careStatus,   setCareStatus]   = useState("rawat_jalan")

  // ── Prescription ──
  const [rxSearch,    setRxSearch]    = useState("")
  const [rxResults,   setRxResults]   = useState<Medication[]>([])
  const [rxSearching, setRxSearching] = useState(false)
  const [rxItems,     setRxItems]     = useState<RxItem[]>([])
  const [adding,      setAdding]      = useState<Medication | null>(null)
  const [addForm,     setAddForm]     = useState({ dosage: "", frequency: "3x1", duration_days: 5, quantity: 10, instructions: "" })
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Vital signs (prefetch for display) ──
  const [vitals, setVitals] = useState<VitalSigns | null>(null)
  useEffect(() => {
    getVitalSigns(encounterId).then((vs) => setVitals(vs[0] ?? null)).catch(() => {})
  }, [encounterId])

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
    setRxSearch("")
    setRxResults([])
  }

  const confirmAdd = () => {
    if (!adding || !addForm.dosage) return
    setRxItems((prev) => [
      ...prev,
      { medication: adding, dosage: addForm.dosage, frequency: addForm.frequency,
        duration_days: addForm.duration_days, quantity: addForm.quantity, instructions: addForm.instructions },
    ])
    setAdding(null)
  }

  const removeRx = (idx: number) => setRxItems((prev) => prev.filter((_, i) => i !== idx))

  // ── Submit ──
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      if (!icd10Code || !icd10Display) throw new Error("Kode ICD-10 dan nama diagnosis wajib diisi")

      // 1. SOAP note
      await postClinicalNote({
        encounter_id: encounterId,
        patient_id:   patient.id,
        subjective:   soap.subjective,
        objective:    soap.objective,
        assessment:   soap.assessment,
        plan:         soap.plan,
      })

      // 2. Diagnosis
      await postDiagnosis({
        encounter_id:  encounterId,
        patient_id:    patient.id,
        icd10_code:    icd10Code,
        icd10_display: icd10Display,
        diagnosis_type: "primary",
      })

      // 3. Prescription (if any medicines added)
      if (rxItems.length > 0) {
        await postPrescription({
          encounter_id: encounterId,
          patient_id:   patient.id,
          items: rxItems.map((item) => ({
            medication_id: item.medication.id,
            dosage:        item.dosage,
            frequency:     item.frequency,
            duration_days: item.duration_days,
            quantity:      item.quantity,
            instructions:  item.instructions,
          })),
        })
      }

      // 4. Encounter → finished (triggers auto-invoice update on API side)
      await patchEncounter(encounterId, { status: "finished" } as any)

      // 5. Queue → done
      if (queueId) await patchQueueStatus(queueId, "done")

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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="icd10Code">Kode ICD-10 *</Label>
                  <Input
                    id="icd10Code"
                    value={icd10Code}
                    onChange={(e) => setIcd10Code(e.target.value.toUpperCase())}
                    placeholder="Contoh: J11, A09, K29.7"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="icd10Display">Nama Diagnosis *</Label>
                  <Input
                    id="icd10Display"
                    value={icd10Display}
                    onChange={(e) => setIcd10Display(e.target.value)}
                    placeholder="Nama penyakit sesuai ICD-10"
                    required
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="font-semibold">Status Perawatan</h4>
                <RadioGroup value={careStatus} onValueChange={setCareStatus} className="flex gap-6">
                  {[["rawat_jalan", "Rawat Jalan"], ["rawat_inap", "Rawat Inap"], ["rujukan", "Rujukan"]].map(([v, l]) => (
                    <div key={v} className="flex items-center space-x-2">
                      <RadioGroupItem value={v} id={v} />
                      <Label htmlFor={v}>{l}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {careStatus === "rawat_inap" && (
                <div className="space-y-2">
                  <Label>Tipe Kamar *</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="Pilih tipe kamar" /></SelectTrigger>
                    <SelectContent>
                      {["VIP", "Kelas 1", "Kelas 2", "Kelas 3"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                          {med.form} {med.strength} · Stok: {med.stock_available}
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
                      <Label className="text-xs">Frekuensi</Label>
                      <Select value={addForm.frequency} onValueChange={(v) => setAddForm((p) => ({ ...p, frequency: v }))}>
                        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["1x1", "2x1", "3x1", "4x1", "3x1/2", "Jika perlu"].map((f) => (
                            <SelectItem key={f} value={f}>{f}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
            Setelah menyimpan, encounter akan selesai dan invoice pasien akan otomatis diperbarui.
          </p>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1" disabled={loading}>
              Batal
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-[#2E8B57] hover:bg-[#2E8B57]/90">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : `Selesai Periksa${rxItems.length > 0 ? ` (${rxItems.length} Obat)` : ""}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
