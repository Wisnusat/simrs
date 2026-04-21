/**
 * components/nurse/queue-card.tsx
 *
 * Two-stage nurse actions:
 *   1. "Panggil"      — visible when status === "waiting"
 *                       → PATCH queue to "called" + POST /api/encounters
 *                       → fires Web Speech API TTS announcement
 *   2. "Input Vital"  — visible when status === "called" (encounter created, no VS yet)
 *                       → opens the VitalSignsForm dialog
 */
"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/status-badge"
import { Activity, Mic, Plus } from "lucide-react"
import type { QueueEntry } from "@/lib/types/outpatient"

interface QueueCardProps {
  entry: QueueEntry
  /** Nurse clicks "Panggil" — parent handles PATCH queue + POST encounter + TTS */
  onCallPatient: (entry: QueueEntry) => void
  /** Nurse clicks "Input Vital" — parent opens VitalSignsForm */
  onInputVitalSigns: (entry: QueueEntry) => void
  /** True while the call action is in flight */
  calling?: boolean
}

export function QueueCard({
  entry,
  onCallPatient,
  onInputVitalSigns,
  calling = false,
}: QueueCardProps) {
  const isWaiting = entry.status === "waiting"
  const isCalled  = entry.status === "called"
  const canInput  = isCalled && !entry.vital_signs_recorded

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
      {/* Left: queue number + patient info */}
      <div className="flex items-center gap-4">
        <Badge variant="outline" className="text-base px-3 py-1 font-mono shrink-0">
          #{entry.queue_number}
        </Badge>
        <div>
          <p className="font-semibold">{entry.patients.full_name}</p>
          <p className="text-sm text-foreground/60">
            No. MR: {entry.patients.medical_record_no ?? "—"}
          </p>
          {entry.appointments?.chief_complaint && (
            <p className="text-sm text-foreground/60">
              Keluhan: {entry.appointments.chief_complaint}
            </p>
          )}
        </div>
      </div>

      {/* Right: status badge + action buttons */}
      <div className="flex items-center gap-3">
        <StatusBadge
          status={entry.vital_signs_recorded ? "in_service" : entry.status}
        />

        {/* Stage 1 — Panggil (waiting → called + create encounter) */}
        {isWaiting && (
          <Button
            size="sm"
            variant="outline"
            className="border-blue-500 text-blue-600 hover:bg-blue-50"
            onClick={() => onCallPatient(entry)}
            disabled={calling}
          >
            <Mic className="w-4 h-4 mr-1" />
            {calling ? "Memanggil..." : "Panggil"}
          </Button>
        )}

        {/* Stage 2 — Input vital (called, encounter exists) */}
        {canInput && (
          <Button
            size="sm"
            className="bg-pink-600 hover:bg-pink-700"
            onClick={() => onInputVitalSigns(entry)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Input Vital
          </Button>
        )}

        {/* Done state — subtle indicator */}
        {entry.vital_signs_recorded && (
          <Activity className="w-4 h-4 text-green-500" />
        )}
      </div>
    </div>
  )
}
