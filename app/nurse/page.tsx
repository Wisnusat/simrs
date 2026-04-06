/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import DashboardLayout from "@/components/system/dashboard-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { HospitalStorage } from "@/lib/storage"
import { initializeDummyData } from "@/lib/dummy-data"
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Heart,
  LayoutDashboard,
  Plus,
  Ruler,
  Search,
  Thermometer,
  Users,
  Weight,
} from "lucide-react"
import { useEffect, useState } from "react"

interface VitalSigns {
  id: string
  patientId: string
  patientName: string
  appointmentId: string
  date: string
  time: string
  bloodPressure: string
  heartRate: number
  temperature: number
  respiration: number
  weight: number
  height: number
  nurseId: string
  nurseName: string
}

export default function NurseDashboard() {
  const [activeView, setActiveView] = useState("dashboard")
  const [patients, setPatients] = useState<any[]>([])
  const [vitalSigns, setVitalSigns] = useState<VitalSigns[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [showVitalSignsForm, setShowVitalSignsForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const storage = HospitalStorage.getInstance()

  const sidebarItems = [
    {
      icon: LayoutDashboard,
      label: "Dashboard",
      active: activeView === "dashboard",
      onClick: () => setActiveView("dashboard"),
    },
    {
      icon: Users,
      label: "Antrian Pasien",
      active: activeView === "queue",
      onClick: () => setActiveView("queue"),
    },
    {
      icon: Activity,
      label: "Input Tanda Vital",
      active: activeView === "vital-signs",
      onClick: () => setActiveView("vital-signs"),
    },
    {
      icon: Heart,
      label: "Riwayat Tanda Vital",
      active: activeView === "history",
      onClick: () => setActiveView("history"),
    },
  ]

  useEffect(() => {
    // Initialize dummy data if needed
    initializeDummyData()
    loadData()
  }, [])

  const loadData = () => {
    // Load today's appointments
    const allAppointments = storage.getAll("appointments")
    const todayDate = new Date().toISOString().split("T")[0]
    const todayAppointments = allAppointments.filter((apt: any) => apt.date === todayDate)
    
    // Get all vital signs to determine patient status
    const allVitalSigns = storage.getAll("vitalSigns")
    
    // Categorize patients by status
    const waitingPatients = todayAppointments.filter((apt: any) => {
      return !allVitalSigns.find((vs: any) => vs.patientId === apt.patientId)
    })
    
    const inProgressPatients = todayAppointments.filter((apt: any) => {
      return allVitalSigns.find((vs: any) => vs.patientId === apt.patientId) && 
             !storage.getAll("medicalRecords").find((mr: any) => mr.patientId === apt.patientId)
    })
    
    const completedPatients = todayAppointments.filter((apt: any) => {
      return storage.getAll("medicalRecords").find((mr: any) => mr.patientId === apt.patientId)
    })
    
    setPatients([...waitingPatients, ...inProgressPatients, ...completedPatients])

    // Load existing vital signs
    const allVitalSignsTyped = storage.getAll("vitalSigns") as VitalSigns[]
    setVitalSigns(allVitalSignsTyped)
  }

  const getPatientStatus = (patient: any) => {
    const vitalSigns = storage.getAll("vitalSigns").find((vs: any) => vs.patientId === patient.patientId)
    const medicalRecord = storage.getAll("medicalRecords").find((mr: any) => mr.patientId === patient.patientId)
    
    if (medicalRecord) return "completed"
    if (vitalSigns) return "in-progress"
    return "waiting"
  }

  const getFilteredPatients = () => {
    return patients.filter(
      (patient) =>
        patient.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        patient.complaint.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }

  const getFilteredVitalSigns = () => {
    return vitalSigns.filter(
      (vs) =>
        vs.patientName.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }

  const getStats = () => {
    return {
      totalPatients: patients.length,
      vitalSignsRecorded: vitalSigns.length,
      waitingForVitalSigns: patients.filter((p) => getPatientStatus(p) === "waiting").length,
      inProgress: patients.filter((p) => getPatientStatus(p) === "in-progress").length,
      completedToday: vitalSigns.filter((vs) => vs.date === new Date().toISOString().split("T")[0]).length,
    }
  }

  const stats = getStats()

  const callNextPatient = () => {
    const waitingPatients = patients.filter((p) => getPatientStatus(p) === "waiting")
    if (waitingPatients.length > 0) {
      const nextPatient = waitingPatients[0]
      setSelectedPatient(nextPatient)
      setShowVitalSignsForm(true)
    }
  }

  const VitalSignsForm = () => {
    const [formData, setFormData] = useState({
      bloodPressure: "",
      heartRate: "",
      temperature: "",
      respiration: "",
      weight: "",
      height: "",
    })

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault()
      setLoading(true)
      setError("")

      try {
        // Validate required fields
        if (!formData.bloodPressure || !formData.heartRate || !formData.temperature) {
          throw new Error("Tekanan darah, detak jantung, dan suhu wajib diisi")
        }

        // Get current user session
        const userSession = localStorage.getItem("userSession")
        if (!userSession) {
          throw new Error("Anda harus login terlebih dahulu")
        }

        const session = JSON.parse(userSession)
        const users = storage.getAll("users")
        const currentNurse: any = users.find((u: any) => u.username === session.username)

        if (!currentNurse) {
          throw new Error("Data perawat tidak ditemukan")
        }

        // Create vital signs record
        const vitalSignsRecord: VitalSigns = {
          id: "VS" + storage.generateId(),
          patientId: selectedPatient.patientId,
          patientName: selectedPatient.patientName,
          appointmentId: selectedPatient.id,
          date: new Date().toISOString().split("T")[0],
          time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          bloodPressure: formData.bloodPressure,
          heartRate: Number.parseInt(formData.heartRate),
          temperature: Number.parseFloat(formData.temperature),
          respiration: formData.respiration ? Number.parseInt(formData.respiration) : 0,
          weight: formData.weight ? Number.parseFloat(formData.weight) : 0,
          height: formData.height ? Number.parseFloat(formData.height) : 0,
          nurseId: currentNurse.id,
          nurseName: currentNurse.name,
        }

        // Save vital signs
        storage.create("vitalSigns", vitalSignsRecord)

        // Update appointment status to show vital signs have been recorded
        storage.update("appointments", selectedPatient.id, {} as any)

        // Reset form and reload data
        setFormData({
          bloodPressure: "",
          heartRate: "",
          temperature: "",
          respiration: "",
          weight: "",
          height: "",
        })

        setShowVitalSignsForm(false)
        setSelectedPatient(null)
        loadData()

      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    const handleChange = (field: string, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
    }

    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Input Tanda Vital Pasien</CardTitle>
          <CardDescription>
            Pasien: {selectedPatient?.patientName} - #{selectedPatient?.queueNumber}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bloodPressure">
                  <Heart className="w-4 h-4 inline mr-1" />
                  Tekanan Darah
                </Label>
                <Input
                  id="bloodPressure"
                  value={formData.bloodPressure}
                  onChange={(e) => handleChange("bloodPressure", e.target.value)}
                  placeholder="120/80"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="heartRate">
                  <Heart className="w-4 h-4 inline mr-1" />
                  Detak Jantung (bpm)
                </Label>
                <Input
                  id="heartRate"
                  type="number"
                  value={formData.heartRate}
                  onChange={(e) => handleChange("heartRate", e.target.value)}
                  placeholder="80"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="temperature">
                  <Thermometer className="w-4 h-4 inline mr-1" />
                  Suhu (°C)
                </Label>
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => handleChange("temperature", e.target.value)}
                  placeholder="36.5"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="respiration">
                  <Activity className="w-4 h-4 inline mr-1" />
                  Pernapasan (/menit)
                </Label>
                <Input
                  id="respiration"
                  type="number"
                  value={formData.respiration}
                  onChange={(e) => handleChange("respiration", e.target.value)}
                  placeholder="20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="weight">
                  <Weight className="w-4 h-4 inline mr-1" />
                  Berat Badan (kg)
                </Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.1"
                  value={formData.weight}
                  onChange={(e) => handleChange("weight", e.target.value)}
                  placeholder="65"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="height">
                  <Ruler className="w-4 h-4 inline mr-1" />
                  Tinggi Badan (cm)
                </Label>
                <Input
                  id="height"
                  type="number"
                  value={formData.height}
                  onChange={(e) => handleChange("height", e.target.value)}
                  placeholder="170"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowVitalSignsForm(false)
                  setSelectedPatient(null)
                }}
                className="flex-1"
              >
                Batal
              </Button>
              <Button type="submit" disabled={loading} className="flex-1 bg-pink-600 hover:bg-pink-700">
                {loading ? "Menyimpan..." : "Simpan Tanda Vital"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    )
  }

  const renderDashboard = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard Perawat</h2>
        <p className="text-foreground/60">Kelola tanda vital pasien rawat jalan</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground/60">Total Pasien</p>
                <p className="text-2xl font-bold">{stats.totalPatients}</p>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground/60">Menunggu Tanda Vital</p>
                <p className="text-2xl font-bold text-orange-600">{stats.waitingForVitalSigns}</p>
              </div>
              <Clock className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground/60">Sudah Dicatat</p>
                <p className="text-2xl font-bold text-green-600">{stats.vitalSignsRecorded}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground/60">Hari Ini</p>
                <p className="text-2xl font-bold text-pink-600">{stats.completedToday}</p>
              </div>
              <Activity className="w-8 h-8 text-pink-600" />
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
            <Button onClick={() => setActiveView("queue")} className="h-20 flex-col gap-2">
              <Users className="w-6 h-6" />
              Antrian Pasien
            </Button>
            <Button onClick={callNextPatient} className="h-20 flex-col gap-2 bg-green-600 hover:bg-green-700">
              <Plus className="w-6 h-6" />
              Panggil Pasien
            </Button>
            <Button onClick={() => setActiveView("vital-signs")} className="h-20 flex-col gap-2" variant="outline">
              <Heart className="w-6 h-6" />
              Input Tanda Vital
            </Button>
            <Button onClick={() => setActiveView("history")} className="h-20 flex-col gap-2" variant="outline">
              <Activity className="w-6 h-6" />
              Riwayat
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderQueue = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Antrian Pasien</h2>
          <p className="text-foreground/60">Pasien yang menunggu input tanda vital</p>
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
            <Badge variant="outline">{getFilteredPatients().length} pasien</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {getFilteredPatients().map((patient, index) => (
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
                  {(() => {
                    const status = getPatientStatus(patient)
                    switch (status) {
                      case "waiting":
                        return (
                          <Badge variant="outline">
                            <Clock className="w-3 h-3 mr-1" />
                            Menunggu Tanda Vital
                          </Badge>
                        )
                      case "in-progress":
                        return (
                          <Badge variant="secondary">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Sedang Diperiksa
                          </Badge>
                        )
                      case "completed":
                        return (
                          <Badge variant="default">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Selesai
                          </Badge>
                        )
                      default:
                        return null
                    }
                  })()}
                  {getPatientStatus(patient) === "waiting" && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedPatient(patient)
                        setShowVitalSignsForm(true)
                      }}
                      className="bg-pink-600 hover:bg-pink-700"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Input Tanda Vital
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Vital Signs Form Dialog */}
      <Dialog open={showVitalSignsForm} onOpenChange={setShowVitalSignsForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogTitle>Input Tanda Vital</DialogTitle>
          {selectedPatient && <VitalSignsForm />}
        </DialogContent>
      </Dialog>
    </div>
  )

  const renderHistory = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Riwayat Tanda Vital</h2>
          <p className="text-foreground/60">Riwayat perekaman tanda vital pasien</p>
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
            <Badge variant="outline">{getFilteredVitalSigns().length} catatan</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Nama Pasien</TableHead>
                <TableHead>Tekanan Darah</TableHead>
                <TableHead>Detak Jantung</TableHead>
                <TableHead>Suhu</TableHead>
                <TableHead>Perawat</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {getFilteredVitalSigns().map((vs, index) => (
                <TableRow key={index}>
                  <TableCell>{vs.date} {vs.time}</TableCell>
                  <TableCell className="font-medium">{vs.patientName}</TableCell>
                  <TableCell>{vs.bloodPressure}</TableCell>
                  <TableCell>{vs.heartRate} bpm</TableCell>
                  <TableCell>{vs.temperature}°C</TableCell>
                  <TableCell>{vs.nurseName}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline">
                      <Activity className="w-4 h-4 mr-1" />
                      Detail
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <DashboardLayout
      title="Perawat"
      role="nurse"
      sidebarItems={sidebarItems}
    >
      {activeView === "dashboard" && renderDashboard()}
      {activeView === "queue" && renderQueue()}
      {activeView === "vital-signs" && renderQueue()}
      {activeView === "history" && renderHistory()}
    </DashboardLayout>
  )
}
