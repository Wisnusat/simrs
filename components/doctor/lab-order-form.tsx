/**
 * components/doctor/lab-order-form.tsx
 * Form for ordering lab tests. Extracted from the inline dialog in doctor/page.tsx.
 */
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Loader2 } from "lucide-react"
import type { LabOrderInput, LabService } from "@/lib/types/outpatient"
import { getLabServices } from "@/lib/api/client"

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

  const [services, setServices] = useState<LabService[]>([])
  const [loadingServices, setLoadingServices] = useState(true)

  useEffect(() => {
    getLabServices()
      .then(setServices)
      .catch(() => {})
      .finally(() => setLoadingServices(false))
  }, [])

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
              {idx === 0 && <Label>Pilih Pemeriksaan</Label>}
              {loadingServices ? (
                <div className="h-10 flex items-center gap-2 text-sm text-foreground/50 border rounded-md px-3 bg-muted/50">
                  <Loader2 className="w-4 h-4 animate-spin" /> Memuat...
                </div>
              ) : (
                <Select
                  value={item.test_name ? `${item.test_name}|${item.loinc_code}` : ""}
                  onValueChange={(val) => {
                    const [name, code] = val.split("|")
                    setItem(idx, "test_name", name)
                    setItem(idx, "loinc_code", code || "")
                  }}
                >
                  <SelectTrigger className="w-full h-10">
                    <SelectValue placeholder="Pilih layanan lab" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((svc) => (
                      <SelectItem key={svc.id} value={`${svc.name}|${svc.loinc_code || ""}`}>
                        {svc.name} {svc.loinc_code ? `(${svc.loinc_code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              {idx === 0 && <Label>Kode LOINC</Label>}
              <Input
                value={item.loinc_code}
                readOnly
                className="bg-muted text-foreground/70"
                placeholder="Otomatis"
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
