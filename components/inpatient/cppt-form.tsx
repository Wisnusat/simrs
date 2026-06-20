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
import { Loader2, Clock, User, Heart, Activity, Thermometer } from "lucide-react"
import type { ClinicalNote, InpatientShift, VitalSigns as VitalSignsType } from "@/lib/types/outpatient"

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
  vitalSigns?: VitalSignsType[]
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

// SOAPIE field config — nursing standard (SNARS)
const SOAPIE_FIELDS = [
  {
    key: "subjective",
    label: "S — Subjektif (Keluhan Pasien)",
    placeholder: "Keluhan yang disampaikan pasien secara langsung, misal: 'Pasien mengeluh nyeri perut skala 6'...",
  },
  {
    key: "objective",
    label: "O — Objektif (Data Observasi & Tanda Vital)",
    placeholder: "Hasil observasi perawat: TTV, kondisi luka, output cairan, saturasi, dsb...",
  },
  {
    key: "assessment",
    label: "A — Analisis Diagnosis Keperawatan",
    placeholder: "Diagnosis keperawatan berdasarkan SDKI, misal: 'Nyeri Akut b.d agen pencedera fisiologis'...",
  },
  {
    key: "plan",
    label: "P/I/E — Rencana, Implementasi & Evaluasi",
    placeholder: "Rencana tindakan (SLKI/SIKI), implementasi yang sudah dilakukan, dan evaluasi respon pasien...",
  },
] as const

export function CpptForm({
  encounterId,
  patientId,
  onSubmit,
  onCreateShift,
  loading,
  error,
  previousNotes,
  todayShiftExists,
  vitalSigns = [],
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

      {/* CPPT SOAPIE Form */}
      {encounterId && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Catatan CPPT Keperawatan (SOAPIE)</h4>
            <Badge variant="outline" className="text-xs">Standar SNARS / SDKI-SLKI-SIKI</Badge>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {SOAPIE_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label
                htmlFor={`cppt-${field.key}`}
                className="text-xs font-semibold uppercase tracking-wide text-foreground/70"
              >
                {field.label}
              </Label>
              <Textarea
                id={`cppt-${field.key}`}
                rows={field.key === "plan" ? 4 : 2}
                value={soap[field.key]}
                onChange={(e) => setSoap((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
              />
            </div>
          ))}

          <Button
            type="submit"
            disabled={loading || (!soap.subjective && !soap.objective)}
            className="w-full"
          >
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : "Simpan CPPT Keperawatan"}
          </Button>
        </form>
      )}

      {/* Vital Signs History */}
      {vitalSigns?.length > 0 && (
        <div className="space-y-3">
          <Separator />
          <h4 className="font-semibold text-sm">Riwayat Tanda Vital (Shift Ini)</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {vitalSigns.map((vs) => (
              <div key={vs.id} className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 rounded-lg border bg-blue-50/40 dark:bg-blue-950/20 text-sm">
                <div className="col-span-2 md:col-span-4 flex items-center gap-1 text-xs text-foreground/50 mb-1">
                  <Clock className="w-3 h-3" />
                  {new Date(vs.recorded_at).toLocaleString("id-ID", {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </div>
                {vs.systolic_bp && (
                  <div className="flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span className="text-foreground/60 text-xs">TD:</span>
                    <span className="font-medium text-xs">{vs.systolic_bp}/{vs.diastolic_bp}</span>
                  </div>
                )}
                {vs.heart_rate && (
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                    <span className="text-foreground/60 text-xs">Nadi:</span>
                    <span className="font-medium text-xs">{vs.heart_rate} bpm</span>
                  </div>
                )}
                {vs.temperature && (
                  <div className="flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    <span className="text-foreground/60 text-xs">Suhu:</span>
                    <span className="font-medium text-xs">{vs.temperature}°C</span>
                  </div>
                )}
                {vs.oxygen_saturation && (
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="text-foreground/60 text-xs">SpO₂:</span>
                    <span className="font-medium text-xs">{vs.oxygen_saturation}%</span>
                  </div>
                )}
                {vs.pain_scale != null && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground/60 text-xs">Nyeri:</span>
                    <span className="font-medium text-xs">{vs.pain_scale}/10</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Previous CPPT Timeline */}
      {previousNotes.length > 0 && (
        <div className="space-y-3">
          <Separator />
          <h4 className="font-semibold text-sm">Riwayat CPPT (Semua Profesi)</h4>
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {previousNotes.map((note) => {
              const roleLabel =
                note.writer_role === "doctor" ? "Dokter" :
                  note.writer_role === "nurse" ? "Perawat" :
                    note.writer_role === "nutritionist" ? "Ahli Gizi" :
                      note.writer_role === "pharmacist" ? "Apoteker" :
                        note.writer_role ?? "—"

              const roleColor =
                note.writer_role === "doctor" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                  note.writer_role === "nurse" ? "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" :
                    note.writer_role === "nutritionist" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                      "bg-muted text-foreground/60"

              return (
                <div key={note.id} className="p-3 rounded-lg border bg-muted/20 text-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-foreground/40" />
                      <span className="font-medium">{note.practitioners?.full_name ?? "—"}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleColor}`}>
                        {roleLabel}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-foreground/40">
                      <Clock className="w-3 h-3" />
                      {new Date(note.note_date).toLocaleString("id-ID", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {note.subjective && <p><span className="font-semibold text-foreground/60 text-xs">S:</span> {note.subjective}</p>}
                  {note.objective && <p><span className="font-semibold text-foreground/60 text-xs">O:</span> {note.objective}</p>}
                  {note.assessment && <p><span className="font-semibold text-foreground/60 text-xs">A:</span> {note.assessment}</p>}
                  {note.plan && <p><span className="font-semibold text-foreground/60 text-xs">P/I/E:</span> {note.plan}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
