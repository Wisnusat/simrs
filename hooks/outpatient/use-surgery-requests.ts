import { useCallback, useEffect, useState } from "react"
import { getSurgeryRequests, patchSurgeryRequest } from "@/lib/api/client"
import type { SurgeryRequest, SurgeryStatus } from "@/lib/types/outpatient"

interface UseSurgeryRequestsOptions {
  status?: string
  patientId?: string
  pollIntervalMs?: number
}

export function useSurgeryRequests(opts: UseSurgeryRequestsOptions = {}) {
  const { status, patientId, pollIntervalMs = 15_000 } = opts

  const [data, setData] = useState<SurgeryRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await getSurgeryRequests({ status, patient_id: patientId })
      setData(result)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar operasi")
    } finally {
      setLoading(false)
    }
  }, [status, patientId])

  useEffect(() => {
    refresh()
    if (pollIntervalMs > 0) {
      const id = setInterval(refresh, pollIntervalMs)
      return () => clearInterval(id)
    }
  }, [refresh, pollIntervalMs])

  const updateSurgeryStatus = useCallback(
    async (id: string, newStatus: SurgeryStatus, additionalFields: Partial<SurgeryRequest> = {}) => {
      setActionLoading(true)
      try {
        await patchSurgeryRequest(id, { status: newStatus, ...additionalFields })
        // Optimistic update
        setData((prev) =>
          prev.map((req) => (req.id === id ? { ...req, status: newStatus, ...additionalFields } : req))
        )
        await refresh()
        return true
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal memperbarui status operasi")
        return false
      } finally {
        setActionLoading(false)
      }
    },
    [refresh]
  )

  return {
    data,
    loading,
    actionLoading,
    error,
    refresh,
    updateSurgeryStatus,
    stats: {
      total: data.length,
      requested: data.filter((s) => s.status === "surgery_requested").length,
      scheduled: data.filter((s) => s.status === "surgery_scheduled").length,
      ready: data.filter((s) => s.status === "ready_for_surgery").length,
      ongoing: data.filter((s) => s.status === "intra_operative").length,
      completed: data.filter((s) => s.status === "surgery_completed").length,
      postOp: data.filter((s) => s.status === "post_operative").length,
    },
  }
}
