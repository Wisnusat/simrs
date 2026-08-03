/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useSurgeryDashboard } from "@/hooks/nurse/use-surgery-dashboard"
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
  ShieldCheck, Heart, ClipboardList, RefreshCw, LogOut, ExternalLink,
  Plus, Trash2, UserRound,
} from "lucide-react"
import { ROLE_META, type PerformerRow } from "@/hooks/nurse/use-surgery-dashboard"

export function SurgeryDashboard({ role }: { role: string }) {
  const {
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
    doctors,
    wards,
    scheduleForm,
    setScheduleForm,
    preOpForm,
    setPreOpForm,
    performers,
    performersLoading,
    addPerformer,
    removePerformer,
    updatePerformer,
    pacuForm,
    setPacuForm,
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
  } = useSurgeryDashboard()

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
          {/* <p className="text-sm text-foreground/60">Monitored by Nurse • Standard Alur Kemenkes Satu Sehat</p> */}
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh()} className="h-9">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh Data
        </Button>
      </div>

      {hookError && (
        <Alert variant="destructive"><AlertDescription>{hookError}</AlertDescription></Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 max-w-2xl bg-muted/40 rounded-xl">
          <TabsTrigger value="requested" className="rounded-lg">
            Permintaan Operasi
            {pendingRequests.length > 0 && (
              <Badge variant="destructive" className="ml-2 px-1.5 py-0 h-5 text-xs font-semibold shrink-0 bg-red-500">{pendingRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="rounded-lg">
            Jadwal & Antrian Hari Ini
            {activeSchedules.filter(r => r.status === "intra_operative").length > 0 && (
              <span className="w-2.5 h-2.5 ml-2 rounded-full bg-amber-500 animate-ping" />
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg">Riwayat Tindakan</TabsTrigger>
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
                    <TableHead className="text-center">Pasien</TableHead>
                    <TableHead className="text-center">Jenis Operasi</TableHead>
                    <TableHead className="text-center">Indikasi Klinis</TableHead>
                    <TableHead className="text-center">Dipesan Oleh</TableHead>
                    <TableHead className="text-center">Rawat Inap Pasca-Op?</TableHead>
                    <TableHead className="text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.map((req) => (
                    <TableRow key={req.id} className="hover:bg-muted/30">
                      <TableCell className="text-center">
                        <div className="font-semibold">{req.patients?.full_name ?? "—"}</div>
                        <div className="text-xs text-foreground/50">MR: {req.patients?.medical_record_no ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-center font-medium text-red-600 dark:text-red-400">{req.surgery_type}</TableCell>
                      <TableCell className="text-center italic text-xs text-foreground/70">{req.indication}</TableCell>
                      <TableCell className="text-center">
                        <div className="text-sm">{req.doctor?.full_name ?? "—"}</div>
                        <div className="text-[10px] text-foreground/40 capitalize">{req.doctor?.role ?? "Dokter"}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={req.needs_inpatient_after ? "default" : "outline"} className={req.needs_inpatient_after ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : ""}>
                          {req.needs_inpatient_after ? "Ya (Rawat Inap)" : "Tidak (Rawat Jalan)"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
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
                    <TableHead className="text-center">Pasien / OR</TableHead>
                    <TableHead className="text-center">Jenis Operasi</TableHead>
                    <TableHead className="text-center">Jadwal</TableHead>
                    <TableHead className="text-center">Tim Bedah</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Tindakan Klinis / Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeSchedules.map((item) => {
                    const scheduledTime = item.scheduled_date
                      ? new Date(item.scheduled_date).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                      : "—"
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="text-center">
                          <div className="font-semibold">{item.patients?.full_name ?? "—"}</div>
                          <div className="text-xs text-foreground/50">MR: {item.patients?.medical_record_no ?? "—"}</div>
                          {item.locations && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                              <ExternalLink className="w-3 h-3" /> {item.locations.name}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="font-medium text-foreground">{item.surgery_type}</div>
                          {item.anesthesia_type && (
                            <Badge variant="outline" className="text-[10px] mt-0.5 capitalize">Bius: {item.anesthesia_type}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <Clock className="w-3.5 h-3.5 text-foreground/40" /> {scheduledTime}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div><strong>Bedah:</strong> {item.surgeon?.full_name ?? "—"}</div>
                          <div><strong>Anestesi:</strong> {item.anesthesiologist?.full_name ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-center">{getStatusBadge(item.status)}</TableCell>
                        <TableCell className="text-center p-3">
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
                          {item.status === "ready_for_surgery" && role === "doctor" && (
                            <Button
                              size="sm"
                              onClick={() => handleStartSurgery(item)}
                              disabled={actionLoading}
                              className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm animate-pulse"
                            >
                              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />} Mulai Operasi
                            </Button>
                          )}

                          {/* TRANSITION 3: Ongoing -> Completed (Laporan Bedah & Anestesi) */}
                          {item.status === "intra_operative" && role === "doctor" && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setCompleteItem(item)
                                setFormError("")
                              }}
                              className="bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-sm"
                            >
                              <CheckCircle className="w-3.5 h-3.5 mr-1" /> Selesaikan Operasi
                            </Button>
                          )}

                          {/* TRANSITION 5: Post-Operative -> Inpatient Room / Discharge */}
                          {item.status === "post_operative" && role === "doctor" && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setDischargeItem(item)
                                setFormError("")
                              }}
                              className="bg-zinc-800 hover:bg-zinc-900 text-white dark:bg-zinc-200 dark:hover:bg-zinc-100 dark:text-zinc-950 rounded-lg shadow-sm"
                            >
                              <BedDouble className="w-3.5 h-3.5 mr-1" /> Pindahkan ke Rawat Inap
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
                          {item.ss_sync_status === 'synced' ? (
                            <Badge variant="outline" className="border-green-500 text-green-600 bg-green-500/5 font-mono text-[10px]">✔ Synced</Badge>
                          ) : item.ss_sync_status === 'failed' ? (
                            <Badge variant="outline" className="border-red-500 text-red-600 bg-red-500/5 font-mono text-[10px]">✗ Failed</Badge>
                          ) : item.ss_sync_status === 'dead' ? (
                            <Badge variant="outline" className="border-zinc-400 text-zinc-500 font-mono text-[10px]">Dead</Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-400 text-amber-600 bg-amber-500/5 font-mono text-[10px]">Pending</Badge>
                          )}
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

            <div className="space-y-2">
              <Label>Tanggal & Jam Operasi *</Label>
              <Input
                type="datetime-local"
                value={scheduleForm.date}
                onChange={(e) => setScheduleForm((p) => ({ ...p, date: e.target.value }))}
                required
              />
            </div>

            {/* <div className="space-y-1">
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
            </div> */}

            <div className="space-y-2">
              <Label>Dokter Penanggung Jawab Pelayanan (DPJP) *</Label>
              <Select
                value={scheduleForm.surgeon}
                onValueChange={(val) => setScheduleForm((p) => ({ ...p, surgeon: val }))}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Pilih Dokter Penanggung Jawab Pelayanan" /></SelectTrigger>
                <SelectContent>
                  {doctors.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>{doc.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Dokter Anestesi (Anesthesiologist) *</Label>
              <Select
                value={scheduleForm.anesthesiologist}
                onValueChange={(val) => setScheduleForm((p) => ({ ...p, anesthesiologist: val }))}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Pilih Dokter Anestesi" /></SelectTrigger>
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
        <DialogContent className="max-w-2xl rounded-xl p-6 max-h-[90vh] flex flex-col">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 shrink-0">
            <CheckCircle className="w-5 h-5 text-green-500" /> Selesaikan Operasi & Laporan Tim Medis
          </DialogTitle>
          <DialogDescription className="text-xs shrink-0">
            Isi catatan pre-op dan post-op untuk setiap anggota tim. Laporan post-op DPJP dan Anestesi wajib diisi sebelum submit.
          </DialogDescription>

          <form onSubmit={handleCompleteSurgerySubmit} className="flex flex-col flex-1 min-h-0 pt-2">
            {formError && <Alert variant="destructive" className="mb-3 shrink-0"><AlertDescription>{formError}</AlertDescription></Alert>}

            {/* Performer cards — scrollable */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {performersLoading ? (
                <div className="flex items-center gap-2 py-8 justify-center text-foreground/50">
                  <Loader2 className="w-4 h-4 animate-spin" /> Memuat data tim...
                </div>
              ) : (
                performers.map((performer, index) => {
                  const meta = ROLE_META[performer.role] ?? ROLE_META.other
                  const isRequired = performer.role === "dpjp" || performer.role === "anesthesiologist"
                  return (
                    <div key={index} className="border rounded-lg p-4 space-y-3">
                      {/* Header row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <UserRound className="w-4 h-4 text-foreground/40 shrink-0" />
                        <Select
                          value={performer.role}
                          onValueChange={(v) => updatePerformer(index, {
                            role: v as PerformerRow["role"],
                          })}
                        >
                          <SelectTrigger className="w-44 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(ROLE_META).map(([key, m]) => (
                              <SelectItem key={key} value={key} className="text-xs">{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                        <Input
                          className="h-7 text-xs flex-1 min-w-32"
                          placeholder="Nama dokter / staf *"
                          value={performer.display_name}
                          onChange={(e) => updatePerformer(index, { display_name: e.target.value })}
                        />
                        {!isRequired && (
                          <Button
                            type="button" variant="ghost" size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                            onClick={() => removePerformer(index)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {isRequired && <span className="text-[10px] text-foreground/40 ml-auto shrink-0">Wajib</span>}
                      </div>

                      {/* Notes */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-foreground/60">Catatan Pre-Operatif</Label>
                          <Textarea
                            rows={3}
                            className="text-xs resize-none"
                            placeholder="Persiapan, asesmen, rencana tindakan sebelum operasi..."
                            value={performer.pre_op_notes}
                            onChange={(e) => updatePerformer(index, { pre_op_notes: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-foreground/60">
                            Laporan Post-Operatif {isRequired && <span className="text-red-500">*</span>}
                          </Label>
                          <Textarea
                            rows={3}
                            className="text-xs resize-none"
                            placeholder={
                              performer.role === "dpjp"
                                ? "Laporan pembedahan detail, teknik, temuan intra-op..."
                                : performer.role === "anesthesiologist"
                                  ? "Tipe anestesi, hemodinamik, obat, waktu induksi/ekstubasi..."
                                  : "Catatan post-operatif..."
                            }
                            value={performer.post_op_notes}
                            onChange={(e) => updatePerformer(index, { post_op_notes: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPerformer}
                className="w-full text-xs h-8 border-dashed"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Tambah Anggota Tim
              </Button>
            </div>

            <DialogFooter className="pt-4 flex gap-2 justify-end border-t mt-4 shrink-0">
              <Button type="button" variant="outline" onClick={() => setCompleteItem(null)} disabled={actionLoading}>
                Batal
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleSaveDraft}
                disabled={actionLoading}
                className="bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/30 dark:text-amber-300 border-none"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan Draft"}
              </Button>
              <Button
                type="submit"
                disabled={actionLoading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Laporan"}
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
                  <div className="text-xs text-foreground/70 space-y-1">
                    <p className="font-medium text-blue-600">Permintaan Rawat Inap akan dikirim ke Perawat</p>
                    <p>Alokasi kamar dan bed akan dilakukan oleh perawat melalui menu <span className="font-semibold">Permintaan Rawat Inap</span>.</p>
                  </div>
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
