"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, FileIcon, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { LabOrder, LabResultInput, ResultStatus } from "@/lib/types/outpatient"

interface ResultEntryFormProps {
  order: LabOrder
  onSubmit: (results: LabResultInput[]) => Promise<boolean>
  onCancel: () => void
  loading: boolean
  error: string | null
}

export interface LabParam {
  label: string
  value: string
  unit: string
  reference_range: string
  result_status: ResultStatus
}

function worstStatus(params: LabParam[]): ResultStatus {
  if (params.some((p) => p.result_status === "critical")) return "critical"
  if (params.some((p) => p.result_status === "abnormal_high")) return "abnormal_high"
  if (params.some((p) => p.result_status === "abnormal_low")) return "abnormal_low"
  return "normal"
}

function emptyParam(): LabParam {
  return { label: "", value: "", unit: "", reference_range: "", result_status: "normal" }
}

function parseExisting(raw: string | null | undefined): LabParam[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && "label" in parsed[0]) return parsed as LabParam[]
  } catch {}
  return null
}

export function ResultEntryForm({ order, onSubmit, onCancel, loading, error }: ResultEntryFormProps) {
  const [params, setParams] = useState<Record<string, LabParam[]>>(() => {
    const init: Record<string, LabParam[]> = {}
    for (const item of order.lab_order_items) {
      init[item.id] = parseExisting(item.result_value) ?? [emptyParam()]
    }
    return init
  })

  const [fileIds, setFileIds] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const item of order.lab_order_items) {
      if (item.file_id) init[item.id] = item.file_id
    }
    return init
  })

  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const supabase = createClient()

  const setParam = (itemId: string, idx: number, field: keyof LabParam, value: string) =>
    setParams((prev) => {
      const rows = [...prev[itemId]]
      rows[idx] = { ...rows[idx], [field]: value }
      return { ...prev, [itemId]: rows }
    })

  const addParam = (itemId: string) =>
    setParams((prev) => ({ ...prev, [itemId]: [...prev[itemId], emptyParam()] }))

  const removeParam = (itemId: string, idx: number) =>
    setParams((prev) => {
      const rows = prev[itemId].filter((_, i) => i !== idx)
      return { ...prev, [itemId]: rows.length ? rows : [emptyParam()] }
    })

  const handleFileUpload = async (itemId: string, file: File) => {
    setUploading((prev) => ({ ...prev, [itemId]: true }))
    try {
      const ext = file.name.split(".").pop()
      const fileName = `${itemId}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from("lab_result").upload(fileName, file)
      if (uploadError) throw uploadError
      setFileIds((prev) => ({ ...prev, [itemId]: fileName }))
    } catch (e) {
      alert("Gagal mengupload file. " + (e as any).message)
    } finally {
      setUploading((prev) => ({ ...prev, [itemId]: false }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload: LabResultInput[] = order.lab_order_items.map((item) => {
      const rows = params[item.id] ?? []
      const valid = rows.filter((p) => p.label.trim() || p.value.trim())
      return {
        item_id: item.id,
        result_value: JSON.stringify(valid.length ? valid : rows),
        result_status: worstStatus(rows),
        file_id: fileIds[item.id],
      }
    })
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

            {/* Parameter rows */}
            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1fr_0.7fr_1fr_0.9fr_auto] gap-2 text-xs text-foreground/50 px-1">
                <span>Parameter</span>
                <span>Nilai</span>
                <span>Satuan</span>
                <span>Rujukan</span>
                <span>Status</span>
                <span />
              </div>

              {params[item.id].map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_0.7fr_1fr_0.9fr_auto] gap-2 items-center">
                  <Input
                    placeholder="Nama parameter"
                    value={row.label}
                    onChange={(e) => setParam(item.id, idx, "label", e.target.value)}
                  />
                  <Input
                    placeholder="Nilai"
                    value={row.value}
                    onChange={(e) => setParam(item.id, idx, "value", e.target.value)}
                  />
                  <Input
                    placeholder="Satuan"
                    value={row.unit}
                    onChange={(e) => setParam(item.id, idx, "unit", e.target.value)}
                  />
                  <Input
                    placeholder="Contoh: 12–16"
                    value={row.reference_range}
                    onChange={(e) => setParam(item.id, idx, "reference_range", e.target.value)}
                  />
                  <Select
                    value={row.result_status}
                    onValueChange={(v) => setParam(item.id, idx, "result_status", v)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="abnormal_low">↓ Rendah</SelectItem>
                      <SelectItem value="abnormal_high">↑ Tinggi</SelectItem>
                      <SelectItem value="critical">Kritis</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    disabled={params[item.id].length === 1}
                    onClick={() => removeParam(item.id, idx)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive/70" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => addParam(item.id)}
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Parameter
            </Button>

            {/* File upload */}
            <div className="space-y-1.5">
              <Label className="text-sm">Lampiran File (opsional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  className="text-sm"
                  disabled={uploading[item.id]}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(item.id, file)
                  }}
                />
                {uploading[item.id] && <Loader2 className="w-4 h-4 animate-spin" />}
                {fileIds[item.id] && !uploading[item.id] && (
                  <FileIcon className="w-4 h-4 text-green-500 shrink-0" />
                )}
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
