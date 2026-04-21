/**
 * hooks/outpatient/use-queue.ts
 *
 * Manages today's queue list with auto-polling every 30s.
 * Exposes actions: callPatient, markStatus.
 */

import { useCallback, useEffect, useState } from "react"
import { getQueue, patchQueueStatus } from "@/lib/api/client"
import type { QueueEntry, QueueStatus } from "@/lib/types/outpatient"

interface UseQueueOptions {
  date?: string
  poliServiceId?: string
  pollIntervalMs?: number
}

export function useQueue(opts: UseQueueOptions = {}) {
  const { date, poliServiceId, pollIntervalMs = 30_000 } = opts

  const [data, setData] = useState<QueueEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await getQueue({ date, poli_service_id: poliServiceId })
      setData(result)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat antrian")
    } finally {
      setLoading(false)
    }
  }, [date, poliServiceId])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, pollIntervalMs)
    return () => clearInterval(id)
  }, [refresh, pollIntervalMs])

  const updateStatus = useCallback(
    async (queueId: string, status: QueueStatus) => {
      await patchQueueStatus(queueId, status)
      // Optimistic update
      setData((prev) =>
        prev.map((q) => (q.id === queueId ? { ...q, status } : q)),
      )
      await refresh()
    },
    [refresh],
  )

  // Derived helpers
  const waiting        = data.filter((q) => q.status === "waiting")
  const called         = data.filter((q) => q.status === "called")
  const withVitalSigns = data.filter((q) => q.vital_signs_recorded)
  const done           = data.filter((q) => q.status === "done")

  return {
    data,
    loading,
    error,
    refresh,
    updateStatus,
    stats: {
      total:              data.length,
      waiting:            waiting.length,
      called:             called.length,
      vitalSignsRecorded: withVitalSigns.length,
      inService:          data.filter((q) => q.status === "in_service").length,
      done:               done.length,
    },
  }
}
