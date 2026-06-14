"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, UtensilsCrossed } from "lucide-react"
import type { NutritionOrderInput } from "@/lib/types/outpatient"

interface NutritionOrderFormProps {
  episodeOfCareId: string
  patientId: string
  onSubmit: (input: NutritionOrderInput) => Promise<boolean>
  loading: boolean
  error: string | null
  initialData?: {
    meal_plan?: Record<string, string>
    notes?: string
  }
}

const MEALS = [
  { key: "pagi",  label: "Sarapan (Pagi)",   placeholder: "Nasi tim, telur rebus, sayur bayam..." },
  { key: "siang", label: "Makan Siang",       placeholder: "Nasi lunak, ikan kukus, tahu..." },
  { key: "malam", label: "Makan Malam",       placeholder: "Bubur, ayam suwir, sup..." },
  { key: "snack", label: "Snack / Selingan",  placeholder: "Buah, susu, biskuit..." },
] as const

export function NutritionOrderForm({
  episodeOfCareId,
  patientId,
  onSubmit,
  loading,
  error,
  initialData,
}: NutritionOrderFormProps) {
  const [form, setForm] = useState({
    meal_pagi:  initialData?.meal_plan?.pagi  ?? "",
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
      meal_plan: {
        pagi:  form.meal_pagi,
        siang: form.meal_siang,
        malam: form.meal_malam,
        snack: form.meal_snack,
      },
      notes: form.notes || undefined,
    })
    if (ok && !initialData) {
      setForm({ meal_pagi: "", meal_siang: "", meal_malam: "", meal_snack: "", notes: "" })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="space-y-4">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <UtensilsCrossed className="w-4 h-4 text-green-500" /> Rencana Menu Harian
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MEALS.map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-2">
              <Label>{label}</Label>
              <Textarea
                rows={2}
                value={form[`meal_${key}` as keyof typeof form]}
                onChange={(e) => setForm((p) => ({ ...p, [`meal_${key}`]: e.target.value }))}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Catatan</Label>
        <Textarea
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Catatan diet tambahan..."
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700">
        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : "Simpan Rencana Menu"}
      </Button>
    </form>
  )
}
