/**
 * hooks/outpatient/use-vital-signs.ts
 *
 * Handles submitting vital signs for a patient encounter.
 */

import { useState } from "react"
import { postVitalSigns } from "@/lib/api/client"
import type { VitalSignsInput } from "@/lib/types/outpatient"

export function useVitalSigns() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (input: VitalSignsInput): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      await postVitalSigns(input)
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan tanda vital"
      setError(msg)
      return false
    } finally {
      setLoading(false)
    }
  }

  const clearError = () => setError(null)

  return { submit, loading, error, clearError }
}
