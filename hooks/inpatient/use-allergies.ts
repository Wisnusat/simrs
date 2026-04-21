/**
 * hooks/inpatient/use-allergies.ts
 *
 * Fetches patient allergies and provides creation action.
 */

import { useCallback, useEffect, useState } from "react"
import { getAllergies, postAllergy } from "@/lib/api/client"
import type { AllergyIntolerance, AllergyInput } from "@/lib/types/outpatient"

export function useAllergies(patientId: string | null) {
  const [data, setData] = useState<AllergyIntolerance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!patientId) return
    try {
      const result = await getAllergies(patientId)
      setData(result)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat data alergi")
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const create = useCallback(
    async (input: AllergyInput): Promise<boolean> => {
      setActionLoading(true)
      setError(null)
      try {
        await postAllergy(input)
        await refresh()
        return true
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal menyimpan data alergi")
        return false
      } finally {
        setActionLoading(false)
      }
    },
    [refresh],
  )

  return { data, loading, error, actionLoading, refresh, create }
}
