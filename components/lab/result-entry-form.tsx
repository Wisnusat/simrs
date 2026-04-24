/**
 * components/lab/result-entry-form.tsx
 * Form to enter test results per lab order item.
 */
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UploadCloud, FileIcon, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { LabOrder, LabResultInput, ResultStatus } from "@/lib/types/outpatient"

interface ResultEntryFormProps {
  order: LabOrder
  onSubmit: (results: LabResultInput[]) => Promise<boolean>
  onCancel: () => void
  loading: boolean
  error: string | null
}

type ItemResult = {
  result_value: string
  result_unit: string
  reference_range: string
  result_status: ResultStatus
  file_id?: string
}

export function ResultEntryForm({ order, onSubmit, onCancel, loading, error }: ResultEntryFormProps) {
  const [results, setResults] = useState<Record<string, ItemResult>>(() => {
    const init: Record<string, ItemResult> = {}
    for (const item of order.lab_order_items) {
      init[item.id] = {
        result_value: item.result_value ?? "",
        result_unit: item.result_unit ?? "",
        reference_range: item.reference_range ?? "",
        result_status: (item.result_status as ResultStatus) ?? "normal",
        file_id: item.file_id ?? undefined,
      }
    }
    return init
  })

  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const supabase = createClient()

  const set = (id: string, field: keyof ItemResult, value: string) =>
    setResults((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload: LabResultInput[] = Object.entries(results).map(([item_id, vals]) => ({
      item_id,
      ...vals,
    }))
    await onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Order meta */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <Label>Pasien</Label>
          <p className="font-semibold mt-0.5">{order.patients.full_name}</p>
        </div>
        <div>
          <Label>Dokter Pengirim</Label>
          <p className="font-semibold mt-0.5">{order.doctor.full_name ?? "—"}</p>
        </div>
        {order.clinical_notes && (
          <div className="col-span-2">
            <Label>Catatan Klinis</Label>
            <p className="text-foreground/70 mt-0.5">{order.clinical_notes}</p>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="space-y-4">
        {order.lab_order_items.map((item) => (
          <Card key={item.id} className="p-4 space-y-3">
            <div>
              <p className="font-semibold">{item.test_name}</p>
              {item.loinc_code && (
                <p className="text-xs text-foreground/50">LOINC: {item.loinc_code}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nilai Hasil</Label>
                <Input
                  value={results[item.id]?.result_value ?? ""}
                  onChange={(e) => set(item.id, "result_value", e.target.value)}
                  placeholder="Contoh: 15.2"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Satuan</Label>
                <Input
                  value={results[item.id]?.result_unit ?? ""}
                  onChange={(e) => set(item.id, "result_unit", e.target.value)}
                  placeholder="Contoh: g/dL"
                />
              </div>
              
              <div className="space-y-1.5 col-span-2 md:col-span-1">
                <Label>Unggah File / Gambar Hasil (Opsional)</Label>
                <div className="flex items-center gap-2">
                  <Input 
                    type="file" 
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      
                      try {
                        setUploading(prev => ({ ...prev, [item.id]: true }))
                        const fileExt = file.name.split('.').pop()
                        const fileName = `${item.id}-${Date.now()}.${fileExt}`
                        
                        const { error: uploadError } = await supabase.storage.from('lab_result').upload(fileName, file)
                        if (uploadError) throw uploadError
                        
                        set(item.id, "file_id", fileName)
                      } catch (error) {
                        console.error('Error uploading file:', error)
                        alert('Gagal mengupload file. ' + (error as any).message)
                      } finally {
                        setUploading(prev => ({ ...prev, [item.id]: false }))
                      }
                    }}
                    disabled={uploading[item.id]}
                  />
                  {uploading[item.id] && <Loader2 className="w-5 h-5 animate-spin" />}
                  {results[item.id]?.file_id && !uploading[item.id] && <FileIcon className="w-5 h-5 text-green-500" />}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Nilai Rujukan</Label>
                <Input
                  value={results[item.id]?.reference_range ?? ""}
                  onChange={(e) => set(item.id, "reference_range", e.target.value)}
                  placeholder="Contoh: 12–16 g/dL"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status Hasil</Label>
                <Select
                  value={results[item.id]?.result_status ?? "normal"}
                  onValueChange={(v) => set(item.id, "result_status", v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="abnormal_low">Di Bawah Normal</SelectItem>
                    <SelectItem value="abnormal_high">Di Atas Normal</SelectItem>
                    <SelectItem value="critical">Kritis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
          Batal
        </Button>
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={loading}>
          {loading ? "Menyimpan..." : "Simpan Hasil"}
        </Button>
      </div>
    </form>
  )
}
