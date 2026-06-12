import { useState, useEffect, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import {
  getEmergencyEncounters,
  getEmergencyEncounter,
  postEmergencyEncounter,
  patchEmergencyEncounter,
  patchEmergencyTriage,
  patchEmergencyOutcome,
} from "@/lib/api/client"
import type { EmergencyEncounter } from "@/lib/types/outpatient"

interface UseEmergencyOptions {
  status?: string
  search?: string
  pollIntervalMs?: number
  limit?: number
}

export function useEmergency(opts?: UseEmergencyOptions) {
  const [data, setData] = useState<EmergencyEncounter[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: opts?.limit ?? 20 })

  const { toast } = useToast()

  const fetchEncounters = useCallback(async (page = 1) => {
    try {
      setLoading(true)
      const res = await getEmergencyEncounters({
        status: opts?.status,
        search: opts?.search,
        page,
        limit: opts?.limit ?? 20,
      })
      setData(res.data)
      setMeta(res.meta)
      setError(null)
    } catch (e: any) {
      setError(e.message || "Failed to fetch emergency encounters")
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [opts?.status, opts?.search, opts?.limit, toast])

  // Initial fetch and polling
  useEffect(() => {
    fetchEncounters(1)
    if (opts?.pollIntervalMs) {
      const interval = setInterval(() => fetchEncounters(meta.page), opts.pollIntervalMs)
      return () => clearInterval(interval)
    }
  }, [fetchEncounters, opts?.pollIntervalMs, meta.page])

  const create = async (input: {
    patient_id: string
    triage_category?: string
    triage_complaint?: string
    is_critical?: boolean
    needs_ambulance?: boolean
  }) => {
    setActionLoading(true)
    try {
      const result = await postEmergencyEncounter(input)
      await fetchEncounters(1)
      toast({ title: "Berhasil", description: "Pasien IGD berhasil didaftarkan." })
      return result
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
      return false
    } finally {
      setActionLoading(false)
    }
  }

  const update = async (
    id: string,
    updateData: Partial<{
      status: string
      triage_category: string
      triage_complaint: string
      resuscitation_notes: string
      outcome: string
      referred_to: string
      referral_letter_no: string
      is_critical: boolean
      needs_ambulance: boolean
    }>
  ) => {
    setActionLoading(true)
    try {
      const result = await patchEmergencyEncounter(id, updateData)
      await fetchEncounters(meta.page)
      toast({ title: "Berhasil", description: "Data IGD berhasil diupdate." })
      return result
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
      return false
    } finally {
      setActionLoading(false)
    }
  }

  const getDetail = async (id: string) => {
    try {
      return await getEmergencyEncounter(id)
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
      return null
    }
  }

  const triage = async (
    id: string,
    input: {
      triage_category: string
      triage_complaint: string
      is_critical?: boolean
      resuscitation_notes?: string
      needs_ambulance?: boolean
    }
  ) => {
    setActionLoading(true)
    try {
      const result = await patchEmergencyTriage(id, input)
      await fetchEncounters(meta.page)
      toast({ title: "Berhasil", description: "Data triage berhasil disimpan." })
      return result
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
      return false
    } finally {
      setActionLoading(false)
    }
  }

  const resolveOutcome = async (
    id: string,
    input: {
      outcome: 'discharged' | 'referred' | 'admitted_inpatient'
      referred_to?: string
      referral_letter_no?: string
      admission_data?: {
        room_location_id: string
        bed_number: string
        room_class: string
        dpjp_id: string
      }
    }
  ) => {
    setActionLoading(true)
    try {
      const result = await patchEmergencyOutcome(id, input)
      await fetchEncounters(meta.page)
      toast({ title: "Berhasil", description: "Disposisi IGD berhasil disimpan." })
      return result
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
      return false
    } finally {
      setActionLoading(false)
    }
  }

  return {
    data,
    meta,
    loading,
    actionLoading,
    error,
    refresh: fetchEncounters,
    create,
    update,
    triage,
    resolveOutcome,
    getDetail,
  }
}
