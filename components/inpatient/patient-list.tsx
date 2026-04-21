/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/status-badge"
import { BedDouble, Calendar, User, Stethoscope } from "lucide-react"
import type { InpatientAdmission } from "@/lib/types/outpatient"

interface PatientListProps {
  admissions: InpatientAdmission[]
  loading: boolean
  onSelect: (admission: InpatientAdmission) => void
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

export function InpatientPatientList({ admissions, loading, onSelect }: PatientListProps) {
  if (loading) {
    return (
      <div className="flex justify-center py-12 text-foreground/50">
        Memuat data pasien rawat inap...
      </div>
    )
  }

  if (admissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-foreground/50">
        <BedDouble className="w-10 h-10 mb-3 opacity-30" />
        <p>Tidak ada pasien rawat inap saat ini.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {admissions.map((adm) => {
        const days = daysSince(adm.admission_date)
        return (
          <div
            key={adm.id}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
            onClick={() => onSelect(adm)}
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <BedDouble className="w-5 h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{adm.patients.full_name}</p>
                <p className="text-sm text-foreground/60">
                  MR: {adm.patients.medical_record_no ?? "—"}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-foreground/50">
                  <span className="flex items-center gap-1">
                    <BedDouble className="w-3 h-3" />
                    {adm.locations?.name ?? "—"} · Bed {adm.bed_number}
                  </span>
                  <span className="flex items-center gap-1">
                    <Stethoscope className="w-3 h-3" />
                    DPJP: {adm.dpjp?.full_name ?? "—"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {days} hari rawat
                  </span>
                </div>
                {adm.episodes_of_care?.diagnosis_primary && (
                  <p className="text-xs text-foreground/40 mt-0.5 truncate">
                    Dx: {adm.episodes_of_care.diagnosis_primary}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={adm.status} />
              <Badge variant="outline" className="text-xs">
                {adm.room_class.replace("_", " ").toUpperCase()}
              </Badge>
            </div>
          </div>
        )
      })}
    </div>
  )
}
