import { useState, useEffect, useCallback } from "react"
import { useSurgeryRequests } from "@/hooks/outpatient/use-surgery-requests"
import {
  getLocations, getPractitioners,
  postEpisodeOfCare, patchEncounter,
  getSurgeryPerformers, upsertSurgeryPerformers,
} from "@/lib/api/client"
import type { Location, Practitioner, SurgeryRequest, SurgeryPerformerRole } from "@/lib/types/outpatient"
import { useToast } from "@/hooks/use-toast"

const FALLBACK_ROOMS: Location[] = [
  { id: "f-ok-1", name: "Kamar Operasi 1 (OK 1)", type: "ok", capacity: 1, is_active: true, organization_id: "" },
  { id: "f-ok-2", name: "Kamar Operasi 2 (OK 2)", type: "ok", capacity: 1, is_active: true, organization_id: "" },
  { id: "f-ok-3", name: "Kamar Operasi Utama (Major OR)", type: "ok", capacity: 1, is_active: true, organization_id: "" },
]

const FALLBACK_DOCTORS: Practitioner[] = [
  { id: "f-doc-1", full_name: "dr. Ahmad Santoso, Sp.B", role: "doctor", organization_id: "" },
  { id: "f-doc-2", full_name: "dr. Linda Wijaya, Sp.OG", role: "doctor", organization_id: "" },
  { id: "f-doc-3", full_name: "dr. Budi Setiadi, Sp.OT", role: "doctor", organization_id: "" },
  { id: "f-doc-4", full_name: "dr. Rian Pratama, Sp.An", role: "doctor", organization_id: "" },
  { id: "f-doc-5", full_name: "dr. Susi Indriati, Sp.An", role: "doctor", organization_id: "" },
]

export const ROLE_META: Record<string, { snomed_code: string; snomed_display: string; label: string; color: string }> = {
  dpjp:             { snomed_code: "304292004", snomed_display: "Responsible observer", label: "DPJP / Surgeon",    color: "bg-blue-100 text-blue-700" },
  anesthesiologist: { snomed_code: "88189002",  snomed_display: "Anesthesiologist",     label: "Dokter Anestesi",  color: "bg-purple-100 text-purple-700" },
  assistant:        { snomed_code: "304291006", snomed_display: "Responsible clinician", label: "Asisten Bedah",   color: "bg-cyan-100 text-cyan-700" },
  scrub_nurse:      { snomed_code: "224537007", snomed_display: "Scrub nurse",           label: "Scrub Nurse",     color: "bg-pink-100 text-pink-700" },
  other:            { snomed_code: "",           snomed_display: "",                      label: "Lainnya",         color: "bg-muted text-foreground/60" },
}

export interface PerformerRow {
  practitioner_id?: string | null
  display_name: string
  role: SurgeryPerformerRole
  pre_op_notes: string
  post_op_notes: string
  sort_order: number
}

function makePerformerRow(
  role: SurgeryPerformerRole,
  practitioner_id: string | null | undefined,
  display_name: string,
  sort_order: number,
): PerformerRow {
  return { role, practitioner_id, display_name, pre_op_notes: "", post_op_notes: "", sort_order }
}

export function useSurgeryDashboard() {
  const { toast } = useToast()
  const { data: surgeryRequests, loading, refresh, updateSurgeryStatus, actionLoading, error: hookError } = useSurgeryRequests()

  const [activeTab, setActiveTab] = useState("requested")

  // Modals state
  const [scheduleItem, setScheduleItem]   = useState<SurgeryRequest | null>(null)
  const [preOpItem,    setPreOpItem]       = useState<SurgeryRequest | null>(null)
  const [completeItem, setCompleteItem]   = useState<SurgeryRequest | null>(null)
  const [pacuItem,     setPacuItem]        = useState<SurgeryRequest | null>(null)
  const [dischargeItem, setDischargeItem] = useState<SurgeryRequest | null>(null)

  // Loaded DB resources for forms
  const [okRooms, setOkRooms] = useState<Location[]>([])
  const [doctors, setDoctors] = useState<Practitioner[]>([])
  const [wards,   setWards]   = useState<Location[]>([])

  // Form fields
  const [scheduleForm, setScheduleForm] = useState({ date: "", room: "", surgeon: "", anesthesiologist: "" })
  const [preOpForm,    setPreOpForm]    = useState({ assessment: "", clearance: "layak" })
  const [pacuForm,     setPacuForm]     = useState({ pacuNotes: "" })

  // Performers form (replaces completeForm)
  const [performers,         setPerformers]         = useState<PerformerRow[]>([])
  const [performersLoading,  setPerformersLoading]  = useState(false)

  const [formError, setFormError] = useState("")

  // Load performers when completeItem is set
  useEffect(() => {
    if (!completeItem) return
    setFormError("")
    setPerformersLoading(true)

    getSurgeryPerformers(completeItem.id)
      .then((rows) => {
        if (rows.length > 0) {
          setPerformers(rows.map((r, i) => ({
            practitioner_id: r.practitioner_id,
            display_name: r.display_name,
            role: r.role,
            pre_op_notes: r.pre_op_notes ?? "",
            post_op_notes: r.post_op_notes ?? "",
            sort_order: r.sort_order ?? i,
          })))
        } else {
          // Pre-seed with DPJP + Anesthesiologist from schedule
          const seed: PerformerRow[] = []
          if (completeItem.surgeon_id) {
            seed.push(makePerformerRow("dpjp", completeItem.surgeon_id, completeItem.surgeon?.full_name ?? "DPJP", 0))
          }
          if (completeItem.anesthesiologist_id) {
            seed.push(makePerformerRow("anesthesiologist", completeItem.anesthesiologist_id, completeItem.anesthesiologist?.full_name ?? "Anestesi", 1))
          }
          if (seed.length === 0) {
            seed.push(makePerformerRow("dpjp", null, "", 0))
            seed.push(makePerformerRow("anesthesiologist", null, "", 1))
          }
          setPerformers(seed)
        }
      })
      .catch(() => {
        setPerformers([
          makePerformerRow("dpjp", completeItem.surgeon_id, completeItem.surgeon?.full_name ?? "DPJP", 0),
          makePerformerRow("anesthesiologist", completeItem.anesthesiologist_id, completeItem.anesthesiologist?.full_name ?? "Anestesi", 1),
        ])
      })
      .finally(() => setPerformersLoading(false))
  }, [completeItem])

  // Prefetch resources
  useEffect(() => {
    getLocations({ type: "ok" })
      .then((res) => setOkRooms(res.length > 0 ? res : FALLBACK_ROOMS))
      .catch(() => setOkRooms(FALLBACK_ROOMS))

    getPractitioners({ role: "doctor" })
      .then((res) => setDoctors(res.length > 0 ? res : FALLBACK_DOCTORS))
      .catch(() => setDoctors(FALLBACK_DOCTORS))

    getLocations({ type: "ward" })
      .then(setWards)
      .catch(() => setWards([]))
  }, [])

  // Performer CRUD
  const addPerformer = () => {
    setPerformers((prev) => [
      ...prev,
      makePerformerRow("assistant", null, "", prev.length),
    ])
  }

  const removePerformer = (index: number) => {
    setPerformers((prev) => prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, sort_order: i })))
  }

  const updatePerformer = (index: number, patch: Partial<PerformerRow>) => {
    setPerformers((prev) => prev.map((p, i) => i === index ? { ...p, ...patch } : p))
  }

  // 1. Schedule
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scheduleItem) return
    if (!scheduleForm.date || !scheduleForm.surgeon || !scheduleForm.anesthesiologist) {
      setFormError("Semua kolom penjadwalan wajib diisi")
      return
    }
    setFormError("")
    const ok = await updateSurgeryStatus(scheduleItem.id, "surgery_scheduled", {
      scheduled_date: new Date(scheduleForm.date).toISOString(),
      surgeon_id: scheduleForm.surgeon,
      anesthesiologist_id: scheduleForm.anesthesiologist,
    })
    if (ok) {
      toast?.({ title: "Jadwal Disimpan", description: "Tindakan operasi berhasil dijadwalkan!" })
      setScheduleItem(null)
      setActiveTab("scheduled")
    }
  }

  // 2. Pre-Op Assessment (Nurse)
  const handlePreOpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!preOpItem) return
    if (!preOpForm.assessment.trim()) {
      setFormError("Catatan asesmen pra-bedah wajib diisi")
      return
    }
    setFormError("")
    const ok = await updateSurgeryStatus(preOpItem.id, "ready_for_surgery", {
      pre_op_assessment: preOpForm.assessment,
      clearance_status: preOpForm.clearance,
    })
    if (ok) {
      toast?.({ title: "Asesmen Disimpan", description: "Pasien dinyatakan siap untuk operasi!" })
      setPreOpItem(null)
      setActiveTab("scheduled")
    }
  }

  // 3. Start Surgery
  const handleStartSurgery = async (item: SurgeryRequest) => {
    const ok = await updateSurgeryStatus(item.id, "intra_operative", {
      surgery_start_at: new Date().toISOString(),
    })
    if (ok) {
      toast?.({ title: "Operasi Dimulai", description: "Operasi sedang berlangsung di kamar bedah." })
    }
  }

  // 4. Save Draft (partial — saves performers without completing)
  const handleSaveDraft = async () => {
    if (!completeItem) return
    try {
      await upsertSurgeryPerformers(completeItem.id, performers.map((p, i) => ({
        ...p,
        snomed_role_code: ROLE_META[p.role]?.snomed_code,
        snomed_role_display: ROLE_META[p.role]?.snomed_display,
        sort_order: i,
      })))
      // Keep status as intra_operative
      await updateSurgeryStatus(completeItem.id, "intra_operative", {})
      toast?.({ title: "Draft Disimpan", description: "Laporan bedah berhasil disimpan sebagai draft." })
      setCompleteItem(null)
    } catch {
      setFormError("Gagal menyimpan draft")
    }
  }

  // 5. Complete Surgery (Final Submit)
  const handleCompleteSurgerySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!completeItem) return

    const dpjp  = performers.find((p) => p.role === "dpjp")
    const anest = performers.find((p) => p.role === "anesthesiologist")

    if (!dpjp?.post_op_notes?.trim() || !anest?.post_op_notes?.trim()) {
      setFormError("Laporan post-op DPJP dan Dokter Anestesi wajib diisi sebelum submit.")
      return
    }

    const emptyNames = performers.filter((p) => !p.display_name.trim())
    if (emptyNames.length > 0) {
      setFormError("Semua anggota tim harus memiliki nama.")
      return
    }

    setFormError("")
    try {
      await upsertSurgeryPerformers(completeItem.id, performers.map((p, i) => ({
        ...p,
        snomed_role_code: ROLE_META[p.role]?.snomed_code,
        snomed_role_display: ROLE_META[p.role]?.snomed_display,
        sort_order: i,
      })))
      const ok = await updateSurgeryStatus(completeItem.id, "post_operative", {
        surgery_end_at: new Date().toISOString(),
      })
      if (ok) {
        toast?.({ title: "Operasi Selesai", description: "Laporan operasi berhasil disimpan dan disubmit!" })
        setCompleteItem(null)
        setActiveTab("scheduled")
      }
    } catch {
      setFormError("Gagal menyimpan laporan operasi")
    }
  }

  // 6. PACU (kept for type compatibility, legacy flow)
  const handlePacuSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pacuItem) return
    if (!pacuForm.pacuNotes.trim()) { setFormError("Catatan observasi PACU wajib diisi"); return }
    setFormError("")
    const ok = await updateSurgeryStatus(pacuItem.id, "post_operative", {
      pacu_discharge_at: new Date().toISOString(),
      pacu_notes: pacuForm.pacuNotes,
    })
    if (ok) {
      toast?.({ title: "Pasien Stabil", description: "Pasien keluar dari ruang pemulihan PACU." })
      setPacuItem(null)
      setDischargeItem(pacuItem)
    }
  }

  // 7. Final Disposition
  const handleFinalDischargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dischargeItem) return
    setFormError("")
    try {
      let newEpisodeId: string | null = null
      if (dischargeItem.needs_inpatient_after && !dischargeItem.episode_of_care_id) {
        // Create episode_of_care only — nurse assigns the room via Permintaan Rawat Inap
        const episode = await postEpisodeOfCare({
          patient_id: dischargeItem.patient_id,
          dpjp_id: dischargeItem.surgeon_id || dischargeItem.requested_by,
          diagnosis_primary: `Pasca Operasi - ${dischargeItem.surgery_type}`,
        })
        newEpisodeId = episode.id
        await patchEncounter(dischargeItem.encounter_id, {
          status: "admitted",
          episode_of_care_id: episode.id,
        } as any)
      }
      // Also update surgery_request.episode_of_care_id so the admission-requests API
      // can correctly annotate the source badge as 'surgery' instead of 'poli'
      await updateSurgeryStatus(dischargeItem.id, "surgery_completed",
        newEpisodeId ? { episode_of_care_id: newEpisodeId } : undefined
      )
      const msg = dischargeItem.needs_inpatient_after && !dischargeItem.episode_of_care_id
        ? "Permintaan rawat inap dikirim ke perawat untuk alokasi kamar."
        : dischargeItem.needs_inpatient_after
        ? "Pasien dikembalikan ke bangsal perawatan."
        : "Pasien berhasil dipulangkan."
      toast?.({ title: "Proses Selesai", description: msg })
      setDischargeItem(null)
      setActiveTab("history")
      refresh()
    } catch (err: any) {
      setFormError(err.message || "Gagal memproses pemulangan pasien")
    }
  }

  const pendingRequests    = surgeryRequests.filter((r) => r.status === "surgery_requested")
  const activeSchedules    = surgeryRequests.filter((r) =>
    r.status === "surgery_scheduled" || r.status === "ready_for_surgery" ||
    r.status === "intra_operative"   || r.status === "post_operative"
  )
  const historicalRequests = surgeryRequests.filter(
    (r) => r.pacu_discharge_at !== null || r.status === "post_operative" || r.status === "surgery_completed"
  )

  return {
    activeTab, setActiveTab,
    scheduleItem, setScheduleItem,
    preOpItem, setPreOpItem,
    completeItem, setCompleteItem,
    pacuItem, setPacuItem,
    dischargeItem, setDischargeItem,
    okRooms, doctors, wards,
    scheduleForm, setScheduleForm,
    preOpForm, setPreOpForm,
    performers, performersLoading,
    addPerformer, removePerformer, updatePerformer,
    pacuForm, setPacuForm,
    formError, setFormError,
    loading, actionLoading, hookError, refresh,
    handleScheduleSubmit,
    handlePreOpSubmit,
    handleStartSurgery,
    handleCompleteSurgerySubmit,
    handlePacuSubmit,
    handleFinalDischargeSubmit,
    handleSaveDraft,
    pendingRequests, activeSchedules, historicalRequests,
    // Legacy aliases removed — callers updated below
  }
}
