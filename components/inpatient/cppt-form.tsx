/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Clock, User } from "lucide-react"
import type { ClinicalNote, InpatientShift } from "@/lib/types/outpatient"

interface CpptFormProps {
  encounterId: string | null
  patientId: string
  onSubmit: (input: {
    encounter_id: string
    patient_id: string
    subjective: string
    objective: string
    assessment: string
    plan: string
  }) => Promise<boolean>
  onCreateShift: (shift?: InpatientShift) => Promise<string | null>
  loading: boolean
  error: string | null
  previousNotes: ClinicalNote[]
  todayShiftExists: boolean
}

const SHIFT_LABELS: Record<InpatientShift, string> = {
  pagi: "Pagi (07:00–14:00)",
  sore: "Sore (14:00–21:00)",
  malam: "Malam (21:00–07:00)",
}

function getCurrentShift(): InpatientShift {
  const hour = new Date().getHours()
  if (hour >= 7 && hour < 14) return "pagi"
  if (hour >= 14 && hour < 21) return "sore"
  return "malam"
}

export function CpptForm({
  encounterId,
  patientId,
  onSubmit,
  onCreateShift,
  loading,
  error,
  previousNotes,
  todayShiftExists,
}: CpptFormProps) {
  const [soap, setSoap] = useState({
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
  })
  const [selectedShift, setSelectedShift] = useState<InpatientShift>(getCurrentShift())
  const [creatingShift, setCreatingShift] = useState(false)

  const handleCreateShift = async () => {
    setCreatingShift(true)
    await onCreateShift(selectedShift)
    setCreatingShift(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!encounterId) return
    const ok = await onSubmit({
      encounter_id: encounterId,
      patient_id: patientId,
      ...soap,
    })
    if (ok) {
      setSoap({ subjective: "", objective: "", assessment: "", plan: "" })
    }
  }

  return (
    <div className="space-y-6">
      {/* Create shift encounter if needed */}
      {!encounterId && !todayShiftExists && (
        <div className="p-4 rounded-lg border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
          <p className="text-sm font-medium">Mulai Catatan Shift</p>
          <p className="text-xs text-foreground/60">
            Buat encounter baru untuk shift saat ini agar bisa mencatat CPPT, tanda vital, dan tindakan.
          </p>
          <div className="flex items-center gap-3">
            <Select value={selectedShift} onValueChange={(v) => setSelectedShift(v as InpatientShift)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["pagi", "sore", "malam"] as InpatientShift[]).map((s) => (
                  <SelectItem key={s} value={s}>{SHIFT_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleCreateShift} disabled={creatingShift} size="sm">
              {creatingShift ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Mulai Shift
            </Button>
          </div>
        </div>
      )}

      {/* CPPT SOAP Form */}
      {encounterId && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <h4 className="font-semibold text-sm">Catatan CPPT (SOAP)</h4>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {(["subjective", "objective", "assessment", "plan"] as const).map((field) => (
            <div key={field} className="space-y-1">
              <Label htmlFor={`cppt-${field}`} className="text-xs font-medium uppercase tracking-wide text-foreground/60">
                {field === "subjective" ? "S — Keluhan / Kondisi Pasien"
                  : field === "objective" ? "O — Pemeriksaan / Observasi"
                  : field === "assessment" ? "A — Penilaian Klinis"
                  : "P — Rencana Tindakan"}
              </Label>
              <Textarea
                id={`cppt-${field}`}
                rows={2}
                value={soap[field]}
                onChange={(e) => setSoap((prev) => ({ ...prev, [field]: e.target.value }))}
                placeholder={
                  field === "subjective" ? "Keluhan yang disampaikan pasien..."
                  : field === "objective" ? "Hasil observasi / pemeriksaan fisik..."
                  : field === "assessment" ? "Penilaian klinis perawat..."
                  : "Rencana perawatan selanjutnya..."
                }
              />
            </div>
          ))}

          <Button type="submit" disabled={loading || (!soap.subjective && !soap.objective)} className="w-full">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : "Simpan CPPT"}
          </Button>
        </form>
      )}

      {/* Previous CPPT Timeline */}
      {previousNotes.length > 0 && (
        <div className="space-y-3">
          <Separator />
          <h4 className="font-semibold text-sm">Riwayat CPPT</h4>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {previousNotes.map((note) => (
              <div key={note.id} className="p-3 rounded-lg border bg-muted/20 text-sm space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-foreground/40" />
                    <span className="font-medium">{note.practitioners?.full_name ?? "—"}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {note.writer_role === "doctor" ? "Dokter"
                        : note.writer_role === "nurse" ? "Perawat"
                        : note.writer_role === "nutritionist" ? "Ahli Gizi"
                        : note.writer_role}
                    </Badge>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-foreground/40">
                    <Clock className="w-3 h-3" />
                    {new Date(note.note_date).toLocaleString("id-ID", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
                {note.subjective && <p><span className="font-semibold text-foreground/60">S:</span> {note.subjective}</p>}
                {note.objective && <p><span className="font-semibold text-foreground/60">O:</span> {note.objective}</p>}
                {note.assessment && <p><span className="font-semibold text-foreground/60">A:</span> {note.assessment}</p>}
                {note.plan && <p><span className="font-semibold text-foreground/60">P:</span> {note.plan}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
