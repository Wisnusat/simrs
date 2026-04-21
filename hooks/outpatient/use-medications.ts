/**
 * hooks/outpatient/use-medications.ts
 *
 * Searches the medication list with debounced search.
 * Used by the doctor's prescription form.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { getMedications } from "@/lib/api/client"
import type { Medication } from "@/lib/types/outpatient"

export function useMedications(debounceMs = 300) {
  const [data, setData] = useState<Medication[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (query: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await getMedications(query)
      setData(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar obat")
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load (all meds, no search filter)
  useEffect(() => {
    load("")
  }, [load])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(search), debounceMs)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, debounceMs, load])

  return { data, search, setSearch, loading, error }
}
