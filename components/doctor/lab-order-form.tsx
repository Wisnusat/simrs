/**
 * components/doctor/lab-order-form.tsx
 * Form for ordering lab tests. Extracted from the inline dialog in doctor/page.tsx.
 */
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Trash2 } from "lucide-react"
import type { LabOrderInput } from "@/lib/types/outpatient"

interface LabItem {
  test_name: string
  loinc_code: string
}

interface LabOrderFormProps {
  encounterId: string
  patientId: string
  onSubmit: (input: LabOrderInput) => Promise<boolean>
  onCancel: () => void
  loading: boolean
  error: string | null
}

export function LabOrderForm({
  encounterId,
  patientId,
  onSubmit,
  onCancel,
  loading,
  error,
}: LabOrderFormProps) {
  const [items, setItems] = useState<LabItem[]>([{ test_name: "", loinc_code: "" }])
  const [localError, setLocalError] = useState("")

  const setItem = (index: number, field: keyof LabItem, value: string) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
  }

  const addItem = () => setItems((prev) => [...prev, { test_name: "", loinc_code: "" }])
  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError("")
    const valid = items.filter((i) => i.test_name.trim())
    if (valid.length === 0) {
      setLocalError("Tambahkan minimal satu pemeriksaan")
      return
    }
    const ok = await onSubmit({ encounter_id: encounterId, patient_id: patientId, items: valid })
    if (ok) setItems([{ test_name: "", loinc_code: "" }])
  }

  const displayError = localError || error

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {displayError && (
        <Alert variant="destructive">
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              {idx === 0 && <Label>Nama Pemeriksaan</Label>}
              <Input
                value={item.test_name}
                onChange={(e) => setItem(idx, "test_name", e.target.value)}
                placeholder="Contoh: Darah Lengkap"
              />
            </div>
            <div className="space-y-1.5">
              {idx === 0 && <Label>Kode LOINC</Label>}
              <Input
                value={item.loinc_code}
                onChange={(e) => setItem(idx, "loinc_code", e.target.value)}
                placeholder="Contoh: 58410-2"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeItem(idx)}
              disabled={items.length === 1}
              className="h-10"
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addItem}>
        <Plus className="w-4 h-4 mr-1" />
        Tambah Pemeriksaan
      </Button>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
          Batal
        </Button>
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={loading}>
          {loading ? "Menyimpan..." : "Kirim Permintaan Lab"}
        </Button>
      </div>
    </form>
  )
}
