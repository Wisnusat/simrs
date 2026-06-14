/**
 * hooks/outpatient/use-patient-history.ts
 *
 * Manages patient visit history: fetches past encounters,
 * aggregates vital-sign trends, and controls timeline expansion.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { getPatientHistory } from "@/lib/api/client"
import type { Encounter } from "@/lib/types/outpatient"

// ---------------------------------------------------------------------------
// Vital-sign data point for chart rendering
// ---------------------------------------------------------------------------

export interface VitalDataPoint {
  date: string            // ISO date or formatted label
  systolic_bp?: number
  diastolic_bp?: number
  heart_rate?: number
  temperature?: number
  weight_kg?: number
  oxygen_saturation?: number
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UsePatientHistoryReturn {
  /** Past encounters excluding current, newest first */
  encounters: Encounter[]
  /** Whether the history panel is open */
  isOpen: boolean
  toggleOpen: () => void
  /** Which encounter is expanded (null = none) */
  expandedId: string | null
  setExpandedId: (id: string | null) => void
  /** Aggregated vital-sign data points (oldest → newest for charting) */
  vitalTrend: VitalDataPoint[]
  /** Loading state */
  loading: boolean
  /** Total encounter count */
  count: number
  /** Refresh data */
  refresh: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePatientHistory(
  patientId: string,
  currentEncounterId: string,
  limit = 10,
): UsePatientHistoryReturn {
  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)

  // ── Fetch encounters (lazy — only when panel opens) ──
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const all = await getPatientHistory(patientId, limit)
      setEncounters(all.filter((e) => e.id !== currentEncounterId))
      setFetched(true)
    } catch {
      /* silent — empty history is acceptable */
    } finally {
      setLoading(false)
    }
  }, [patientId, currentEncounterId, limit])

  // Lazy-load: only fetch once when panel first opens
  useEffect(() => {
    if (isOpen && !fetched) {
      refresh()
    }
  }, [isOpen, fetched, refresh])

  const toggleOpen = useCallback(() => setIsOpen((o) => !o), [])

  // ── Aggregate vital-sign trend data (oldest → newest) ──
  const vitalTrend = useMemo<VitalDataPoint[]>(() => {
    const points: VitalDataPoint[] = []

    // Process encounters in reverse (oldest first) for chronological charting
    const sorted = [...encounters].reverse()

    for (const enc of sorted) {
      const vs = enc.vital_signs?.[0]
      if (!vs) continue

      const date = enc.started_at
        ? new Date(enc.started_at).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
          })
        : "—"

      points.push({
        date,
        systolic_bp: vs.systolic_bp ?? undefined,
        diastolic_bp: vs.diastolic_bp ?? undefined,
        heart_rate: vs.heart_rate ?? undefined,
        temperature: vs.temperature ?? undefined,
        weight_kg: vs.weight_kg ?? undefined,
        oxygen_saturation: vs.oxygen_saturation ?? undefined,
      })
    }

    return points
  }, [encounters])

  return {
    encounters,
    isOpen,
    toggleOpen,
    expandedId,
    setExpandedId,
    vitalTrend,
    loading,
    count: encounters.length,
    refresh,
  }
}
