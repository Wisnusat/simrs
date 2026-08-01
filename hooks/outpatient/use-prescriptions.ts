/**
 * hooks/outpatient/use-prescriptions.ts
 *
 * List + dispense prescriptions. Used by both doctor (create) and pharmacist (dispense).
 */

import { useCallback, useEffect, useState } from "react"
import { getPrescriptions, postPrescription, dispensePrescription, patchPrescriptionStatus } from "@/lib/api/client"
import { usePolling } from "@/hooks/use-polling"
import { useRealtimeSync } from "@/hooks/use-realtime-sync"
import type { Prescription, PrescriptionInput } from "@/lib/types/outpatient"

interface UsePrescriptionsOptions {
  encounterId?: string
  today?: boolean
  fallbackPollMs?: number
}

export function usePrescriptions(opts: UsePrescriptionsOptions = {}) {
  const { encounterId, today, fallbackPollMs = 60_000 } = opts

  const [data, setData] = useState<Prescription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await getPrescriptions({ encounter_id: encounterId, today })
      setData(result)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat resep")
    } finally {
      setLoading(false)
    }
  }, [encounterId, today])

  useEffect(() => { refresh() }, [refresh])

  useRealtimeSync({
    table: 'prescriptions',
    filter: encounterId ? `encounter_id=eq.${encounterId}` : undefined,
    onchange: refresh,
  })

  usePolling(refresh, fallbackPollMs)

  const create = useCallback(
    async (input: PrescriptionInput): Promise<{ stockWarnings: string[] } | null> => {
      setActionLoading(true)
      setError(null)
      try {
        const result = await postPrescription(input)
        await refresh()
        return { stockWarnings: result.stock_warnings }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal membuat resep")
        return null
      } finally {
        setActionLoading(false)
      }
    },
    [refresh],
  )

  const dispense = useCallback(
    async (prescriptionId: string): Promise<{ dispensed: number; errors: string[] } | null> => {
      setActionLoading(true)
      setError(null)
      try {
        const result = await dispensePrescription(prescriptionId)
        await refresh()
        return result
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal memproses penyerahan")
        return null
      } finally {
        setActionLoading(false)
      }
    },
    [refresh],
  )

  const updateStatus = useCallback(
    async (prescriptionId: string, status: string): Promise<boolean> => {
      setActionLoading(true)
      setError(null)
      try {
        await patchPrescriptionStatus(prescriptionId, status)
        await refresh()
        return true
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal mengubah status")
        return false
      } finally {
        setActionLoading(false)
      }
    },
    [refresh],
  )

  const stats = {
    active: data.filter((p) => p.status === "active").length,
    completed: data.filter((p) => p.status === "completed").length,
    total: data.length,
  }

  return {
    data,
    loading,
    error,
    actionLoading,
    refresh,
    create,
    dispense,
    updateStatus,
    stats,
  }
}
