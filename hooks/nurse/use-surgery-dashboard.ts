import { useState, useEffect, useCallback } from "react"
import { useSurgeryRequests } from "@/hooks/outpatient/use-surgery-requests"
import { getLocations, getPractitioners, postInpatientAdmission, postEpisodeOfCare, patchEncounter } from "@/lib/api/client"
import type { Location, Practitioner, SurgeryRequest } from "@/lib/types/outpatient"
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

export function useSurgeryDashboard() {
  const { toast } = useToast()
  const { data: surgeryRequests, loading, refresh, updateSurgeryStatus, actionLoading, error: hookError } = useSurgeryRequests()

  const [activeTab, setActiveTab] = useState("requested")

  // Modals state
  const [scheduleItem, setScheduleItem] = useState<SurgeryRequest | null>(null)
  const [preOpItem, setPreOpItem] = useState<SurgeryRequest | null>(null)
  const [completeItem, setCompleteItem] = useState<SurgeryRequest | null>(null)
  const [pacuItem, setPacuItem] = useState<SurgeryRequest | null>(null)
  const [dischargeItem, setDischargeItem] = useState<SurgeryRequest | null>(null)

  // Loaded DB resources for forms
  const [okRooms, setOkRooms] = useState<Location[]>([])
  const [doctors, setDoctors] = useState<Practitioner[]>([])
  const [wards, setWards] = useState<Location[]>([])

  // Form fields
  const [scheduleForm, setScheduleForm] = useState({ date: "", room: "", surgeon: "", anesthesiologist: "" })
  const [preOpForm, setPreOpForm] = useState({ assessment: "", clearance: "layak" })
  const [completeForm, setCompleteForm] = useState({
    surgeonNotes: "",
    anesthesiologistNotes: "",
    doctorTeam: [""] as string[]
  })
  const [pacuForm, setPacuForm] = useState({ pacuNotes: "" })
  const [wardForm, setWardForm] = useState({ wardRoom: "", bedNumber: "", roomClass: "kelas_3" })

  // Error/Success state within forms
  const [formError, setFormError] = useState("")

  // Load draft from pacu_notes when completeItem is selected
  useEffect(() => {
    if (completeItem) {
      setFormError("")
      try {
        if (completeItem.pacu_notes && completeItem.pacu_notes.startsWith("{")) {
          const draft = JSON.parse(completeItem.pacu_notes)
          setCompleteForm({
            surgeonNotes: draft.surgeonNotes || "",
            anesthesiologistNotes: draft.anesthesiologistNotes || "",
            doctorTeam: Array.isArray(draft.doctorTeam) ? draft.doctorTeam : [""]
          })
        } else {
          setCompleteForm({
            surgeonNotes: completeItem.intra_op_notes || "",
            anesthesiologistNotes: completeItem.post_op_notes || "",
            doctorTeam: [""]
          })
        }
      } catch (e) {
        setCompleteForm({
          surgeonNotes: completeItem.intra_op_notes || "",
          anesthesiologistNotes: completeItem.post_op_notes || "",
          doctorTeam: [""]
        })
      }
    }
  }, [completeItem])

  // Prefetch Operating Rooms, Doctors, and Wards
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

  // Doctor team dynamic array methods
  const addDoctorTeamMember = () => {
    setCompleteForm((prev) => ({
      ...prev,
      doctorTeam: [...prev.doctorTeam, ""]
    }))
  }

  const removeDoctorTeamMember = (index: number) => {
    setCompleteForm((prev) => ({
      ...prev,
      doctorTeam: prev.doctorTeam.filter((_, i) => i !== index)
    }))
  }

  const updateDoctorTeamMember = (index: number, value: string) => {
    setCompleteForm((prev) => {
      const newTeam = [...prev.doctorTeam]
      newTeam[index] = value
      return {
        ...prev,
        doctorTeam: newTeam
      }
    })
  }

  // 1. Submit Schedule
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

  // 2. Submit Pre-Op
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
      setActiveTab("scheduled")
    }
  }

  // Save Draft (for incomplete completion form)
  const handleSaveDraft = async () => {
    if (!completeItem) return
    const draftJson = JSON.stringify({
      surgeonNotes: completeForm.surgeonNotes,
      anesthesiologistNotes: completeForm.anesthesiologistNotes,
      doctorTeam: completeForm.doctorTeam,
    })

    const ok = await updateSurgeryStatus(completeItem.id, "intra_operative", {
      pacu_notes: draftJson,
      intra_op_notes: completeForm.surgeonNotes,
      post_op_notes: completeForm.anesthesiologistNotes,
    })
    if (ok) {
      toast?.({ title: "Draft Disimpan", description: "Laporan bedah berhasil disimpan sebagai draft." })
      setCompleteItem(null)
    }
  }

  // 4. Complete Surgery (Final Submit - requires both reports)
  const handleCompleteSurgerySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!completeItem) return
    if (!completeForm.surgeonNotes.trim() || !completeForm.anesthesiologistNotes.trim()) {
      setFormError("Laporan DPJP (Bedah) dan Laporan Anestesi wajib diisi sebelum submit.")
      return
    }

    setFormError("")
    const draftJson = JSON.stringify({
      surgeonNotes: completeForm.surgeonNotes,
      anesthesiologistNotes: completeForm.anesthesiologistNotes,
      doctorTeam: completeForm.doctorTeam,
    })

    const teamString = completeForm.doctorTeam.filter(Boolean).join(", ")
    const finalIntraNotes = completeForm.surgeonNotes + (teamString ? `\n\nTim Dokter Bedah: ${teamString}` : "")

    // Move status directly to post_operative to enable transfer/discharge
    const ok = await updateSurgeryStatus(completeItem.id, "post_operative", {
      pacu_notes: draftJson,
      intra_op_notes: finalIntraNotes,
      post_op_notes: completeForm.anesthesiologistNotes,
      surgery_end_at: new Date().toISOString(),
    })
    if (ok) {
      toast?.({ title: "Operasi Selesai", description: "Laporan operasi berhasil disimpan dan disubmit!" })
      setCompleteItem(null)
      setActiveTab("scheduled")
    }
  }

  // 5. PACU Discharge (Deprecated by new flow but kept for type compatibility)
  const handlePacuSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pacuItem) return
    if (!pacuForm.pacuNotes.trim()) {
      setFormError("Catatan observasi pemulihan (PACU) wajib diisi")
      return
    }
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

  // 6. Final Disposition / Discharge or Inpatient Admission
  const handleFinalDischargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dischargeItem) return

    setFormError("")
    try {
      if (dischargeItem.needs_inpatient_after && !dischargeItem.episode_of_care_id) {
        if (!wardForm.wardRoom || !wardForm.bedNumber) {
          setFormError("Pilih bangsal rawat inap dan nomor bed pasien")
          return
        }

        const episode = await postEpisodeOfCare({
          patient_id: dischargeItem.patient_id,
          dpjp_id: dischargeItem.surgeon_id || dischargeItem.requested_by,
          diagnosis_primary: `Pasca Operasi - ${dischargeItem.surgery_type}`,
        })

        await postInpatientAdmission({
          episode_of_care_id: episode.id,
          patient_id: dischargeItem.patient_id,
          room_location_id: wardForm.wardRoom,
          bed_number: wardForm.bedNumber,
          room_class: wardForm.roomClass as any,
          dpjp_id: dischargeItem.surgeon_id || dischargeItem.requested_by,
          admitted_from: "outpatient",
        })

        await patchEncounter(dischargeItem.encounter_id, {
          status: "admitted",
          episode_of_care_id: episode.id,
        } as any)
      }

      await updateSurgeryStatus(dischargeItem.id, "surgery_completed")
      toast?.({ title: "Proses Selesai", description: "Pasien telah berhasil dipindahkan ke rawat inap!" })
      setDischargeItem(null)
      setActiveTab("history")
      refresh()
    } catch (err: any) {
      setFormError(err.message || "Gagal memproses pemulangan pasien")
    }
  }

  const pendingRequests = surgeryRequests.filter((r) => r.status === "surgery_requested")
  const activeSchedules = surgeryRequests.filter(
    (r) =>
      r.status === "surgery_scheduled" ||
      r.status === "ready_for_surgery" ||
      r.status === "intra_operative" ||
      r.status === "post_operative"
  )
  const historicalRequests = surgeryRequests.filter(
    (r) => r.pacu_discharge_at !== null || r.status === "post_operative" || r.status === "surgery_completed"
  )

  return {
    activeTab,
    setActiveTab,
    scheduleItem,
    setScheduleItem,
    preOpItem,
    setPreOpItem,
    completeItem,
    setCompleteItem,
    pacuItem,
    setPacuItem,
    dischargeItem,
    setDischargeItem,
    okRooms,
    doctors,
    wards,
    scheduleForm,
    setScheduleForm,
    preOpForm,
    setPreOpForm,
    completeForm,
    setCompleteForm,
    pacuForm,
    setPacuForm,
    wardForm,
    setWardForm,
    formError,
    setFormError,
    loading,
    actionLoading,
    hookError,
    refresh,
    handleScheduleSubmit,
    handlePreOpSubmit,
    handleStartSurgery,
    handleCompleteSurgerySubmit,
    handlePacuSubmit,
    handleFinalDischargeSubmit,
    pendingRequests,
    activeSchedules,
    historicalRequests,
    handleSaveDraft,
    addDoctorTeamMember,
    removeDoctorTeamMember,
    updateDoctorTeamMember,
  }
}
