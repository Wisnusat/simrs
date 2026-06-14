"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, AlertTriangle, ShieldAlert } from "lucide-react"
import type { EmergencyEncounter, TriageCategory, AllergyCategory, AllergyCriticality } from "@/lib/types/outpatient"
import { useEmergency } from "@/hooks/emergency/use-emergency"
import { postAllergy } from "@/lib/api/client"

interface EmergencyTriageFormProps {
  encounter: EmergencyEncounter
  onSuccess: () => void
}

export function EmergencyTriageForm({ encounter, onSuccess }: EmergencyTriageFormProps) {
  const [triageCategory, setTriageCategory] = useState<string>(encounter.triage_category || "")
  const [triageComplaint, setTriageComplaint] = useState(encounter.triage_complaint || "")
  const [isCritical, setIsCritical] = useState(encounter.is_critical)

  const [vitals, setVitals] = useState({ systolic_bp: "", heart_rate: "", temperature: "", oxygen_saturation: "" })

  const [hasAllergy, setHasAllergy] = useState(false)
  const [allergyForm, setAllergyForm] = useState({
    substance_display: "",
    substance_code: "",
    category: "medication" as AllergyCategory,
    criticality: "low" as AllergyCriticality,
    reaction_description: "",
  })

  const { triage, actionLoading } = useEmergency()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (hasAllergy && !allergyForm.substance_display.trim()) return

    const result = await triage(encounter.id, {
      triage_category: triageCategory,
      triage_complaint: triageComplaint,
      is_critical: isCritical,
      systolic_bp: vitals.systolic_bp ? Number(vitals.systolic_bp) : undefined,
      heart_rate: vitals.heart_rate ? Number(vitals.heart_rate) : undefined,
      temperature: vitals.temperature ? Number(vitals.temperature) : undefined,
      oxygen_saturation: vitals.oxygen_saturation ? Number(vitals.oxygen_saturation) : undefined,
    })
    if (!result) return

    if (hasAllergy && allergyForm.substance_display.trim()) {
      try {
        await postAllergy({
          patient_id: encounter.patient_id,
          encounter_id: encounter.encounter_id,
          substance_display: allergyForm.substance_display,
          substance_code: allergyForm.substance_code || undefined,
          category: allergyForm.category,
          criticality: allergyForm.criticality,
          reaction_description: allergyForm.reaction_description || undefined,
        })
      } catch {
        // allergy save failure does not block triage completion
      }
    }

    onSuccess()
  }

  const getTriageColor = (cat: string) => {
    switch (cat) {
      case "P1": return "text-red-600 bg-red-100 dark:bg-red-900/30 border-red-200"
      case "P2": return "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200"
      case "P3": return "text-green-600 bg-green-100 dark:bg-green-900/30 border-green-200"
      case "P4": return "text-slate-800 bg-slate-200 dark:bg-slate-800 border-slate-300"
      default: return "border-border"
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b">
        <AlertTriangle className="w-5 h-5 text-orange-500" />
        <h3 className="font-semibold text-lg">Asesmen Triage</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Kategori Triage *</Label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "P1", label: "P1 (Merah) - Gawat Darurat" },
              { id: "P2", label: "P2 (Kuning) - Darurat Tidak Gawat" },
              { id: "P3", label: "P3 (Hijau) - Tidak Darurat" },
              { id: "P4", label: "P4 (Hitam) - Meninggal / Exiting" },
            ].map((tc) => (
              <label
                key={tc.id}
                className={`flex flex-col p-3 border rounded-lg cursor-pointer transition-all ${
                  triageCategory === tc.id ? "ring-2 ring-blue-500 " + getTriageColor(tc.id) : "hover:bg-muted"
                }`}
              >
                <input
                  type="radio"
                  name="triage"
                  value={tc.id}
                  checked={triageCategory === tc.id}
                  onChange={() => setTriageCategory(tc.id)}
                  className="sr-only"
                />
                <span className="font-bold">{tc.id}</span>
                <span className="text-xs opacity-80">{tc.label.split(" - ")[1]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Keluhan Utama *</Label>
            <Textarea
              rows={3}
              value={triageComplaint}
              onChange={(e) => setTriageComplaint(e.target.value)}
              placeholder="Jelaskan keluhan utama pasien saat tiba..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Penilaian Kondisi</Label>
            <Select
              value={isCritical ? "true" : "false"}
              onValueChange={(v) => setIsCritical(v === "true")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Stabil / Tidak Kritis</SelectItem>
                <SelectItem value="true">Gawat Darurat / Kritis</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Vital Signs */}
      <div className="border-t border-muted/50 pt-4">
        <Label className="text-sm font-semibold mb-3 block">Tanda Vital (opsional)</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: "systolic_bp",       label: "TD Sistolik",  unit: "mmHg", placeholder: "120" },
            { key: "heart_rate",        label: "Nadi",         unit: "x/mnt", placeholder: "80" },
            { key: "temperature",       label: "Suhu",         unit: "°C",   placeholder: "36.5" },
            { key: "oxygen_saturation", label: "SpO₂",         unit: "%",    placeholder: "98" },
          ].map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs text-foreground/60">{f.label} <span className="text-foreground/40">({f.unit})</span></Label>
              <Input
                type="number"
                value={vitals[f.key as keyof typeof vitals]}
                onChange={(e) => setVitals((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Allergy Section */}
      <div className="border-t border-muted/50 pt-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="hasAllergy"
            checked={hasAllergy}
            onCheckedChange={(checked) => setHasAllergy(!!checked)}
          />
          <Label htmlFor="hasAllergy" className="text-sm font-semibold cursor-pointer flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            Catat Alergi Pasien
          </Label>
        </div>

        {hasAllergy && (
          <div className="mt-4 p-4 border rounded-lg bg-red-50/20 dark:bg-red-950/5 border-red-200/50 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Substansi Alergen *</Label>
                <Input
                  value={allergyForm.substance_display}
                  onChange={(e) => setAllergyForm((p) => ({ ...p, substance_display: e.target.value }))}
                  placeholder="mis. Amoxicillin, Udang, Debu"
                  required={hasAllergy}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kode (opsional)</Label>
                <Input
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
              <Label>Deskripsi Reaksi</Label>
              <Textarea
                rows={2}
                value={allergyForm.reaction_description}
                onChange={(e) => setAllergyForm((p) => ({ ...p, reaction_description: e.target.value }))}
                placeholder="Jelaskan reaksi alergi yang muncul..."
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={actionLoading || !triageCategory || !triageComplaint}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {actionLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan...</> : "Simpan Data Triage"}
        </Button>
      </div>
    </form>
  )
}
