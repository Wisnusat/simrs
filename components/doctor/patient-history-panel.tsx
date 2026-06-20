/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState } from "react"
import { usePatientHistory } from "@/hooks/outpatient/use-patient-history"
import VitalSignsChart from "@/components/doctor/vital-signs-chart"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import {
  Stethoscope,
  ChevronDown,
  ChevronRight,
  Loader2,
  Calendar,
  FileText,
  FlaskConical,
  ClipboardList,
  Activity,
  FileIcon,
  TrendingUp,
  User,
} from "lucide-react"
import type { Encounter } from "@/lib/types/outpatient"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PatientHistoryPanelProps {
  patientId: string
  currentEncounterId: string
}

// ---------------------------------------------------------------------------
// Detail tab type
// ---------------------------------------------------------------------------

type DetailTab = "soap" | "lab" | "diagnosis"

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PatientHistoryPanel({
  patientId,
  currentEncounterId,
}: PatientHistoryPanelProps) {
  const {
    encounters,
    isOpen,
    toggleOpen,
    expandedId,
    setExpandedId,
    vitalTrend,
    loading,
    count,
  } = usePatientHistory(patientId, currentEncounterId)

  return (
    <div className="rounded-xl border bg-gradient-to-b from-muted/30 to-transparent overflow-hidden">
      {/* ── Toggle header ── */}
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2.5 text-foreground/70">
          <div className="p-1.5 rounded-lg bg-blue-500/10">
            <Stethoscope className="w-4 h-4 text-blue-500" />
          </div>
          <span>Riwayat Pasien</span>
          {count > 0 && !isOpen && (
            <span className="text-[11px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-semibold">
              {count} kunjungan
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-foreground/40" />
        ) : (
          <ChevronRight className="w-4 h-4 text-foreground/40" />
        )}
      </button>

      {/* ── Content ── */}
      {isOpen && (
        <div className="px-4 pb-4 space-y-4 border-t">
          {/* Loading state */}
          {loading && (
            <div className="flex items-center gap-2 py-6 justify-center text-sm text-foreground/50">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat riwayat pasien...
            </div>
          )}

          {/* Empty state */}
          {!loading && count === 0 && (
            <p className="py-6 text-sm text-foreground/40 text-center">
              Belum ada riwayat kunjungan sebelumnya.
            </p>
          )}

          {/* ── Vital signs chart ── */}
          {!loading && vitalTrend.length >= 2 && (
            <div className="pt-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-foreground/60">
                  Tren Tanda Vital
                </span>
              </div>
              <div className="rounded-lg border bg-background/60 backdrop-blur-sm p-3">
                <VitalSignsChart data={vitalTrend} />
              </div>
            </div>
          )}

          {/* ── Timeline ── */}
          {!loading && count > 0 && (
            <div className="relative pt-1">
              {/* Vertical timeline line */}
              <div className="absolute left-[11px] top-6 bottom-2 w-px bg-gradient-to-b from-blue-300 via-blue-200 to-transparent dark:from-blue-700 dark:via-blue-800" />

              <div className="space-y-0.5">
                {encounters.map((enc, idx) => (
                  <TimelineNode
                    key={enc.id}
                    encounter={enc}
                    isExpanded={expandedId === enc.id}
                    isFirst={idx === 0}
                    onToggle={() =>
                      setExpandedId(expandedId === enc.id ? null : enc.id)
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Timeline Node (single encounter)
// ---------------------------------------------------------------------------

function TimelineNode({
  encounter,
  isExpanded,
  isFirst,
  onToggle,
}: {
  encounter: Encounter
  isExpanded: boolean
  isFirst: boolean
  onToggle: () => void
}) {
  const diagnosis = (encounter as any).diagnoses?.[0]
  const soap = (encounter as any).clinical_notes?.[0]
  const doctorName = soap?.practitioners?.full_name ?? null

  const date = encounter.started_at
    ? new Date(encounter.started_at).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—"

  const poliName = (encounter as any).poli_services?.name ?? "—"

  return (
    <div className="relative pl-7">
      {/* Timeline dot */}
      <div
        className={`
          absolute left-[6px] top-[14px] w-[11px] h-[11px] rounded-full border-2
          transition-colors z-10
          ${isFirst
            ? "border-blue-500 bg-blue-500 shadow-sm shadow-blue-500/30"
            : isExpanded
              ? "border-blue-400 bg-blue-400"
              : "border-foreground/20 bg-background"
          }
        `}
      />

      {/* Card */}
      <div
        className={`
          rounded-lg border overflow-hidden transition-all duration-200
          ${isExpanded
            ? "bg-background shadow-sm border-blue-200 dark:border-blue-800/60"
            : "bg-background/60 hover:bg-muted/30 border-transparent hover:border-foreground/10"
          }
        `}
      >
        {/* Header (always visible) */}
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0">
              <Calendar className="w-3.5 h-3.5 text-foreground/35" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground/80">{date}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-foreground/50 font-medium">
                  {poliName}
                </span>
                {doctorName && (
                  <span className="text-[11px] text-foreground/40 flex items-center gap-1">
                    <User className="w-3 h-3" /> {doctorName}
                  </span>
                )}
              </div>
              <p className="text-xs text-foreground/45 mt-0.5 truncate max-w-md">
                {diagnosis
                  ? `${diagnosis.icd10_code} ${diagnosis.icd10_display}`
                  : soap?.subjective
                    ? soap.subjective.slice(0, 80)
                    : "Tidak ada catatan"}
              </p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-foreground/35 shrink-0 ml-2" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-foreground/35 shrink-0 ml-2" />
          )}
        </button>

        {/* Expanded detail */}
        {isExpanded && <EncounterDetail encounter={encounter} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Encounter Detail (tabs: SOAP, Lab, Diagnosis)
// ---------------------------------------------------------------------------

function EncounterDetail({ encounter }: { encounter: Encounter }) {
  const [tab, setTab] = useState<DetailTab>("soap")

  const clinicalNotes = (encounter as any).clinical_notes ?? []
  const labOrders = (encounter as any).lab_orders ?? []
  const diagnoses = (encounter as any).diagnoses ?? []
  const vitals = encounter.vital_signs?.[0]

  const tabs: { key: DetailTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "soap", label: "SOAP", icon: <FileText className="w-3 h-3" />, count: clinicalNotes.length },
    { key: "lab", label: "Lab", icon: <FlaskConical className="w-3 h-3" />, count: labOrders.flatMap((lo: any) => lo.lab_order_items ?? []).length },
    { key: "diagnosis", label: "Diagnosis", icon: <ClipboardList className="w-3 h-3" />, count: diagnoses.length },
  ]

  return (
    <div className="border-t">
      {/* ── Vital signs mini strip ── */}
      {vitals && (
        <div className="px-3 py-2 bg-blue-50/50 dark:bg-blue-950/20 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          {vitals.systolic_bp && (
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-red-400" />
              <span className="text-foreground/50">TD:</span>
              <span className="font-medium">{vitals.systolic_bp}/{vitals.diastolic_bp}</span>
            </span>
          )}
          {vitals.heart_rate && (
            <span className="flex items-center gap-1">
              <span className="text-foreground/50">Nadi:</span>
              <span className="font-medium">{vitals.heart_rate} bpm</span>
            </span>
          )}
          {vitals.temperature && (
            <span className="flex items-center gap-1">
              <span className="text-foreground/50">Suhu:</span>
              <span className="font-medium">{vitals.temperature}°C</span>
            </span>
          )}
          {vitals.oxygen_saturation && (
            <span className="flex items-center gap-1">
              <span className="text-foreground/50">SpO₂:</span>
              <span className="font-medium">{vitals.oxygen_saturation}%</span>
            </span>
          )}
          {vitals.weight_kg && (
            <span className="flex items-center gap-1">
              <span className="text-foreground/50">BB:</span>
              <span className="font-medium">{vitals.weight_kg} kg</span>
            </span>
          )}
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="flex border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`
              flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-colors
              border-b-2 -mb-px
              ${tab === t.key
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-foreground/40 hover:text-foreground/60"
              }
            `}
          >
            {t.icon}
            {t.label}
            {(t.count ?? 0) > 0 && (
              <span className="text-[9px] bg-muted px-1 py-px rounded font-semibold">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="px-3 py-3 max-h-64 overflow-y-auto">
        {tab === "soap" && <SoapContent notes={clinicalNotes} />}
        {tab === "lab" && <LabContent orders={labOrders} />}
        {tab === "diagnosis" && <DiagnosisContent diagnoses={diagnoses} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SOAP Tab
// ---------------------------------------------------------------------------

function SoapContent({ notes }: { notes: any[] }) {
  if (notes.length === 0) {
    return <p className="text-xs text-foreground/40 italic">Tidak ada catatan SOAP.</p>
  }

  const roleLabel = (role: string) => {
    switch (role) {
      case "doctor": return "Dokter"
      case "nurse": return "Perawat"
      case "nutritionist": return "Ahli Gizi"
      case "pharmacist": return "Apoteker"
      default: return role ?? "—"
    }
  }

  const roleColor = (role: string) => {
    switch (role) {
      case "doctor": return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
      case "nurse": return "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300"
      case "nutritionist": return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
      default: return "bg-muted text-foreground/60"
    }
  }

  return (
    <div className="space-y-2">
      {notes.map((note: any) => (
        <div key={note.id} className="p-3 rounded-lg border bg-muted/20 text-sm space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-foreground/40" />
              <span className="font-medium text-xs">{note.practitioners?.full_name ?? "—"}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleColor(note.writer_role)}`}>
                {roleLabel(note.writer_role)}
              </span>
            </div>
            {note.note_date && (
              <span className="flex items-center gap-1 text-xs text-foreground/40">
                <Calendar className="w-3 h-3" />
                {new Date(note.note_date).toLocaleString("id-ID", {
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </span>
            )}
          </div>
          <div className="space-y-1 text-xs">
            {note.subjective && <p><span className="font-semibold text-foreground/60">S:</span> {note.subjective}</p>}
            {note.objective && <p><span className="font-semibold text-foreground/60">O:</span> {note.objective}</p>}
            {note.assessment && <p><span className="font-semibold text-foreground/60">A:</span> {note.assessment}</p>}
            {note.plan && <p><span className="font-semibold text-foreground/60">P:</span> {note.plan}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lab Tab
// ---------------------------------------------------------------------------

function LabContent({ orders }: { orders: any[] }) {
  const allItems = orders.flatMap((lo: any) => lo.lab_order_items ?? [])
  if (allItems.length === 0) {
    return <p className="text-xs text-foreground/40 italic">Tidak ada hasil lab.</p>
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "normal":
        return { label: "Normal", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" }
      case "abnormal_low":
        return { label: "Rendah", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" }
      case "abnormal_high":
        return { label: "Tinggi", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" }
      case "critical":
        return { label: "Kritis", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" }
      default:
        return { label: "—", className: "bg-muted text-foreground/50" }
    }
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-foreground/40 border-b">
            <th className="text-left py-1.5 px-1 font-medium">Tes</th>
            <th className="text-left py-1.5 px-1 font-medium">Hasil</th>
            <th className="text-left py-1.5 px-1 font-medium">Ref</th>
            <th className="text-left py-1.5 px-1 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {allItems.map((item: any) => {
            const badge = statusBadge(item.result_status)
            const supabase = createClient()
            const fileUrl = item.file_id
              ? supabase.storage.from("lab_result").getPublicUrl(item.file_id).data.publicUrl
              : null

            return (
              <tr key={item.id} className="border-b border-foreground/5 last:border-0">
                <td className="py-1.5 px-1 font-medium text-foreground/70">{item.test_name}</td>
                <td className="py-1.5 px-1 text-foreground/60">
                  {fileUrl ? (
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      <FileIcon className="w-3 h-3" /> Lihat
                    </a>
                  ) : (
                    <span>
                      {item.result_value ?? "—"} {item.result_unit ?? ""}
                    </span>
                  )}
                </td>
                <td className="py-1.5 px-1 text-foreground/40">{item.reference_range ?? "—"}</td>
                <td className="py-1.5 px-1">
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diagnosis Tab
// ---------------------------------------------------------------------------

function DiagnosisContent({ diagnoses }: { diagnoses: any[] }) {
  if (diagnoses.length === 0) {
    return <p className="text-xs text-foreground/40 italic">Tidak ada diagnosis.</p>
  }

  return (
    <div className="space-y-1.5">
      {diagnoses.map((d: any) => (
        <div key={d.id} className="flex items-start gap-2">
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
            {d.icd10_code}
          </span>
          <div className="text-xs">
            <span className="text-foreground/70">{d.icd10_display}</span>
            {d.diagnosis_type && d.diagnosis_type !== "primary" && (
              <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0">
                {d.diagnosis_type === "secondary" ? "Sekunder" : d.diagnosis_type}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
