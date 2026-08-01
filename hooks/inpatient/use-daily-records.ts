/**
 * hooks/inpatient/use-daily-records.ts
 *
 * Fetches daily records for an admission + creates new shift records.
 */

import { useCallback, useEffect, useState } from "react"
import {
  getInpatientDailyRecords,
  postInpatientDailyRecord,
  createEncounter,
} from "@/lib/api/client"
import type { InpatientDailyRecord, InpatientShift } from "@/lib/types/outpatient"

interface UseDailyRecordsOptions {
  admissionId: string | null
  episodeOfCareId?: string
  patientId?: string
  poliServiceId?: string
  organizationId?: string
}

export function useDailyRecords(opts: UseDailyRecordsOptions) {
  const { admissionId, episodeOfCareId, patientId, poliServiceId, organizationId } = opts

  const [data, setData] = useState<InpatientDailyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!admissionId) return
    try {
      const result = await getInpatientDailyRecords(admissionId)
      setData(result)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat catatan harian")
    } finally {
      setLoading(false)
    }
  }, [admissionId])

  useEffect(() => {
    refresh()
  }, [refresh])

  /**
   * Creates a new daily record for today's shift:
   * 1. Creates an inpatient encounter
   * 2. Links it to this admission via inpatient_daily_records
   */
  const createDailyRecord = useCallback(
    async (shift?: InpatientShift): Promise<string | null> => {
      if (!admissionId || !patientId) return null
      setActionLoading(true)
      setError(null)
      try {
        // 1. Create inpatient encounter for this shift
        // poli_service_id is optional for inpatient — IGD-admitted patients have none
        const encounter = await createEncounter({
          patient_id: patientId,
          poli_service_id: poliServiceId ?? null,
          encounter_class: "inpatient",
          payment_type: "umum",
          organization_id: organizationId,
        })

        // Link episode to encounter
        if (episodeOfCareId && encounter?.id) {
          const { patchEncounter } = await import("@/lib/api/client")
          await patchEncounter(encounter.id, { episode_of_care_id: episodeOfCareId } as any)
        }

        // 2. Create the daily record
        await postInpatientDailyRecord({
          admission_id: admissionId,
          encounter_id: encounter.id,
          shift,
        })

        await refresh()
        return encounter.id
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal membuat catatan shift")
        return null
      } finally {
        setActionLoading(false)
      }
    },
    [admissionId, patientId, poliServiceId, episodeOfCareId, organizationId, refresh],
  )

  // Get today's records
  const today = new Date().toISOString().split("T")[0]
  const todayRecords = data.filter((r) => r.record_date === today)

  return { data, todayRecords, loading, error, actionLoading, refresh, createDailyRecord }
}
