/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, UtensilsCrossed } from "lucide-react"
import type { NutritionOrderInput, NutritionalStatus } from "@/lib/types/outpatient"

interface NutritionOrderFormProps {
  episodeOfCareId: string
  patientId: string
  onSubmit: (input: NutritionOrderInput) => Promise<boolean>
  loading: boolean
  error: string | null
  initialData?: {
    nutritional_status?: NutritionalStatus
    dietary_restrictions?: string
    energy_needs_kcal?: number
    protein_needs_g?: number
    meal_plan?: Record<string, string>
    notes?: string
  }
}

export function NutritionOrderForm({
  episodeOfCareId,
  patientId,
  onSubmit,
  loading,
  error,
  initialData,
}: NutritionOrderFormProps) {
  const [form, setForm] = useState({
    nutritional_status: initialData?.nutritional_status ?? ("baik" as NutritionalStatus),
    dietary_restrictions: initialData?.dietary_restrictions ?? "",
    energy_needs_kcal: initialData?.energy_needs_kcal ?? 0,
    protein_needs_g: initialData?.protein_needs_g ?? 0,
    meal_pagi: initialData?.meal_plan?.pagi ?? "",
    meal_siang: initialData?.meal_plan?.siang ?? "",
    meal_malam: initialData?.meal_plan?.malam ?? "",
    meal_snack: initialData?.meal_plan?.snack ?? "",
    notes: initialData?.notes ?? "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await onSubmit({
      episode_of_care_id: episodeOfCareId,
      patient_id: patientId,
      nutritional_status: form.nutritional_status,
      dietary_restrictions: form.dietary_restrictions || undefined,
      energy_needs_kcal: form.energy_needs_kcal || undefined,
      protein_needs_g: form.protein_needs_g || undefined,
      meal_plan: {
        pagi: form.meal_pagi,
        siang: form.meal_siang,
        malam: form.meal_malam,
        snack: form.meal_snack,
      },
      notes: form.notes || undefined,
    })
    if (ok && !initialData) {
      setForm({
        nutritional_status: "baik",
        dietary_restrictions: "",
        energy_needs_kcal: 0,
        protein_needs_g: 0,
        meal_pagi: "",
        meal_siang: "",
        meal_malam: "",
        meal_snack: "",
        notes: "",
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Nutritional assessment */}
      <div className="space-y-4">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <UtensilsCrossed className="w-4 h-4 text-green-500" /> Penilaian Gizi
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Status Gizi</Label>
            <Select value={form.nutritional_status} onValueChange={(v) => setForm((p) => ({ ...p, nutritional_status: v as NutritionalStatus }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baik">Baik</SelectItem>
                <SelectItem value="kurang">Kurang</SelectItem>
                <SelectItem value="lebih">Lebih</SelectItem>
                <SelectItem value="buruk">Buruk</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Kebutuhan Energi (kkal/hari)</Label>
            <Input
              type="number"
              min={0}
              value={form.energy_needs_kcal || ""}
              onChange={(e) => setForm((p) => ({ ...p, energy_needs_kcal: +e.target.value }))}
              placeholder="mis. 1800"
            />
          </div>
          <div className="space-y-2">
            <Label>Kebutuhan Protein (g/hari)</Label>
            <Input
              type="number"
              min={0}
              value={form.protein_needs_g || ""}
              onChange={(e) => setForm((p) => ({ ...p, protein_needs_g: +e.target.value }))}
              placeholder="mis. 60"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Pembatasan Diet / Alergi Makanan</Label>
          <Textarea
            rows={2}
            value={form.dietary_restrictions}
            onChange={(e) => setForm((p) => ({ ...p, dietary_restrictions: e.target.value }))}
            placeholder="mis. Diet rendah garam, diet DM 1700 kkal, tanpa seafood..."
          />
        </div>
      </div>

      <Separator />

      {/* Meal plan */}
      <div className="space-y-4">
        <h4 className="font-semibold text-sm">Rencana Menu Harian</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { key: "meal_pagi", label: "Sarapan (Pagi)", placeholder: "Nasi tim, telur rebus, sayur bayam..." },
            { key: "meal_siang", label: "Makan Siang", placeholder: "Nasi lunak, ikan kukus, tahu..." },
            { key: "meal_malam", label: "Makan Malam", placeholder: "Bubur, ayam suwir, sup..." },
            { key: "meal_snack", label: "Snack / Selingan", placeholder: "Buah, susu, biskuit..." },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-2">
              <Label>{label}</Label>
              <Textarea
                rows={2}
                value={(form as any)[key]}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Catatan Tambahan</Label>
        <Textarea
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Catatan gizi tambahan..."
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700">
        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : "Simpan Order Nutrisi"}
      </Button>
    </form>
  )
}
