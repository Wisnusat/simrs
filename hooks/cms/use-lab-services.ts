import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCmsLabServices, postCmsLabService, deleteCmsLabService, patchCmsLabServicePrice } from '@/lib/api/client'
import type { LabService } from '@/lib/types/outpatient'

export function useLabServices() {
  const [data, setData] = useState<LabService[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await getCmsLabServices()
      setData(result)
    } catch {
      // errors handled by callers via return value
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const add = useCallback(async (masterId: string): Promise<{ ok: boolean; error?: string }> => {
    setActionLoading(true)
    try {
      await postCmsLabService(masterId)
      await refresh()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Gagal menambahkan layanan' }
    } finally {
      setActionLoading(false)
    }
  }, [refresh])

  const remove = useCallback(async (id: string): Promise<{ ok: boolean; error?: string }> => {
    setActionLoading(true)
    try {
      await deleteCmsLabService(id)
      setData(prev => prev.filter(s => s.id !== id))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Gagal menghapus layanan' }
    } finally {
      setActionLoading(false)
    }
  }, [])

  const updatePrice = useCallback(async (id: string, price: number): Promise<{ ok: boolean; error?: string }> => {
    try {
      const updated = await patchCmsLabServicePrice(id, price)
      setData(prev => prev.map(s => s.id === id ? { ...s, price: updated.price } : s))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Gagal menyimpan harga' }
    }
  }, [])

  const addedLoincs = useMemo(() => new Set(data.map(s => s.loinc_code)), [data])

  const grouped = useMemo(() =>
    data.reduce<Record<string, LabService[]>>((acc, svc) => {
      const cat = svc.category ?? 'Lainnya'
      ;(acc[cat] ??= []).push(svc)
      return acc
    }, {}),
    [data]
  )

  return { data, loading, actionLoading, refresh, add, remove, updatePrice, addedLoincs, grouped }
}
