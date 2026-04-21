/**
 * hooks/inpatient/use-admissions.ts
 *
 * Fetches active inpatient admissions with admit/discharge actions.
 */

import { useCallback, useEffect, useState } from "react"
import {
  getInpatientAdmissions,
  postInpatientAdmission,
  patchInpatientAdmission,
} from "@/lib/api/client"
import type { InpatientAdmission, InpatientAdmissionInput, InpatientStatus } from "@/lib/types/outpatient"

interface UseAdmissionsOptions {
  status?: InpatientStatus
  dpjpId?: string
  pollIntervalMs?: number
}

export function useAdmissions(opts: UseAdmissionsOptions = {}) {
  const { status, dpjpId, pollIntervalMs = 30_000 } = opts

  const [data, setData] = useState<InpatientAdmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await getInpatientAdmissions({ status, dpjp_id: dpjpId })
      setData(result)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat data rawat inap")
    } finally {
      setLoading(false)
    }
  }, [status, dpjpId])

  useEffect(() => {
    refresh()
    if (pollIntervalMs > 0) {
      const id = setInterval(refresh, pollIntervalMs)
      return () => clearInterval(id)
    }
  }, [refresh, pollIntervalMs])

  const admit = useCallback(
    async (input: InpatientAdmissionInput): Promise<boolean> => {
      setActionLoading(true)
      setError(null)
      try {
        await postInpatientAdmission(input)
        await refresh()
        return true
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal membuat admisi")
        return false
      } finally {
        setActionLoading(false)
      }
    },
    [refresh],
  )

  const updateStatus = useCallback(
    async (admissionId: string, newStatus: InpatientStatus, extra?: Record<string, unknown>): Promise<boolean> => {
      setActionLoading(true)
      setError(null)
      try {
        await patchInpatientAdmission(admissionId, { status: newStatus, ...extra } as any)
        await refresh()
        return true
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal mengubah status admisi")
        return false
      } finally {
        setActionLoading(false)
      }
    },
    [refresh],
  )

  const stats = {
    total: data.length,
    admitted: data.filter((a) => a.status === "admitted").length,
    inCare: data.filter((a) => a.status === "in_care").length,
    dischargeReady: data.filter((a) => a.status === "discharge_approved").length,
  }

  return { data, loading, error, actionLoading, refresh, admit, updateStatus, stats }
}
