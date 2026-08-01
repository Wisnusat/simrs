"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Loader2, Stethoscope, Plus, Trash2, Pill } from "lucide-react"

import type { EmergencyEncounter, Diagnosis, Prescription, Medication, ICD10Record } from "@/lib/types/outpatient"
import {
  getDiagnoses, postDiagnosis, searchICD10,
  getPrescriptions, postPrescription, getMedications,
} from "@/lib/api/client"
import { toast } from "sonner"

interface EmergencyDoctorFormProps {
  encounter: EmergencyEncounter
}

interface RxItem {
  medication_id: string
  medication_name: string
  dosage: string
  frequency: string
  duration_days: number
  quantity: number
}

const FREQUENCIES = ["1x1", "2x1", "3x1", "4x1", "Setiap 8 jam", "Setiap 12 jam", "Sesuai kebutuhan", "Lain-lain"]

export function EmergencyDoctorForm({ encounter }: EmergencyDoctorFormProps) {
  // Diagnosis state
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([])
  const [icdQuery, setIcdQuery] = useState("")
  const [icdResults, setIcdResults] = useState<ICD10Record[]>([])
  const [icdSearching, setIcdSearching] = useState(false)
  const [diagnosisType, setDiagnosisType] = useState<"primary" | "secondary">("primary")
  const [diagSaving, setDiagSaving] = useState(false)
  const [diagError, setDiagError] = useState<string | null>(null)
  const icdDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Prescription state
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [medSearch, setMedSearch] = useState("")
  const [medResults, setMedResults] = useState<Medication[]>([])
  const [medSearching, setMedSearching] = useState(false)
  const [rxItems, setRxItems] = useState<RxItem[]>([])
  const [rxSaving, setRxSaving] = useState(false)
  const [rxError, setRxError] = useState<string | null>(null)
  const medDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)


  const load = useCallback(async () => {
    try {
      const [diags, rxs] = await Promise.all([
        getDiagnoses(encounter.encounter_id),
        getPrescriptions({ encounter_id: encounter.encounter_id }),
      ])
      setDiagnoses(diags)
      setPrescriptions(rxs)
    } catch { /* silent */ }
  }, [encounter.encounter_id])

  useEffect(() => { load() }, [load])

  // ICD-10 search
  useEffect(() => {
    if (icdDebounce.current) clearTimeout(icdDebounce.current)
    if (icdQuery.length < 3) { setIcdResults([]); return }
    icdDebounce.current = setTimeout(async () => {
      setIcdSearching(true)
      try { setIcdResults(await searchICD10(icdQuery)) }
      catch { setIcdResults([]) }
      finally { setIcdSearching(false) }
    }, 300)
  }, [icdQuery])

  // Medication search
  useEffect(() => {
    if (medDebounce.current) clearTimeout(medDebounce.current)
    if (medSearch.length < 2) { setMedResults([]); return }
    medDebounce.current = setTimeout(async () => {
      setMedSearching(true)
      try { setMedResults(await getMedications(medSearch)) }
      catch { setMedResults([]) }
      finally { setMedSearching(false) }
    }, 300)
  }, [medSearch])

  const handleSelectDiagnosis = async (icd: ICD10Record) => {
    setIcdQuery("")
    setIcdResults([])
    setDiagSaving(true)
    setDiagError(null)
    try {
      const saved = await postDiagnosis({
        encounter_id: encounter.encounter_id,
        patient_id: encounter.patient_id,
        icd10_code: icd.code,
        icd10_display: icd.name_id ?? icd.name_en,
        diagnosis_type: diagnosisType,
      })
      setDiagnoses((p) => [...p, saved])
    } catch (err: any) {
      setDiagError(err.message ?? "Gagal menyimpan diagnosis")
    } finally {
      setDiagSaving(false)
    }
  }

  const handleAddMed = (med: Medication) => {
    setMedSearch("")
    setMedResults([])
    if (rxItems.some((r) => r.medication_id === med.id)) return
    setRxItems((p) => [...p, {
      medication_id: med.id,
      medication_name: med.name,
      dosage: "",
      frequency: "3x1",
      duration_days: 3,
      quantity: 1,
    }])
  }

  const updateRxItem = (idx: number, field: keyof RxItem, value: string | number) => {
    setRxItems((p) => p.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const handleSubmitRx = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rxItems.length === 0) return
    const incomplete = rxItems.find((r) => !r.dosage)
    if (incomplete) {
      setRxError(`Dosage untuk ${incomplete.medication_name} belum diisi`)
      return
    }
    setRxSaving(true)
    setRxError(null)
    try {
      await postPrescription({
        encounter_id: encounter.encounter_id,
        patient_id: encounter.patient_id,
        items: rxItems.map((r) => ({
          medication_id: r.medication_id,
          dosage: r.dosage,
          frequency: r.frequency,
          duration_days: r.duration_days,
          quantity: r.quantity,
        })),
      })
      setRxItems([])
      toast.success("Resep disimpan")
      const rxs = await getPrescriptions({ encounter_id: encounter.encounter_id })
      setPrescriptions(rxs)
    } catch (err: any) {
      setRxError(err.message ?? "Gagal menyimpan resep")
    } finally {
      setRxSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Diagnosis ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <Stethoscope className="w-5 h-5 text-blue-500" />
          <h3 className="font-semibold text-lg">Diagnosis</h3>
        </div>

        {diagError && <Alert variant="destructive"><AlertDescription>{diagError}</AlertDescription></Alert>}

        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Input
              value={icdQuery}
              onChange={(e) => setIcdQuery(e.target.value)}
              placeholder="Cari ICD-10 (min 3 karakter)..."
            />
            {(icdSearching || icdResults.length > 0) && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-background border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {icdSearching && (
                  <div className="flex items-center gap-2 p-3 text-sm text-foreground/60">
                    <Loader2 className="w-4 h-4 animate-spin" /> Mencari...
                  </div>
                )}
                {icdResults.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                    onClick={() => handleSelectDiagnosis(r)}
                    disabled={diagSaving}
                  >
                    <span className="font-mono text-blue-600 mr-2">{r.code}</span>
                    {r.name_id ?? r.name_en}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Select value={diagnosisType} onValueChange={(v) => setDiagnosisType(v as "primary" | "secondary")}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="primary">Primer</SelectItem>
              <SelectItem value="secondary">Sekunder</SelectItem>
            </SelectContent>
          </Select>
          {diagSaving && <Loader2 className="w-5 h-5 animate-spin self-center text-blue-500" />}
        </div>

        {diagnoses.length > 0 ? (
          <div className="space-y-2">
            {diagnoses.map((d) => (
              <div key={d.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/20 text-sm">
                <Badge variant={d.diagnosis_type === "primary" ? "default" : "outline"} className="shrink-0">
                  {d.diagnosis_type === "primary" ? "Primer" : "Sekunder"}
                </Badge>
                <span className="font-mono text-blue-600 shrink-0">{d.icd10_code}</span>
                <span className="truncate">{d.icd10_display}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-foreground/50 text-center py-2">Belum ada diagnosis.</p>
        )}
      </div>

      <Separator />

      {/* ── Prescription ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <Pill className="w-5 h-5 text-green-500" />
          <h3 className="font-semibold text-lg">Resep</h3>
        </div>

        {/* Existing prescriptions */}
        {prescriptions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">Resep Tersimpan</p>
            {prescriptions.map((rx) => (
              <div key={rx.id} className="p-3 border rounded-lg text-sm space-y-1 bg-muted/10">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-foreground/50">{new Date(rx.prescription_date).toLocaleString("id-ID")}</span>
                  <Badge variant="outline">{rx.status}</Badge>
                </div>
                {rx.prescription_items.map((item) => (
                  <p key={item.id} className="text-sm">
                    {item.medications.name} — {item.dosage} · {item.frequency} · {item.duration_days}h · qty {item.quantity}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* New prescription */}
        <form onSubmit={handleSubmitRx} className="space-y-4">
          {rxError && <Alert variant="destructive"><AlertDescription>{rxError}</AlertDescription></Alert>}

          <div className="relative">
            <Input
              value={medSearch}
              onChange={(e) => setMedSearch(e.target.value)}
              placeholder="Cari obat (min 2 karakter)..."
            />
            {(medSearching || medResults.length > 0) && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-background border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {medSearching && (
                  <div className="flex items-center gap-2 p-3 text-sm text-foreground/60">
                    <Loader2 className="w-4 h-4 animate-spin" /> Mencari...
                  </div>
                )}
                {medResults.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                    onClick={() => handleAddMed(m)}
                  >
                    <span className="font-medium">{m.name}</span>
                    {m.strength && <span className="text-foreground/50 ml-1 text-xs">{m.strength}</span>}
                    <span className="float-right text-xs text-foreground/40">Stok: {m.stock_available}</span>
                  </button>
                ))}
                {!medSearching && medResults.length === 0 && medSearch.length >= 2 && (
                  <p className="p-3 text-sm text-foreground/50">Obat tidak ditemukan.</p>
                )}
              </div>
            )}
          </div>

          {rxItems.length > 0 && (
            <div className="space-y-3">
              {rxItems.map((item, idx) => (
                <div key={item.medication_id} className="p-3 border rounded-lg space-y-3 bg-green-50/30 dark:bg-green-950/10">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{item.medication_name}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setRxItems((p) => p.filter((_, i) => i !== idx))}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Dosis *</Label>
                      <Input placeholder="mis. 500mg" value={item.dosage} onChange={(e) => updateRxItem(idx, "dosage", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Frekuensi</Label>
                      <Select value={item.frequency} onValueChange={(v) => updateRxItem(idx, "frequency", v)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Durasi (hari)</Label>
                      <Input type="number" min={1} value={item.duration_days} onChange={(e) => updateRxItem(idx, "duration_days", Number(e.target.value))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <Input type="number" min={1} value={item.quantity} onChange={(e) => updateRxItem(idx, "quantity", Number(e.target.value))} />
                    </div>
                  </div>
                </div>
              ))}
              <Button type="submit" disabled={rxSaving} className="w-full bg-green-600 hover:bg-green-700">
                {rxSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan...</> : <><Plus className="w-4 h-4 mr-2" /> Simpan Resep</>}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
