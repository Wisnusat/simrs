/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState, useEffect } from "react"
import { useSurgeryRequests } from "@/hooks/outpatient/use-surgery-requests"
import { getLocations, getPractitioners, postInpatientAdmission, postEpisodeOfCare, patchEncounter } from "@/lib/api/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Activity, Calendar, Clock, Loader2, Play, CheckCircle, BedDouble,
  FileText, ShieldCheck, Heart, User, ClipboardList, RefreshCw, LogOut, ExternalLink
} from "lucide-react"
import type { Location, Practitioner, SurgeryRequest } from "@/lib/types/outpatient"
import { useToast } from "@/hooks/use-toast"

// Fallback seed data in case the remote DB hasn't been seeded with these specific records yet
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

export function SurgeryDashboard() {
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
  const [completeForm, setCompleteForm] = useState({ intraNotes: "", postNotes: "" })
  const [pacuForm, setPacuForm] = useState({ pacuNotes: "" })
  const [wardForm, setWardForm] = useState({ wardRoom: "", bedNumber: "", roomClass: "kelas_3" })

  // Error/Success state within forms
  const [formError, setFormError] = useState("")

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

  // 1. Submit Schedule
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scheduleItem) return
    if (!scheduleForm.date || !scheduleForm.room || !scheduleForm.surgeon || !scheduleForm.anesthesiologist) {
      setFormError("Semua kolom penjadwalan wajib diisi")
      return
    }
    setFormError("")
    const ok = await updateSurgeryStatus(scheduleItem.id, "surgery_scheduled", {
      scheduled_date: new Date(scheduleForm.date).toISOString(),
      ok_location_id: scheduleForm.room,
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

  // 4. Complete Surgery
  const handleCompleteSurgerySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!completeItem) return
    if (!completeForm.intraNotes.trim() || !completeForm.postNotes.trim()) {
      setFormError("Catatan intra-operasi dan rencana pasca-operasi wajib diisi")
      return
    }
    setFormError("")
    const ok = await updateSurgeryStatus(completeItem.id, "surgery_completed", {
      surgery_end_at: new Date().toISOString(),
      intra_op_notes: completeForm.intraNotes,
      post_op_notes: completeForm.postNotes,
    })
    if (ok) {
      toast?.({ title: "Operasi Selesai", description: "Laporan operasi disimpan. Pasien dikirim ke ruang PACU." })
      setCompleteItem(null)
      setActiveTab("scheduled")
    }
  }

  // 5. PACU Discharge
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
      setDischargeItem(pacuItem) // immediately open discharge modal
    }
  }

  // 6. Final Disposition / Discharge or Inpatient Admission
  const handleFinalDischargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dischargeItem) return

    setFormError("")
    try {
      // If patient needs inpatient after surgery and came from outpatient (i.e. has no active inpatient admission bed yet)
      if (dischargeItem.needs_inpatient_after && !dischargeItem.episode_of_care_id) {
        if (!wardForm.wardRoom || !wardForm.bedNumber) {
          setFormError("Pilih bangsal rawat inap dan nomor bed pasien")
          return
        }

        // A. Create Inpatient Episode of Care
        const episode = await postEpisodeOfCare({
          patient_id: dischargeItem.patient_id,
          dpjp_id: dischargeItem.surgeon_id || dischargeItem.requested_by,
          diagnosis_primary: `Pasca Operasi - ${dischargeItem.surgery_type}`,
        })

        // B. Assign Room Location Bed Number and create Inpatient Admission
        await postInpatientAdmission({
          episode_of_care_id: episode.id,
          patient_id: dischargeItem.patient_id,
          room_location_id: wardForm.wardRoom,
          bed_number: wardForm.bedNumber,
          room_class: wardForm.roomClass as any,
          dpjp_id: dischargeItem.surgeon_id || dischargeItem.requested_by,
          admitted_from: "outpatient",
        })

        // C. Link source outpatient encounter to inpatient episode
        await patchEncounter(dischargeItem.encounter_id, {
          status: "admitted",
          episode_of_care_id: episode.id,
        } as any)
      }

      // Finish this scheduling item (we keep it at post_operative which is the final recovery status)
      toast?.({ title: "Proses Selesai", description: "Pasien telah berhasil dipindahkan atau dipulangkan!" })
      setDischargeItem(null)
      setActiveTab("history")
      refresh()
    } catch (err: any) {
      setFormError(err.message || "Gagal memproses pemulangan pasien")
    }
  }

  // Filters for lists
  const pendingRequests = surgeryRequests.filter((r) => r.status === "surgery_requested")
  const activeSchedules = surgeryRequests.filter(
    (r) =>
      r.status === "surgery_scheduled" ||
      r.status === "ready_for_surgery" ||
      r.status === "intra_operative" ||
      r.status === "surgery_completed" ||
      r.status === "post_operative"
  )
  const historicalRequests = surgeryRequests.filter((r) => r.pacu_discharge_at !== null)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "surgery_requested":
        return <Badge className="bg-orange-500 hover:bg-orange-600 text-white">Menunggu Jadwal</Badge>
      case "surgery_scheduled":
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Terjadwal</Badge>
      case "ready_for_surgery":
        return <Badge className="bg-cyan-500 hover:bg-cyan-600 text-white">Asesmen Siap</Badge>
      case "intra_operative":
        return <Badge className="bg-amber-600 hover:bg-amber-700 text-white animate-pulse">Sedang Operasi</Badge>
      case "surgery_completed":
        return <Badge className="bg-green-600 hover:bg-green-700 text-white">Operasi Selesai (PACU)</Badge>
      case "post_operative":
        return <Badge className="bg-purple-600 hover:bg-purple-700 text-white">Selesai Pemulihan</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-muted-foreground/10 shadow-sm">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-primary">
            <Activity className="w-5 h-5 text-red-500" /> Control Center Bedah & Kamar Operasi (OK)
          </h2>
          <p className="text-sm text-foreground/60">Monitored by Nurse • Standard Alur Kemenkes Satu Sehat</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh()} className="h-9">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh Data
        </Button>
      </div>

      {hookError && (
        <Alert variant="destructive"><AlertDescription>{hookError}</AlertDescription></Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 max-w-2xl bg-muted/40 p-1 rounded-xl">
          <TabsTrigger value="requested" className="rounded-lg py-2">
            Permintaan Operasi
            {pendingRequests.length > 0 && (
              <Badge variant="destructive" className="ml-2 px-1.5 py-0 h-5 text-xs font-semibold shrink-0 animate-bounce bg-red-500">{pendingRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="rounded-lg py-2">
            Jadwal & Antrian Hari Ini
            {activeSchedules.filter(r => r.status === "intra_operative").length > 0 && (
              <span className="w-2.5 h-2.5 ml-2 rounded-full bg-amber-500 animate-ping" />
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg py-2">Riwayat Tindakan</TabsTrigger>
        </TabsList>

        {/* ── TAB 1: PENDING REQUESTS ── */}
        <TabsContent value="requested" className="mt-4">
          <Card className="border border-muted-foreground/10 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/10 border-b">
              <CardTitle className="text-md font-semibold">Daftar Permintaan Operasi Baru</CardTitle>
              <CardDescription>Dokter telah memesan tindakan operasi. Tentukan jadwal, ruangan, dan tim medis.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/5">
                  <TableRow>
                    <TableHead>Pasien</TableHead>
                    <TableHead>Jenis Operasi</TableHead>
                    <TableHead>Indikasi Klinis</TableHead>
                    <TableHead>Dipesan Oleh</TableHead>
                    <TableHead>Rawat Inap Pasca-Op?</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.map((req) => (
                    <TableRow key={req.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="font-semibold">{req.patients?.full_name ?? "—"}</div>
                        <div className="text-xs text-foreground/50">MR: {req.patients?.medical_record_no ?? "—"}</div>
                      </TableCell>
                      <TableCell className="font-medium text-red-600 dark:text-red-400">{req.surgery_type}</TableCell>
                      <TableCell className="italic text-xs text-foreground/70">{req.indication}</TableCell>
                      <TableCell>
                        <div className="text-sm">{req.doctor?.full_name ?? "—"}</div>
                        <div className="text-[10px] text-foreground/40 capitalize">{req.doctor?.role ?? "Dokter"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={req.needs_inpatient_after ? "default" : "outline"} className={req.needs_inpatient_after ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : ""}>
                          {req.needs_inpatient_after ? "Ya (Rawat Inap)" : "Tidak (Rawat Jalan)"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right p-3">
                        <Button
                          size="sm"
                          onClick={() => {
                            setScheduleItem(req)
                            setScheduleForm({ date: "", room: "", surgeon: "", anesthesiologist: "" })
                            setFormError("")
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm"
                        >
                          <Calendar className="w-3.5 h-3.5 mr-1" /> Jadwalkan
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pendingRequests.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40 text-center text-foreground/40 bg-muted/5">
                        <ClipboardList className="w-8 h-8 mx-auto mb-2 text-foreground/20" />
                        Belum ada permintaan operasi baru.
                      </TableCell>
                    </TableRow>
                  )}
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40 text-center text-foreground/50 bg-muted/5">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: ACTIVE SCHEDULES ── */}
        <TabsContent value="scheduled" className="mt-4">
          <Card className="border border-muted-foreground/10 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/10 border-b">
              <CardTitle className="text-md font-semibold">Alur Operasi & Monitoring Antrian</CardTitle>
              <CardDescription>Kelola transisi klinis pasien di ruang OK mulai dari pra-bedah, eksekusi medis, hingga pemulihan.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/5">
                  <TableRow>
                    <TableHead>Pasien / OR</TableHead>
                    <TableHead>Jenis Operasi</TableHead>
                    <TableHead>Jadwal</TableHead>
                    <TableHead>Tim Bedah</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Tindakan Klinis / Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeSchedules.map((item) => {
                    const scheduledTime = item.scheduled_date
                      ? new Date(item.scheduled_date).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                      : "—"
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-semibold">{item.patients?.full_name ?? "—"}</div>
                          <div className="text-xs text-foreground/50">MR: {item.patients?.medical_record_no ?? "—"}</div>
                          {item.locations && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                              <ExternalLink className="w-3 h-3" /> {item.locations.name}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{item.surgery_type}</div>
                          {item.anesthesia_type && (
                            <Badge variant="outline" className="text-[10px] mt-0.5 capitalize">Bius: {item.anesthesia_type}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <Clock className="w-3.5 h-3.5 text-foreground/40" /> {scheduledTime}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs space-y-0.5">
                          <div><strong>Bedah:</strong> {item.surgeon?.full_name ?? "—"}</div>
                          <div><strong>Anestesi:</strong> {item.anesthesiologist?.full_name ?? "—"}</div>
                        </TableCell>
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell className="text-right p-3">
                          {/* TRANSITION 1: Scheduled -> Ready (Input Pre-Op Clearance) */}
                          {item.status === "surgery_scheduled" && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setPreOpItem(item)
                                setPreOpForm({ assessment: "", clearance: "layak" })
                                setFormError("")
                              }}
                              className="bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg shadow-sm"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Catat Pra-Bedah
                            </Button>
                          )}

                          {/* TRANSITION 2: Ready -> Ongoing (Mulai Operasi) */}
                          {item.status === "ready_for_surgery" && (
                            <Button
                              size="sm"
                              onClick={() => handleStartSurgery(item)}
                              disabled={actionLoading}
                              className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm animate-pulse"
                            >
                              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />} Mulai Operasi
                            </Button>
                          )}

                          {/* TRANSITION 3: Ongoing -> Completed (Laporan Lunas & Kirim PACU) */}
                          {item.status === "intra_operative" && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setCompleteItem(item)
                                setCompleteForm({ intraNotes: "", postNotes: "" })
                                setFormError("")
                              }}
                              className="bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-sm"
                            >
                              <CheckCircle className="w-3.5 h-3.5 mr-1" /> Selesaikan Operasi
                            </Button>
                          )}

                          {/* TRANSITION 4: Completed -> PACU Observasi */}
                          {item.status === "surgery_completed" && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setPacuItem(item)
                                setPacuForm({ pacuNotes: "" })
                                setFormError("")
                              }}
                              className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-sm"
                            >
                              <Heart className="w-3.5 h-3.5 mr-1" /> Catat Pemulihan (PACU)
                            </Button>
                          )}

                          {/* TRANSITION 5: Post-Operative -> Inpatient Room / Discharge */}
                          {item.status === "post_operative" && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setDischargeItem(item)
                                setWardForm({ wardRoom: "", bedNumber: "", roomClass: "kelas_3" })
                                setFormError("")
                              }}
                              className="bg-zinc-800 hover:bg-zinc-900 text-white dark:bg-zinc-200 dark:hover:bg-zinc-100 dark:text-zinc-950 rounded-lg shadow-sm"
                            >
                              <LogOut className="w-3.5 h-3.5 mr-1" /> Proses Pemulangan
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {activeSchedules.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40 text-center text-foreground/40 bg-muted/5">
                        <ClipboardList className="w-8 h-8 mx-auto mb-2 text-foreground/20" />
                        Tidak ada antrian operasi hari ini.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: COMPLETED HISTORY ── */}
        <TabsContent value="history" className="mt-4">
          <Card className="border border-muted-foreground/10 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/10 border-b">
              <CardTitle className="text-md font-semibold">Riwayat Tindakan Operasi</CardTitle>
              <CardDescription>Semua tindakan operasi yang telah selesai dilaksanakan dan didokumentasikan di EHR.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/5">
                  <TableRow>
                    <TableHead>Pasien</TableHead>
                    <TableHead>Jenis Operasi</TableHead>
                    <TableHead>Tim Bedah</TableHead>
                    <TableHead>Durasi Operasi</TableHead>
                    <TableHead>Status PACU</TableHead>
                    <TableHead>Satu Sehat Sync</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historicalRequests.map((item) => {
                    const start = item.surgery_start_at ? new Date(item.surgery_start_at) : null
                    const end = item.surgery_end_at ? new Date(item.surgery_end_at) : null
                    let duration = "—"
                    if (start && end) {
                      const diffMins = Math.round((end.getTime() - start.getTime()) / (1000 * 60))
                      duration = `${diffMins} menit`
                    }

                    const formattedPacuOut = item.pacu_discharge_at
                      ? new Date(item.pacu_discharge_at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                      : "—"

                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-semibold">{item.patients?.full_name ?? "—"}</div>
                          <div className="text-xs text-foreground/50">MR: {item.patients?.medical_record_no ?? "—"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-emerald-600 dark:text-emerald-400">{item.surgery_type}</div>
                          <div className="text-[10px] text-foreground/50 italic">{item.indication}</div>
                        </TableCell>
                        <TableCell className="text-xs space-y-0.5">
                          <div><strong>Bedah:</strong> {item.surgeon?.full_name ?? "—"}</div>
                          <div><strong>Anestesi:</strong> {item.anesthesiologist?.full_name ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-sm font-semibold">{duration}</TableCell>
                        <TableCell>
                          <div className="text-xs font-medium">Discharged PACU</div>
                          <div className="text-[10px] text-foreground/40">{formattedPacuOut}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-green-500 text-green-600 bg-green-500/5 font-mono text-[10px]">
                            ✔️ Synced (FHIR Procedure)
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {historicalRequests.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40 text-center text-foreground/40 bg-muted/5">
                        <ClipboardList className="w-8 h-8 mx-auto mb-2 text-foreground/20" />
                        Belum ada riwayat operasi selesai.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── MODAL 1: SCHEDULE SURGERY ── */}
      <Dialog open={!!scheduleItem} onOpenChange={(o) => { if (!o) setScheduleItem(null) }}>
        <DialogContent className="max-w-md rounded-xl p-6">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-500" /> Jadwalkan Tindakan Bedah
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pasien: {scheduleItem?.patients?.full_name} ({scheduleItem?.patients?.medical_record_no})
          </DialogDescription>
          <form onSubmit={handleScheduleSubmit} className="space-y-4 pt-2">
            {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}

            <div className="space-y-1">
              <Label>Tanggal & Jam Operasi *</Label>
              <Input
                type="datetime-local"
                value={scheduleForm.date}
                onChange={(e) => setScheduleForm((p) => ({ ...p, date: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-1">
              <Label>Kamar Bedah (OK Location) *</Label>
              <Select
                value={scheduleForm.room}
                onValueChange={(val) => setScheduleForm((p) => ({ ...p, room: val }))}
              >
                <SelectTrigger><SelectValue placeholder="Pilih Kamar Operasi" /></SelectTrigger>
                <SelectContent>
                  {okRooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>{room.name} {room.floor ? `· Lantai ${room.floor}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Dokter Spesialis Bedah (Surgeon) *</Label>
              <Select
                value={scheduleForm.surgeon}
                onValueChange={(val) => setScheduleForm((p) => ({ ...p, surgeon: val }))}
              >
                <SelectTrigger><SelectValue placeholder="Pilih Dokter Bedah" /></SelectTrigger>
                <SelectContent>
                  {doctors.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>{doc.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Dokter Anestesi (Anesthesiologist) *</Label>
              <Select
                value={scheduleForm.anesthesiologist}
                onValueChange={(val) => setScheduleForm((p) => ({ ...p, anesthesiologist: val }))}
              >
                <SelectTrigger><SelectValue placeholder="Pilih Dokter Anestesi" /></SelectTrigger>
                <SelectContent>
                  {doctors.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>{doc.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setScheduleItem(null)} disabled={actionLoading}>Batal</Button>
              <Button type="submit" disabled={actionLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan Jadwal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── MODAL 2: PRE-OP ASSESSMENT ── */}
      <Dialog open={!!preOpItem} onOpenChange={(o) => { if (!o) setPreOpItem(null) }}>
        <DialogContent className="max-w-md rounded-xl p-6">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-500" /> Catat Asesmen Pra-Bedah
          </DialogTitle>
          <DialogDescription className="text-xs">
            Verifikasi tanda vital, kelayakan medis, dan surat persetujuan (informed consent).
          </DialogDescription>
          <form onSubmit={handlePreOpSubmit} className="space-y-4 pt-2">
            {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}

            <div className="space-y-1">
              <Label>Kelayakan Medis (Clearance) *</Label>
              <Select
                value={preOpForm.clearance}
                onValueChange={(val) => setPreOpForm((p) => ({ ...p, clearance: val }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="layak">Layak (Clear / Fit for Surgery)</SelectItem>
                  <SelectItem value="layak_dengan_catatan">Layak dengan Catatan (Fit with Cautions)</SelectItem>
                  <SelectItem value="ditunda">Ditunda (Unfit / Postponed)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Catatan Asesmen Pra-Bedah *</Label>
              <Textarea
                rows={4}
                value={preOpForm.assessment}
                onChange={(e) => setPreOpForm((p) => ({ ...p, assessment: e.target.value }))}
                placeholder="Ex: Tensi stabil 120/80, puasa 6 jam lengkap, informed consent ditandatangani keluarga..."
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setPreOpItem(null)} disabled={actionLoading}>Batal</Button>
              <Button type="submit" disabled={actionLoading} className="bg-cyan-600 hover:bg-cyan-700 text-white">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Nyatakan Siap"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── MODAL 3: COMPLETE SURGERY & ENTER REPORTS ── */}
      <Dialog open={!!completeItem} onOpenChange={(o) => { if (!o) setCompleteItem(null) }}>
        <DialogContent className="max-w-lg rounded-xl p-6">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" /> Selesaikan Operasi & Laporan Bedah
          </DialogTitle>
          <DialogDescription className="text-xs">
            Masukkan catatan intra-operasi dan rencana klinis untuk diarsipkan ke rekam medis / Procedure EHR.
          </DialogDescription>
          <form onSubmit={handleCompleteSurgerySubmit} className="space-y-4 pt-2">
            {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}

            <div className="space-y-1">
              <Label>Laporan & Catatan Intra-Operasi *</Label>
              <Textarea
                rows={4}
                value={completeForm.intraNotes}
                onChange={(e) => setCompleteForm((p) => ({ ...p, intraNotes: e.target.value }))}
                placeholder="Catat rincian pembedahan, perdarahan, implan yang dipasang, dll..."
                required
              />
            </div>

            <div className="space-y-1">
              <Label>Instruksi Klinis Pasca-Operasi *</Label>
              <Textarea
                rows={3}
                value={completeForm.postNotes}
                onChange={(e) => setCompleteForm((p) => ({ ...p, postNotes: e.target.value }))}
                placeholder="Rencana terapi obat pasca-op, pola diet, jadwal ganti perban, dll..."
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setCompleteItem(null)} disabled={actionLoading}>Batal</Button>
              <Button type="submit" disabled={actionLoading} className="bg-green-600 hover:bg-green-700 text-white">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Selesai & Kirim ke PACU"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── MODAL 4: PACU OBS & RECOVERY NOTES ── */}
      <Dialog open={!!pacuItem} onOpenChange={(o) => { if (!o) setPacuItem(null) }}>
        <DialogContent className="max-w-md rounded-xl p-6">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Heart className="w-5 h-5 text-purple-500" /> Observasi Ruang Pemulihan (PACU)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pasien diobservasi di Post-Anesthesia Care Unit hingga tanda vital dan kesadaran pulih sepenuhnya.
          </DialogDescription>
          <form onSubmit={handlePacuSubmit} className="space-y-4 pt-2">
            {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}

            <div className="space-y-1">
              <Label>Catatan Observasi Pemulihan (PACU) *</Label>
              <Textarea
                rows={4}
                value={pacuForm.pacuNotes}
                onChange={(e) => setPacuForm((p) => ({ ...p, pacuNotes: e.target.value }))}
                placeholder="Skor Aldrete pulih (kesadaran penuh, pernapasan adekuat, TD stabil), nyeri minimal..."
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setPacuItem(null)} disabled={actionLoading}>Batal</Button>
              <Button type="submit" disabled={actionLoading} className="bg-purple-600 hover:bg-purple-700 text-white">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Nyatakan Stabil & Keluar PACU"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── MODAL 5: FINAL DISPOSITION (TRANSFER / DISCHARGE) ── */}
      <Dialog open={!!dischargeItem} onOpenChange={(o) => { if (!o) setDischargeItem(null) }}>
        <DialogContent className="max-w-md rounded-xl p-6">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <LogOut className="w-5 h-5 text-foreground" /> Alur Pemulangan & Kamar Perawatan
          </DialogTitle>
          <DialogDescription className="text-xs">
            Tentukan tujuan pemindahan pasien setelah keluar dari ruang pemulihan bedah.
          </DialogDescription>
          <form onSubmit={handleFinalDischargeSubmit} className="space-y-4 pt-2">
            {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}

            {/* CASE A: Pasien dari rawat inap ATAU butuh rawat inap pasca-op */}
            {dischargeItem?.needs_inpatient_after ? (
              <div className="space-y-4 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400">
                  <BedDouble className="w-4 h-4" /> Alokasi Kamar Rawat Inap Pasca-Operasi
                </div>

                {dischargeItem.episode_of_care_id ? (
                  <div className="text-xs text-foreground/70 space-y-1">
                    <p className="font-medium text-emerald-600">✔️ Pasien sudah terdaftar sebagai Rawat Inap Aktif</p>
                    <p>Pasien akan dikembalikan ke bangsal / bed asal perawatan sebelumnya.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-foreground/60">Pasien berasal dari outpatient. Pilih bangsal & bed rawat inap untuk merawat pasien:</p>
                    <div className="space-y-2">
                      <Label className="text-xs">Pilih Bangsal Perawatan *</Label>
                      <Select
                        value={wardForm.wardRoom}
                        onValueChange={(val) => setWardForm((p) => ({ ...p, wardRoom: val }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Pilih Bangsal" /></SelectTrigger>
                        <SelectContent>
                          {wards.map((ward) => (
                            <SelectItem key={ward.id} value={ward.id}>{ward.name} · Lantai {ward.floor ?? "—"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Nomor Bed *</Label>
                        <Input
                          value={wardForm.bedNumber}
                          onChange={(e) => setWardForm((p) => ({ ...p, bedNumber: e.target.value }))}
                          placeholder="Ex: Bed A1, Bed B"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Kelas Kamar *</Label>
                        <Select
                          value={wardForm.roomClass}
                          onValueChange={(val) => setWardForm((p) => ({ ...p, roomClass: val }))}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vip">VIP</SelectItem>
                            <SelectItem value="kelas_1">Kelas 1</SelectItem>
                            <SelectItem value="kelas_2">Kelas 2</SelectItem>
                            <SelectItem value="kelas_3">Kelas 3 (BPJS)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 text-xs space-y-1 text-green-700 dark:text-green-300">
                <p className="font-semibold">✔️ Pasien Rawat Jalan (Outpatient Discharge)</p>
                <p>Operasi selesai dan masa pemulihan di PACU aman. Pasien dapat dipulangkan langsung ke rumah.</p>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDischargeItem(null)} disabled={actionLoading}>Batal</Button>
              <Button type="submit" disabled={actionLoading} className="bg-zinc-800 hover:bg-zinc-900 text-white dark:bg-zinc-200 dark:hover:bg-zinc-100 dark:text-zinc-950">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : dischargeItem?.needs_inpatient_after ? "Transfer ke Rawat Inap" : "Selesaikan & Pulangkan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
