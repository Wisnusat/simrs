"use client"

import { useState, useEffect } from "react"
import { getAdmissionRequests, postInpatientAssignment, getLocations } from "@/lib/api/client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Loader2, BedDouble } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import type { EpisodeOfCare, Location, InpatientRoomClass } from "@/lib/types/outpatient"
import { PageHeader } from "@/components/shared/page-header"
import { toast } from "sonner"

export function AdmissionRequestsView() {
  const [requests, setRequests] = useState<EpisodeOfCare[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog State
  const [selectedRequest, setSelectedRequest] = useState<EpisodeOfCare | null>(null)
  const [rooms, setRooms] = useState<Location[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)

  // Form State
  const [selectedRoom, setSelectedRoom] = useState<string>("")
  const [bedNumber, setBedNumber] = useState("")
  const [roomClass, setRoomClass] = useState<InpatientRoomClass>("kelas_3")
  const [submitting, setSubmitting] = useState(false)

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const data = await getAdmissionRequests()
      setRequests(data)
    } catch (err) {
      toast.error("Gagal mengambil data permintaan rawat inap")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRequests()
  }, [])

  const handleOpenAssign = async (req: EpisodeOfCare) => {
    setSelectedRequest(req)
    setSelectedRoom("")
    setBedNumber("")
    setRoomClass("kelas_3")
    
    setRoomsLoading(true)
    try {
      const rm = await getLocations({ type: "patient_room" })
      setRooms(rm)
    } catch (err) {
      toast.error("Gagal mengambil daftar kamar")
    } finally {
      setRoomsLoading(false)
    }
  }

  const handleSubmitAssign = async () => {
    if (!selectedRequest || !selectedRoom || !bedNumber.trim()) {
      toast.error("Pilih kamar dan isi nomor bed")
      return
    }

    setSubmitting(true)
    try {
      await postInpatientAssignment({
        episode_of_care_id: selectedRequest.id,
        room_location_id: selectedRoom,
        bed_number: bedNumber,
        room_class: roomClass,
      })
      toast.success("Pasien berhasil ditugaskan ke kamar")
      setSelectedRequest(null)
      fetchRequests()
    } catch (err: any) {
      toast.error(err.message || "Gagal menugaskan kamar")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permintaan Rawat Inap"
        description="Daftar pasien yang membutuhkan alokasi kamar dari dokter"
        onRefresh={fetchRequests}
        isRefreshing={loading}
      />

      <Card>
        <CardHeader>
          <CardTitle>Antrian Permintaan Kamar</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu Permintaan</TableHead>
                <TableHead>Nama Pasien</TableHead>
                <TableHead>No. MR</TableHead>
                <TableHead>Diagnosis Utama</TableHead>
                <TableHead>Dokter (DPJP)</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>{new Date(req.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell className="font-medium">{req.patients.full_name}</TableCell>
                  <TableCell>{req.patients.medical_record_no ?? "—"}</TableCell>
                  <TableCell>{req.diagnosis_primary ?? "—"}</TableCell>
                  <TableCell>{req.dpjp?.full_name ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="default" onClick={() => handleOpenAssign(req)}>
                      <BedDouble className="w-4 h-4 mr-2" /> Tugaskan Kamar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!loading && requests.length === 0 && (
            <EmptyState message="Tidak ada permintaan rawat inap saat ini." />
          )}
          {loading && (
            <div className="py-8 text-center text-sm text-foreground/50">Memuat data...</div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRequest} onOpenChange={(o) => { if (!o) setSelectedRequest(null) }}>
        <DialogContent className="max-w-xl">
          <DialogTitle>Tugaskan Kamar Rawat Inap</DialogTitle>
          <DialogDescription>
            Tentukan kamar dan tempat tidur untuk {selectedRequest?.patients.full_name}
          </DialogDescription>
          
          <div className="space-y-6 mt-4">
            <div className="space-y-2">
              <Label>Pilih Kamar *</Label>
              {roomsLoading ? (
                <div className="flex items-center gap-2 text-sm text-foreground/50">
                  <Loader2 className="w-4 h-4 animate-spin" /> Memuat kamar...
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {rooms.map((room) => {
                    const available = room.capacity - (room.occupied ?? 0)
                    const isFull = available <= 0
                    return (
                      <button
                        key={room.id}
                        type="button"
                        disabled={isFull}
                        className={`p-3 rounded-lg border text-left text-sm transition-all ${
                          selectedRoom === room.id
                            ? "border-blue-500 bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-500"
                            : isFull
                            ? "border-border/40 opacity-50 cursor-not-allowed"
                            : "border-border hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/10"
                        }`}
                        onClick={() => setSelectedRoom(room.id)}
                      >
                        <p className="font-medium">{room.name}</p>
                        <p className="text-xs text-foreground/50">
                          {room.floor ? `Lantai ${room.floor} · ` : ""}
                          Tersedia: {available}/{room.capacity}
                        </p>
                      </button>
                    )
                  })}
                  {rooms.length === 0 && (
                    <p className="text-sm text-foreground/50 col-span-2 text-center py-4">Belum ada kamar tersedia.</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nomor Bed *</Label>
                <Input
                  value={bedNumber}
                  onChange={(e) => setBedNumber(e.target.value)}
                  placeholder="mis. A1, B2"
                />
              </div>

              <div className="space-y-2">
                <Label>Kelas Kamar *</Label>
                <Select value={roomClass} onValueChange={(v) => setRoomClass(v as InpatientRoomClass)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vip">VIP</SelectItem>
                    <SelectItem value="kelas_1">Kelas 1</SelectItem>
                    <SelectItem value="kelas_2">Kelas 2</SelectItem>
                    <SelectItem value="kelas_3">Kelas 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setSelectedRequest(null)} disabled={submitting}>Batal</Button>
              <Button onClick={handleSubmitAssign} disabled={!selectedRoom || !bedNumber.trim() || submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Simpan & Admisi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
