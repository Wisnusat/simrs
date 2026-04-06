/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/system/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import PrescriptionForm from "@/components/doctor/prescription-form"
import { HospitalStorage } from "@/lib/storage"
import { initializeDummyData } from "@/lib/dummy-data"
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Pill,
  History,
  FileText,
  UserCircle,
  Clock,
  Plus,
  Search,
  Edit,
  Eye,
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import ExaminationForm from "@/components/doctor/examination-form"
import MedicalNoteForm from "@/components/doctor/medical-note-form"
import { Appointment, Inpatient } from "@/lib/types"

export default function DoctorDashboard() {
  const [activeView, setActiveView] = useState("dashboard")
  const [appointments, setAppointments] = useState<any[]>([])
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [medicalRecords, setMedicalRecords] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [showExaminationForm, setShowExaminationForm] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null)
  const [dateFilter, setDateFilter] = useState("all")
  // Tambahkan state untuk rawat inap dan rujukan
  const [inpatients, setInpatients] = useState<any[]>([])
  const [referrals, setReferrals] = useState<any[]>([])

  const storage = HospitalStorage.getInstance()

  // Update sidebarItems untuk menambahkan menu baru
  const sidebarItems = [
    {
      icon: LayoutDashboard,
      label: "Dashboard",
      active: activeView === "dashboard",
      onClick: () => setActiveView("dashboard"),
    },
    {
      icon: Users,
      label: "Pasien Hari Ini",
      active: activeView === "patients",
      onClick: () => setActiveView("patients"),
    },
    {
      icon: History,
      label: "Riwayat Pemeriksaan",
      active: activeView === "history",
      onClick: () => setActiveView("history"),
    },
    {
      icon: ClipboardList,
      label: "Rawat Inap",
      active: activeView === "inpatients",
      onClick: () => setActiveView("inpatients"),
    },
    {
      icon: FileText,
      label: "Rujukan",
      active: activeView === "referrals",
      onClick: () => setActiveView("referrals"),
    },
    {
      icon: Pill,
      label: "Resep Obat",
      active: activeView === "prescriptions",
      onClick: () => setActiveView("prescriptions"),
    },
    { icon: FileText, label: "Catatan Medis", active: activeView === "notes", onClick: () => setActiveView("notes") },
    {
      icon: UserCircle,
      label: "Profil Saya",
      active: activeView === "profile",
      onClick: () => setActiveView("profile"),
    },
  ]

  useEffect(() => {
    // Initialize dummy data if needed
    initializeDummyData()
    loadData()
  }, [])

  // Update loadData function untuk memuat data rawat inap dan rujukan
  const loadData = () => {
    const userSession = localStorage.getItem("userSession")
    if (userSession) {
      const session = JSON.parse(userSession)
      const users = storage.getAll("users")
      const currentDoctor: any = users.find((u: any) => u.username === session.username)

      if (currentDoctor) {
        // Filter appointments for current doctor
        const allAppointments = storage.getAll("appointments")
        const doctorAppointments = allAppointments.filter((apt: any) => apt.doctorName === currentDoctor.name)
        setAppointments(doctorAppointments)

        // Filter prescriptions for current doctor
        const allPrescriptions = storage.getAll("prescriptions")
        const doctorPrescriptions = allPrescriptions.filter((presc: any) => presc.doctorId === currentDoctor.id)
        setPrescriptions(doctorPrescriptions)

        // Filter medical records for current doctor
        const allRecords = storage.getAll("medicalRecords")
        const doctorRecords = allRecords.filter((record: any) => record.doctorId === currentDoctor.id)
        setMedicalRecords(doctorRecords)

        // Filter inpatients for current doctor
        const allInpatients = storage.getAll("inpatients")
        const doctorInpatients = allInpatients.filter((inp: any) => inp.doctorId === currentDoctor.id)
        setInpatients(doctorInpatients)

        // Filter referrals for current doctor
        const allReferrals = storage.getAll("referrals")
        const doctorReferrals = allReferrals.filter((ref: any) => ref.doctorId === currentDoctor.id)
        setReferrals(doctorReferrals)
      }
    }
  }

  const handleSave = () => {
    setShowForm(false)
    setSelectedItem(null)
    loadData()
  }

  const handleExaminationSave = () => {
    setShowExaminationForm(false)
    setSelectedAppointment(null)
    // Force reload data after examination is saved
    setTimeout(() => {
      loadData()
      // If we're not already on the history view, switch to it
      if (activeView !== "history") {
        setActiveView("history")
      }
    }, 500)
  }

  const updateAppointmentStatus = (id: string, status: "completed" | "cancelled" | "waiting" | "in-progress") => {
    storage.update<Appointment>("appointments", id, { status })
    loadData()
  }

  const todayDate = new Date().toISOString().split("T")[0]
  const todayAppointments = appointments.filter((apt) => apt.date === todayDate)

  const todaySchedule = {
    doctor: "dr. Budi Santoso",
    poli: "Poli Umum",
    schedule: "Senin - Jumat, 08:00 - 15:00",
    totalPatients: todayAppointments.length,
    completed: todayAppointments.filter((apt) => apt.status === "completed").length,
    remaining: todayAppointments.filter((apt) => apt.status !== "completed" && apt.status !== "cancelled").length,
  }

  const filteredAppointments = todayAppointments.filter(
    (appointment) =>
      appointment.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appointment.complaint.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const filteredPrescriptions = prescriptions.filter(
    (prescription) =>
      prescription.patientName.toLowerCase().includes(searchTerm.toLowerCase()) || prescription.id.includes(searchTerm),
  )

  // Filter medical records based on date filter
  const getFilteredMedicalRecords = () => {
    let filtered = [...medicalRecords]

    // Apply search filter
    filtered = filtered.filter(
      (record) =>
        (record.patientName && record.patientName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (record.diagnosis && record.diagnosis.toLowerCase().includes(searchTerm.toLowerCase())),
    )

    // Apply date filter
    if (dateFilter !== "all") {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const weekAgo = new Date(today)
      weekAgo.setDate(today.getDate() - 7)

      const monthAgo = new Date(today)
      monthAgo.setMonth(today.getMonth() - 1)

      filtered = filtered.filter((record) => {
        const recordDate = new Date(record.date)
        recordDate.setHours(0, 0, 0, 0)

        if (dateFilter === "today") {
          return recordDate.getTime() === today.getTime()
        } else if (dateFilter === "week") {
          return recordDate >= weekAgo
        } else if (dateFilter === "month") {
          return recordDate >= monthAgo
        }
        return true
      })
    }

    return filtered
  }

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Doctor Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <UserCircle className="w-6 h-6 text-green-600" />
            Informasi Dokter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-foreground/60">Nama Dokter</p>
              <p className="font-semibold">{todaySchedule.doctor}</p>
            </div>
            <div>
              <p className="text-sm text-foreground/60">Poli</p>
              <p className="font-semibold">{todaySchedule.poli}</p>
            </div>
            <div>
              <p className="text-sm text-foreground/60">Jadwal Praktek</p>
              <p className="font-semibold">{todaySchedule.schedule}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Today's Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground/60">Total Pasien</p>
                <p className="text-2xl font-bold">{todaySchedule.totalPatients}</p>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground/60">Selesai Diperiksa</p>
                <p className="text-2xl font-bold text-green-600">{todaySchedule.completed}</p>
              </div>
              <ClipboardList className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground/60">Menunggu</p>
                <p className="text-2xl font-bold text-orange-600">{todaySchedule.remaining}</p>
              </div>
              <Clock className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Patients */}
        <Card>
          <CardHeader>
            <CardTitle>Pasien Hari Ini</CardTitle>
            <CardDescription>Daftar pasien yang akan diperiksa</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {todayAppointments.slice(0, 5).map((patient, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">#{patient.queueNumber}</Badge>
                      <div>
                        <p className="font-medium">{patient.patientName}</p>
                        <p className="text-sm text-foreground/60">{patient.complaint}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{patient.time}</p>
                    <Badge
                      variant={
                        patient.status === "completed"
                          ? "default"
                          : patient.status === "in-progress"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {patient.status === "completed"
                        ? "Selesai"
                        : patient.status === "in-progress"
                          ? "Sedang Diperiksa"
                          : "Menunggu"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Prescriptions */}
        <Card>
          <CardHeader>
            <CardTitle>Resep Terbaru</CardTitle>
            <CardDescription>Resep yang baru dibuat</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {prescriptions.slice(0, 5).map((prescription, index) => (
                <div key={index} className="p-3 bg-muted/40 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium">{prescription.patientName}</p>
                    <Badge variant={prescription.status === "dispensed" ? "default" : "secondary"}>
                      {prescription.status === "dispensed" ? "Sudah Diambil" : "Menunggu"}
                    </Badge>
                  </div>
                  <div className="text-sm text-foreground/60">
                    <p>Obat: {prescription.medicines.map((m: any) => m.medicineName).join(", ")}</p>
                    <p>Tanggal: {prescription.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Aksi Cepat</CardTitle>
          <CardDescription>Akses cepat ke fitur utama</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button onClick={() => setActiveView("patients")} className="h-20 flex-col gap-2">
              <Users className="w-6 h-6" />
              Pasien Hari Ini
            </Button>
            <Button onClick={() => setActiveView("prescriptions")} className="h-20 flex-col gap-2" variant="outline">
              <Pill className="w-6 h-6" />
              Buat Resep
            </Button>
            <Button onClick={() => setActiveView("history")} className="h-20 flex-col gap-2" variant="outline">
              <History className="w-6 h-6" />
              Riwayat Pasien
            </Button>
            <Button onClick={() => setActiveView("notes")} className="h-20 flex-col gap-2" variant="outline">
              <FileText className="w-6 h-6" />
              Catatan Medis
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderPatients = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Pasien Hari Ini</h2>
          <p className="text-foreground/60">Kelola pemeriksaan pasien</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-foreground/40 w-4 h-4" />
              <Input
                placeholder="Cari pasien..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Badge variant="outline">{filteredAppointments.length} pasien</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredAppointments.map((patient, index) => (
              <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <Badge variant="outline" className="text-lg px-3 py-1">
                    #{patient.queueNumber}
                  </Badge>
                  <div>
                    <p className="font-semibold">{patient.patientName}</p>
                    <p className="text-sm text-foreground/60">
                      ID: {patient.patientId} | Jadwal: {patient.time}
                    </p>
                    <p className="text-sm text-foreground/60">Keluhan: {patient.complaint}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      patient.status === "completed"
                        ? "default"
                        : patient.status === "in-progress"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {patient.status === "completed"
                      ? "Selesai"
                      : patient.status === "in-progress"
                        ? "Sedang Diperiksa"
                        : "Menunggu"}
                  </Badge>
                  {patient.status !== "completed" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          updateAppointmentStatus(patient.id, "in-progress")
                          setSelectedAppointment(patient)
                          setShowExaminationForm(true)
                        }}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {patient.status === "in-progress" ? "Lanjut Periksa" : "Mulai Periksa"}
                      </Button>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            <Pill className="w-4 h-4 mr-2" />
                            Resep
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                          <DialogTitle>Resep Obat</DialogTitle>
                          <PrescriptionForm
                            appointmentId={patient.id}
                            patientId={patient.patientId}
                            onSave={() => {
                              updateAppointmentStatus(patient.id, "completed")
                              loadData()
                            }}
                            onCancel={() => {}}
                          />
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {/* Examination Form Dialog */}
      <Dialog open={showExaminationForm} onOpenChange={setShowExaminationForm}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogTitle>Pemeriksaan</DialogTitle>
          {selectedAppointment && (
            <ExaminationForm
              appointment={selectedAppointment}
              onSave={handleExaminationSave}
              onCancel={() => {
                setShowExaminationForm(false)
                setSelectedAppointment(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )

  const renderPrescriptions = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Resep Obat</h2>
          <p className="text-foreground/60">Kelola resep obat untuk pasien</p>
        </div>
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button onClick={() => setSelectedItem(null)} className="bg-[#2E8B57] hover:bg-[#2E8B57]/90">
              <Plus className="w-4 h-4 mr-2" />
              Buat Resep Baru
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogTitle>Buat Resep Baru</DialogTitle>
            <PrescriptionForm prescription={selectedItem} onSave={handleSave} onCancel={() => setShowForm(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-foreground/40 w-4 h-4" />
              <Input
                placeholder="Cari resep..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Badge variant="outline">{filteredPrescriptions.length} resep</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID Resep</TableHead>
                <TableHead>Nama Pasien</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Jumlah Obat</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPrescriptions.map((prescription) => (
                <TableRow key={prescription.id}>
                  <TableCell className="font-medium">{prescription.id}</TableCell>
                  <TableCell>{prescription.patientName}</TableCell>
                  <TableCell>{prescription.date}</TableCell>
                  <TableCell>{prescription.medicines.length} obat</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        prescription.status === "dispensed"
                          ? "default"
                          : prescription.status === "cancelled"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {prescription.status === "dispensed"
                        ? "Sudah Diserahkan"
                        : prescription.status === "cancelled"
                          ? "Dibatalkan"
                          : "Menunggu"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedItem(prescription)
                          setShowForm(true)
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )

  // Tambahkan implementasi untuk Riwayat Pemeriksaan
  const renderHistory = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Riwayat Pemeriksaan</h2>
          <p className="text-foreground/60">Riwayat pemeriksaan pasien sebelumnya</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-foreground/40 w-4 h-4" />
              <Input
                placeholder="Cari pasien atau diagnosis..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter tanggal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hari ini</SelectItem>
                <SelectItem value="week">Minggu ini</SelectItem>
                <SelectItem value="month">Bulan ini</SelectItem>
                <SelectItem value="all">Semua</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {getFilteredMedicalRecords().length > 0 ? (
              getFilteredMedicalRecords().map((record, index) => (
                <Card key={index} className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{record.patientName}</h3>
                      <p className="text-sm text-foreground/60">
                        {record.date} {record.time && `• ${record.time}`}
                      </p>
                    </div>
                    <Badge variant="outline">{record.diagnosis}</Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <div>
                      <p className="text-sm font-medium text-foreground/70">Keluhan:</p>
                      <p className="text-sm">{record.complaint}</p>
                    </div>
                    {record.vitalSigns && (
                      <div>
                        <p className="text-sm font-medium text-foreground/70">Tanda Vital:</p>
                        <p className="text-sm">
                          TD: {record.vitalSigns.bloodPressure || "-"} | Suhu: {record.vitalSigns.temperature || "-"}°C |
                          Nadi: {record.vitalSigns.heartRate || "-"}/mnt
                        </p>
                      </div>
                    )}
                  </div>

                  {record.examination && (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-foreground/70">Pemeriksaan:</p>
                      <p className="text-sm">{record.examination}</p>
                    </div>
                  )}

                  <div className="mb-3">
                    <p className="text-sm font-medium text-foreground/70">Tindakan:</p>
                    <p className="text-sm">{record.treatment}</p>
                  </div>

                  {record.recommendations && (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-foreground/70">Rekomendasi:</p>
                      <p className="text-sm">{record.recommendations}</p>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button size="sm" variant="outline">
                      <Eye className="w-4 h-4 mr-1" />
                      Detail
                    </Button>
                    <Button size="sm" variant="outline">
                      <FileText className="w-4 h-4 mr-1" />
                      Cetak
                    </Button>
                  </div>
                </Card>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-foreground/50">Tidak ada data riwayat pemeriksaan yang ditemukan.</p>
                <p className="text-sm text-foreground/40 mt-1">
                  Coba ubah filter pencarian atau periksa pasien terlebih dahulu.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )

  // Tambahkan implementasi untuk Catatan Medis
  const renderNotes = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Catatan Medis</h2>
          <p className="text-foreground/60">Catatan khusus untuk pasien</p>
        </div>
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button onClick={() => setSelectedItem(null)} className="bg-[#2E8B57] hover:bg-[#2E8B57]/90">
              <Plus className="w-4 h-4 mr-2" />
              Tambah Catatan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogTitle>Catatan Medis</DialogTitle>
            <MedicalNoteForm medicalNote={selectedItem} onSave={handleSave} onCancel={() => setShowForm(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Catatan Medis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {storage
              .getAll("medicalNotes")
              .filter((note: any) => note.doctorId === storage.getCurrentUser()?.id)
              .slice(0, 10)
              .map((note: any, index) => (
                <Card key={index} className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold">{note.patientName}</h3>
                      <p className="text-sm text-foreground/60">{note.date}</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge>{note.diagnosis}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedItem(note)
                          setShowForm(true)
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm mb-2">{note.notes}</p>
                  {note.recommendations && (
                    <p className="text-sm text-foreground/60">
                      <strong>Rekomendasi:</strong> {note.recommendations}
                    </p>
                  )}
                </Card>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )

  // Tambahkan fungsi render untuk rawat inap
  const renderInpatients = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Rawat Inap</h2>
          <p className="text-foreground/60">Kelola pasien rawat inap</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-foreground/40 w-4 h-4" />
              <Input
                placeholder="Cari pasien rawat inap..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Badge variant="outline">{inpatients.length} pasien</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {inpatients
              .filter(
                (patient) =>
                  patient.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  patient.diagnosis.toLowerCase().includes(searchTerm.toLowerCase()),
              )
              .map((patient, index) => (
                <Card key={index} className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{patient.patientName}</h3>
                      <p className="text-sm text-foreground/60">
                        Masuk: {patient.admissionDate} • {patient.admissionTime}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline">Kamar {patient.roomNumber}</Badge>
                      <Badge variant={patient.status === "active" ? "default" : "secondary"}>
                        {patient.status === "active" ? "Aktif" : "Selesai"}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground/70">Diagnosis:</p>
                      <p className="text-sm">{patient.diagnosis}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground/70">Penanggung Jawab:</p>
                      <p className="text-sm">{patient.responsibleFamily || "-"}</p>
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )

  // Tambahkan fungsi render untuk rujukan
  const renderReferrals = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Rujukan</h2>
          <p className="text-foreground/60">Kelola rujukan pasien</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-foreground/40 w-4 h-4" />
              <Input
                placeholder="Cari rujukan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Badge variant="outline">{referrals.length} rujukan</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {referrals
              .filter(
                (referral) =>
                  referral.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  referral.toHospital.toLowerCase().includes(searchTerm.toLowerCase()),
              )
              .map((referral, index) => (
                <Card key={index} className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{referral.patientName}</h3>
                      <p className="text-sm text-foreground/60">
                        Rujukan: {referral.referralDate} • {referral.referralTime}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline">{referral.referralType}</Badge>
                      <Badge
                        variant={
                          referral.status === "completed"
                            ? "default"
                            : referral.status === "accepted"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {referral.status === "completed"
                          ? "Selesai"
                          : referral.status === "accepted"
                            ? "Diterima"
                            : referral.status === "cancelled"
                              ? "Dibatalkan"
                              : "Menunggu"}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <div>
                      <p className="text-sm font-medium text-foreground/70">Diagnosis:</p>
                      <p className="text-sm">{referral.diagnosis}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground/70">Rumah Sakit Tujuan:</p>
                      <p className="text-sm">{referral.toHospital}</p>
                    </div>
                  </div>

                  <div className="mb-3">
                    <p className="text-sm font-medium text-foreground/70">Alasan Rujukan:</p>
                    <p className="text-sm">{referral.reason}</p>
                  </div>

                  {referral.notes && (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-foreground/70">Catatan:</p>
                      <p className="text-sm">{referral.notes}</p>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button size="sm" variant="outline">
                      <Eye className="w-4 h-4 mr-1" />
                      Detail
                    </Button>
                    <Button size="sm" variant="outline">
                      <FileText className="w-4 h-4 mr-1" />
                      Cetak Surat
                    </Button>
                  </div>
                </Card>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )

  // Update renderContent untuk menambahkan case baru
  const renderContent = () => {
    switch (activeView) {
      case "dashboard":
        return renderDashboard()
      case "patients":
        return renderPatients()
      case "prescriptions":
        return renderPrescriptions()
      case "history":
        return renderHistory()
      case "inpatients":
        return renderInpatients()
      case "referrals":
        return renderReferrals()
      case "notes":
        return renderNotes()
      case "profile":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Profil Saya</CardTitle>
              <CardDescription>Edit data pribadi dan jadwal praktek</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-foreground/60">Fitur profil akan dikembangkan lebih lanjut...</p>
            </CardContent>
          </Card>
        )
      default:
        return renderDashboard()
    }
  }

  return (
    <DashboardLayout title="Dashboard Dokter" role="doctor" sidebarItems={sidebarItems}>
      {renderContent()}
    </DashboardLayout>
  )
}
