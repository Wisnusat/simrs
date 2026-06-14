/**
 * components/nurse/vital-signs-form.tsx
 *
 * Form component for recording vital signs.
 * Receives encounterId + patientId + callbacks. No fetch calls inside.
 */
"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Activity, Heart, Ruler, Thermometer, Weight, MessageSquare, ShieldAlert } from "lucide-react"
import type { VitalSignsInput, AllergyCategory, AllergyCriticality } from "@/lib/types/outpatient"

interface VitalSignsFormProps {
  encounterId: string
  patientId: string
  queueId?: string
  patientName: string
  queueNumber?: string
  onSubmit: (
    input: VitalSignsInput,
    allergyInput?: {
      patient_id: string
      substance_display: string
      substance_code?: string
      category: AllergyCategory
      criticality: AllergyCriticality
      reaction_description?: string
    }
  ) => Promise<boolean>
  onCancel: () => void
  loading: boolean
  error: string | null
}

type FormState = {
  systolic_bp: string
  diastolic_bp: string
  heart_rate: string
  respiratory_rate: string
  temperature: string
  oxygen_saturation: string
  weight_kg: string
  height_cm: string
  notes: string
}

const EMPTY: FormState = {
  systolic_bp: "", diastolic_bp: "", heart_rate: "",
  respiratory_rate: "", temperature: "", oxygen_saturation: "",
  weight_kg: "", height_cm: "", notes: "",
}

function num(v: string) { return v ? Number(v) : undefined }

export function VitalSignsForm({
  encounterId,
  patientId,
  queueId,
  patientName,
  queueNumber,
  onSubmit,
  onCancel,
  loading,
  error,
}: VitalSignsFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [localError, setLocalError] = useState("")

  const [hasAllergy, setHasAllergy] = useState(false)
  const [allergyForm, setAllergyForm] = useState({
    substance_display: "",
    substance_code: "",
    category: "medication" as AllergyCategory,
    criticality: "low" as AllergyCriticality,
    reaction_description: "",
  })

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError("")
    if (!form.systolic_bp || !form.heart_rate || !form.temperature) {
      setLocalError("Tekanan sistolik, detak jantung, dan suhu wajib diisi")
      return
    }
    if (hasAllergy && !allergyForm.substance_display.trim()) {
      setLocalError("Nama bahan alergen wajib diisi jika mencatat alergi")
      return
    }

    const ok = await onSubmit({
      encounter_id: encounterId,
      patient_id: patientId,
      queue_id: queueId,
      systolic_bp: num(form.systolic_bp),
      diastolic_bp: num(form.diastolic_bp),
      heart_rate: num(form.heart_rate),
      respiratory_rate: num(form.respiratory_rate),
      temperature: num(form.temperature),
      oxygen_saturation: num(form.oxygen_saturation),
      weight_kg: num(form.weight_kg),
      height_cm: num(form.height_cm),
      notes: form.notes || undefined,
    }, hasAllergy && allergyForm.substance_display.trim() ? {
      patient_id: patientId,
      substance_display: allergyForm.substance_display,
      substance_code: allergyForm.substance_code || undefined,
      category: allergyForm.category,
      criticality: allergyForm.criticality,
      reaction_description: allergyForm.reaction_description || undefined,
    } : undefined)

    if (ok) {
      setForm(EMPTY)
      setHasAllergy(false)
      setAllergyForm({
        substance_display: "",
        substance_code: "",
        category: "medication",
        criticality: "low",
        reaction_description: "",
      })
    }
  }

  const displayError = localError || error

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-sm text-foreground/60 mb-2">
        <span className="font-medium text-foreground">{patientName}</span>
        {queueNumber && <span className="ml-2 text-foreground/50">Antrian #{queueNumber}</span>}
      </div>

      {displayError && (
        <Alert variant="destructive">
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="systolic_bp">
            <Heart className="w-3.5 h-3.5 inline mr-1" />
            Tekanan Sistolik (mmHg) <span className="text-red-500">*</span>
          </Label>
          <Input id="systolic_bp" type="number" value={form.systolic_bp} onChange={set("systolic_bp")} placeholder="120" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="diastolic_bp">
            <Heart className="w-3.5 h-3.5 inline mr-1" />
            Tekanan Diastolik (mmHg)
          </Label>
          <Input id="diastolic_bp" type="number" value={form.diastolic_bp} onChange={set("diastolic_bp")} placeholder="80" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="heart_rate">
            <Activity className="w-3.5 h-3.5 inline mr-1" />
            Detak Jantung (bpm) <span className="text-red-500">*</span>
          </Label>
          <Input id="heart_rate" type="number" value={form.heart_rate} onChange={set("heart_rate")} placeholder="80" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="temperature">
            <Thermometer className="w-3.5 h-3.5 inline mr-1" />
            Suhu (°C) <span className="text-red-500">*</span>
          </Label>
          <Input id="temperature" type="number" step="0.1" value={form.temperature} onChange={set("temperature")} placeholder="36.5" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="respiratory_rate">Pernapasan (/menit)</Label>
          <Input id="respiratory_rate" type="number" value={form.respiratory_rate} onChange={set("respiratory_rate")} placeholder="20" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="oxygen_saturation">SpO₂ (%)</Label>
          <Input id="oxygen_saturation" type="number" value={form.oxygen_saturation} onChange={set("oxygen_saturation")} placeholder="98" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="weight_kg">
            <Weight className="w-3.5 h-3.5 inline mr-1" />
            Berat Badan (kg)
          </Label>
          <Input id="weight_kg" type="number" step="0.1" value={form.weight_kg} onChange={set("weight_kg")} placeholder="65" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="height_cm">
            <Ruler className="w-3.5 h-3.5 inline mr-1" />
            Tinggi Badan (cm)
          </Label>
          <Input id="height_cm" type="number" value={form.height_cm} onChange={set("height_cm")} placeholder="170" />
        </div>
        <div className="col-span-1 sm:col-span-2 space-y-1.5 mt-2">
          <Label htmlFor="notes">
            <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
            Keluhan / Catatan
          </Label>
          <Textarea 
            id="notes" 
            value={form.notes} 
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} 
            placeholder="Tuliskan keluhan atau gejala yang dirasakan pasien..." 
            rows={2}
          />
        </div>
      </div>

      <div className="border-t border-muted/50 pt-4 mt-2">
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="hasAllergy" 
            checked={hasAllergy} 
            onCheckedChange={(checked) => setHasAllergy(!!checked)} 
          />
          <Label htmlFor="hasAllergy" className="text-sm font-semibold text-foreground cursor-pointer flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            Catat Alergi Pasien Baru
          </Label>
        </div>

        {hasAllergy && (
          <div className="mt-4 p-4 border rounded-lg bg-red-50/20 dark:bg-red-950/5 border-red-200/50 space-y-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="allergy_substance">Substansi Alergen *</Label>
                <Input
                  id="allergy_substance"
                  value={allergyForm.substance_display}
                  onChange={(e) => setAllergyForm((p) => ({ ...p, substance_display: e.target.value }))}
                  placeholder="mis. Amoxicillin, Udang, Debu"
                  required={hasAllergy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="allergy_code">Kode (opsional)</Label>
                <Input
                  id="allergy_code"
                  value={allergyForm.substance_code}
                  onChange={(e) => setAllergyForm((p) => ({ ...p, substance_code: e.target.value }))}
                  placeholder="Kode SNOMED/ICD"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select 
                  value={allergyForm.category} 
                  onValueChange={(v) => setAllergyForm((p) => ({ ...p, category: v as AllergyCategory }))}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medication">Obat</SelectItem>
                    <SelectItem value="food">Makanan</SelectItem>
                    <SelectItem value="environment">Lingkungan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tingkat Keparahan</Label>
                <Select 
                  value={allergyForm.criticality} 
                  onValueChange={(v) => setAllergyForm((p) => ({ ...p, criticality: v as AllergyCriticality }))}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Rendah</SelectItem>
                    <SelectItem value="high">Tinggi</SelectItem>
                    <SelectItem value="unable-to-assess">Tidak Dapat Dinilai</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="allergy_reaction">Deskripsi Reaksi</Label>
              <Textarea
                id="allergy_reaction"
                rows={2}
                value={allergyForm.reaction_description}
                onChange={(e) => setAllergyForm((p) => ({ ...p, reaction_description: e.target.value }))}
                placeholder="Deskripsi reaksi alergi yang terjadi..."
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
          Batal
        </Button>
        <Button type="submit" className="flex-1 bg-pink-600 hover:bg-pink-700" disabled={loading}>
          {loading ? "Menyimpan..." : "Simpan Tanda Vital"}
        </Button>
      </div>
    </form>
  )
}
