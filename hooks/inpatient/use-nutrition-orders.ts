/**
 * hooks/inpatient/use-nutrition-orders.ts
 *
 * Fetches nutrition orders for an episode and provides CRUD actions.
 */

import { useCallback, useEffect, useState } from "react"
import { getNutritionOrders, postNutritionOrder, patchNutritionOrder } from "@/lib/api/client"
import type { NutritionOrder, NutritionOrderInput } from "@/lib/types/outpatient"

export function useNutritionOrders(episodeOfCareId: string | null) {
  const [data, setData] = useState<NutritionOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!episodeOfCareId) return
    try {
      const result = await getNutritionOrders(episodeOfCareId)
      setData(result)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat order nutrisi")
    } finally {
      setLoading(false)
    }
  }, [episodeOfCareId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const create = useCallback(
    async (input: NutritionOrderInput): Promise<boolean> => {
      setActionLoading(true)
      setError(null)
      try {
        await postNutritionOrder(input)
        await refresh()
        return true
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal membuat order nutrisi")
        return false
      } finally {
        setActionLoading(false)
      }
    },
    [refresh],
  )

  const update = useCallback(
    async (orderId: string, updates: Partial<NutritionOrderInput & { is_active: boolean }>): Promise<boolean> => {
      setActionLoading(true)
      setError(null)
      try {
        await patchNutritionOrder(orderId, updates)
        await refresh()
        return true
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal mengubah order nutrisi")
        return false
      } finally {
        setActionLoading(false)
      }
    },
    [refresh],
  )

  const activeOrder = data.find((o) => o.is_active)

  return { data, activeOrder, loading, error, actionLoading, refresh, create, update }
}
