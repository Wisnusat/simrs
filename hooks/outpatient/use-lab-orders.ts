/**
 * hooks/outpatient/use-lab-orders.ts
 *
 * Lab order list + status advancement + result entry for the lab nurse page.
 */

import { useCallback, useEffect, useState } from "react"
import {
  getLabOrders,
  postLabOrder,
  patchLabOrderStatus,
  patchLabResults,
} from "@/lib/api/client"
import type {
  LabOrder,
  LabOrderInput,
  LabOrderStatus,
  LabResultInput,
} from "@/lib/types/outpatient"

interface UseLabOrdersOptions {
  encounterId?: string
  status?: string
  today?: boolean
  pollIntervalMs?: number
}

export function useLabOrders(opts: UseLabOrdersOptions = {}) {
  const { encounterId, status, today, pollIntervalMs = 30_000 } = opts

  const [data, setData] = useState<LabOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await getLabOrders({ encounter_id: encounterId, status, today })
      setData(result)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat permintaan lab")
    } finally {
      setLoading(false)
    }
  }, [encounterId, status, today])

  useEffect(() => {
    refresh()
    if (pollIntervalMs > 0) {
      const id = setInterval(refresh, pollIntervalMs)
      return () => clearInterval(id)
    }
  }, [refresh, pollIntervalMs])

  const create = useCallback(
    async (input: LabOrderInput): Promise<boolean> => {
      setActionLoading(true)
      setError(null)
      try {
        await postLabOrder(input)
        await refresh()
        return true
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal membuat permintaan lab")
        return false
      } finally {
        setActionLoading(false)
      }
    },
    [refresh],
  )

  const advanceStatus = useCallback(
    async (orderId: string, next: LabOrderStatus): Promise<boolean> => {
      setActionLoading(true)
      setError(null)
      try {
        await patchLabOrderStatus(orderId, next)
        await refresh()
        return true
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal mengubah status lab")
        return false
      } finally {
        setActionLoading(false)
      }
    },
    [refresh],
  )

  const submitResults = useCallback(
    async (orderId: string, results: LabResultInput[]): Promise<boolean> => {
      setActionLoading(true)
      setError(null)
      try {
        await patchLabResults(orderId, results)
        await refresh()
        return true
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal menyimpan hasil lab")
        return false
      } finally {
        setActionLoading(false)
      }
    },
    [refresh],
  )

  const stats = {
    total: data.length,
    pending: data.filter((lo) => lo.status === "lab_ordered").length,
    processing: data.filter((lo) => ["sample_taken", "processing"].includes(lo.status)).length,
    done: data.filter((lo) => ["result_uploaded", "verified"].includes(lo.status)).length,
  }

  return {
    data,
    loading,
    error,
    actionLoading,
    refresh,
    create,
    advanceStatus,
    submitResults,
    stats,
  }
}
