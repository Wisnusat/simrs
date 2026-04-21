/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import type { AllergyCategory, AllergyCriticality } from "@/lib/types/outpatient"

interface AllergyFormProps {
  patientId: string
  onSubmit: (input: {
    patient_id: string
    substance_display: string
    substance_code?: string
    category: AllergyCategory
    criticality: AllergyCriticality
    reaction_description?: string
  }) => Promise<boolean>
  loading: boolean
  error: string | null
}

export function AllergyForm({ patientId, onSubmit, loading, error }: AllergyFormProps) {
  const [form, setForm] = useState({
    substance_display: "",
    substance_code: "",
    category: "medication" as AllergyCategory,
    criticality: "low" as AllergyCriticality,
    reaction_description: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.substance_display.trim()) return
    const ok = await onSubmit({
      patient_id: patientId,
      ...form,
    })
    if (ok) {
      setForm({ substance_display: "", substance_code: "", category: "medication", criticality: "low", reaction_description: "" })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Substansi Alergen *</Label>
          <Input
            value={form.substance_display}
            onChange={(e) => setForm((p) => ({ ...p, substance_display: e.target.value }))}
            placeholder="mis. Amoxicillin, Udang, Debu"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Kode (opsional)</Label>
          <Input
            value={form.substance_code}
            onChange={(e) => setForm((p) => ({ ...p, substance_code: e.target.value }))}
            placeholder="Kode SNOMED/ICD"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Kategori</Label>
          <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v as AllergyCategory }))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="medication">Obat</SelectItem>
              <SelectItem value="food">Makanan</SelectItem>
              <SelectItem value="environment">Lingkungan</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tingkat Keparahan</Label>
          <Select value={form.criticality} onValueChange={(v) => setForm((p) => ({ ...p, criticality: v as AllergyCriticality }))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Rendah</SelectItem>
              <SelectItem value="high">Tinggi</SelectItem>
              <SelectItem value="unable-to-assess">Tidak Dapat Dinilai</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Deskripsi Reaksi</Label>
        <Textarea
          rows={2}
          value={form.reaction_description}
          onChange={(e) => setForm((p) => ({ ...p, reaction_description: e.target.value }))}
          placeholder="Deskripsi reaksi alergi yang terjadi..."
        />
      </div>

      <Button type="submit" disabled={loading || !form.substance_display.trim()} className="w-full">
        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : "Simpan Alergi"}
      </Button>
    </form>
  )
}
