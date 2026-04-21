/**
 * hooks/outpatient/use-encounter.ts
 *
 * Loads full encounter detail (patient + vitals + notes + diagnoses + prescriptions + labs).
 */

import { useCallback, useEffect, useState } from "react"
import { getEncounter, patchEncounter } from "@/lib/api/client"
import type { Encounter, EncounterStatus } from "@/lib/types/outpatient"

export function useEncounter(encounterId: string | null) {
  const [data, setData] = useState<Encounter | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!encounterId) return
    setLoading(true)
    setError(null)
    try {
      const result = await getEncounter(encounterId)
      setData(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat encounter")
    } finally {
      setLoading(false)
    }
  }, [encounterId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const updateStatus = useCallback(
    async (status: EncounterStatus) => {
      if (!encounterId) return
      await patchEncounter(encounterId, { status })
      await refresh()
    },
    [encounterId, refresh],
  )

  return { data, loading, error, refresh, updateStatus }
}
