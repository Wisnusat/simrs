import { useCallback, useEffect, useRef, useState } from 'react'
import { getMasterLabServices } from '@/lib/api/client'
import type { MasterLabService } from '@/lib/types/outpatient'

const PAGE_SIZE = 20
const DEBOUNCE_MS = 300

export function useMasterLabServices() {
  const [data, setData] = useState<MasterLabService[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [query, setQueryState] = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetch = useCallback(async (q: string, p: number) => {
    setLoading(true)
    try {
      const result = await getMasterLabServices({ q: q || undefined, page: p, limit: PAGE_SIZE })
      setData(result.data)
      setTotal(result.total)
    } catch {
      setData([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load first page on mount
  useEffect(() => { fetch('', 1) }, [fetch])

  const setQuery = useCallback((value: string) => {
    setQueryState(value)
    setPage(1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetch(value, 1), DEBOUNCE_MS)
  }, [fetch])

  const goToPage = useCallback((p: number) => {
    setPage(p)
    fetch(query, p)
  }, [fetch, query])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return { data, loading, total, totalPages, page, query, setQuery, goToPage }
}
