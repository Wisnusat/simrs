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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { HospitalStorage } from "@/lib/storage"
import { initializeDummyData } from "@/lib/dummy-data"
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Eye,
  LayoutDashboard,
  Package,
  PackageOpen,
  Pill,
  Search
} from "lucide-react"
import { useEffect, useState } from "react"

interface PrescriptionDetail {
  id: string
  patientId: string
  patientName: string
  doctorName: string
  date: string
  medicines: Array<{
    medicineId: string
    medicineName: string
    quantity: number
    dosage: string
    stockAvailable: number
  }>
  status: "pending" | "preparing" | "ready" | "dispensed"
  notes: string
  pharmacistId?: string
  pharmacistName?: string
  preparedAt?: string
  dispensedAt?: string
}

export default function PharmacistDashboard() {
  const [activeView, setActiveView] = useState("dashboard")
  const [prescriptions, setPrescriptions] = useState<PrescriptionDetail[]>([])
  const [medicines, setMedicines] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedPrescription, setSelectedPrescription] = useState<PrescriptionDetail | null>(null)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
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
      icon: Pill,
      label: "Resep Obat",
      active: activeView === "prescriptions",
      onClick: () => setActiveView("prescriptions"),
    },
    {
      icon: Package,
      label: "Stok Obat",
      active: activeView === "inventory",
      onClick: () => setActiveView("inventory"),
    },
    {
      icon: PackageOpen,
      label: "Riwayat Penyerahan",
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
    // Load prescriptions
    const allPrescriptions = storage.getAll("prescriptions")
    const allMedicines = storage.getAll("medicines")
    
    // Enrich prescriptions with medicine stock info
    const enrichedPrescriptions = allPrescriptions.map((prescription: any) => {
      const enrichedMedicines = prescription.medicines.map((medicine: any) => {
        const medicineData = allMedicines.find((m: any) => m.id === medicine.medicineId)
        return {
          ...medicine,
          stockAvailable: (medicineData as any)?.stock || 0,
        }
      })
      
      return {
        ...prescription,
        medicines: enrichedMedicines,
      }
    })
    
    setPrescriptions(enrichedPrescriptions)
    setMedicines(allMedicines)
  }

  const getFilteredPrescriptions = () => {
    let filtered = prescriptions

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (prescription) =>
          prescription.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          prescription.doctorName.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((prescription) => prescription.status === statusFilter)
    }

    return filtered
  }

  const getStats = () => {
    const todayDate = new Date().toISOString().split("T")[0]
    const todayPrescriptions = prescriptions.filter((p) => p.date === todayDate)
    
    return {
      totalPrescriptions: prescriptions.length,
      pendingPrescriptions: prescriptions.filter((p) => p.status === "pending").length,
      preparingPrescriptions: prescriptions.filter((p) => p.status === "preparing").length,
      readyPrescriptions: prescriptions.filter((p) => p.status === "ready").length,
      dispensedToday: todayPrescriptions.filter((p) => p.status === "dispensed").length,
      lowStock: medicines.filter((m) => m.stock < 10).length,
    }
  }

  const stats = getStats()

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: "Menunggu", variant: "outline" as const, icon: Clock },
      preparing: { label: "Disiapkan", variant: "secondary" as const, icon: Package },
      ready: { label: "Siap Diambil", variant: "default" as const, icon: CheckCircle },
      dispensed: { label: "Sudah Diambil", variant: "default" as const, icon: CheckCircle },
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    )
  }

  const updatePrescriptionStatus = async (prescriptionId: string, newStatus: string) => {
    setLoading(true)
    setError("")

    try {
      // Get current user session
      const userSession = localStorage.getItem("userSession")
      if (!userSession) {
        throw new Error("Anda harus login terlebih dahulu")
      }

      const session = JSON.parse(userSession)
      const users = storage.getAll("users")
      const currentPharmacist: any = users.find((u: any) => u.username === session.username)

      if (!currentPharmacist) {
        throw new Error("Data apoteker tidak ditemukan")
      }

      // Get prescription details
      const prescription = prescriptions.find((p) => p.id === prescriptionId)
      if (!prescription) {
        throw new Error("Resep tidak ditemukan")
      }

      // Check stock availability when preparing
      if (newStatus === "preparing") {
        for (const medicine of prescription.medicines) {
          if (medicine.stockAvailable < medicine.quantity) {
            throw new Error(`Stok ${medicine.medicineName} tidak mencukupi. Tersedia: ${medicine.stockAvailable}, Dibutuhkan: ${medicine.quantity}`)
          }
        }
      }

      // Update prescription status
      const updateData: any = {
        status: newStatus,
        pharmacistId: currentPharmacist.id,
        pharmacistName: currentPharmacist.name,
      }

      if (newStatus === "preparing") {
        updateData.preparedAt = new Date().toISOString()
      } else if (newStatus === "dispensed") {
        updateData.dispensedAt = new Date().toISOString()
        
        // Deduct stock when dispensing
        for (const medicine of prescription.medicines) {
          const currentMedicine = medicines.find((m) => m.id === medicine.medicineId)
          if (currentMedicine) {
            const newStock = (currentMedicine as any).stock - medicine.quantity
            storage.update("medicines", medicine.medicineId, { stock: newStock } as any)
          }
        }
      }

      storage.update("prescriptions", prescriptionId, updateData)
      
      // Reload data
      loadData()
      
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const PrescriptionDetailDialog = () => {
    if (!selectedPrescription) return null

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nama Pasien</Label>
            <p className="font-semibold">{selectedPrescription.patientName}</p>
          </div>
          <div>
            <Label>Dokter</Label>
            <p className="font-semibold">{selectedPrescription.doctorName}</p>
          </div>
          <div>
            <Label>Tanggal Resep</Label>
            <p className="font-semibold">{selectedPrescription.date}</p>
          </div>
          <div>
            <Label>Status</Label>
            <div className="mt-1">{getStatusBadge(selectedPrescription.status)}</div>
          </div>
        </div>

        {selectedPrescription.notes && (
          <div>
            <Label>Catatan</Label>
            <p className="mt-1 p-3 bg-muted rounded-lg">{selectedPrescription.notes}</p>
          </div>
        )}

        <div>
          <Label>Daftar Obat</Label>
          <div className="mt-2 space-y-2">
            {selectedPrescription.medicines.map((medicine, index) => (
              <Card key={index} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{medicine.medicineName}</p>
                    <p className="text-sm text-foreground/60">
                      Jumlah: {medicine.quantity} | Dosis: {medicine.dosage}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge 
                      variant={medicine.stockAvailable >= medicine.quantity ? "outline" : "destructive"}
                    >
                      Stok: {medicine.stockAvailable}
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {selectedPrescription.status === "pending" && (
          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => updatePrescriptionStatus(selectedPrescription.id, "preparing")}
              disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              {loading ? "Memproses..." : "Mulai Siapkan"}
            </Button>
          </div>
        )}

        {selectedPrescription.status === "preparing" && (
          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => updatePrescriptionStatus(selectedPrescription.id, "ready")}
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {loading ? "Memproses..." : "Tandai Siap"}
            </Button>
          </div>
        )}

        {selectedPrescription.status === "ready" && (
          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => updatePrescriptionStatus(selectedPrescription.id, "dispensed")}
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {loading ? "Memproses..." : "Konfirmasi Penyerahan"}
            </Button>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    )
  }

  const renderDashboard = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard Apoteker</h2>
        <p className="text-foreground/60">Kelola resep dan stok obat</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground/60">Resep Menunggu</p>
                <p className="text-2xl font-bold text-orange-600">{stats.pendingPrescriptions}</p>
              </div>
              <Clock className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground/60">Disiapkan</p>
                <p className="text-2xl font-bold text-blue-600">{stats.preparingPrescriptions}</p>
              </div>
              <Package className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground/60">Siap Diambil</p>
                <p className="text-2xl font-bold text-green-600">{stats.readyPrescriptions}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
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
            <Button onClick={() => setActiveView("prescriptions")} className="h-20 flex-col gap-2">
              <Pill className="w-6 h-6" />
              Resep Obat
            </Button>
            <Button onClick={() => setActiveView("inventory")} className="h-20 flex-col gap-2" variant="outline">
              <Package className="w-6 h-6" />
              Stok Obat
            </Button>
            <Button onClick={() => setActiveView("history")} className="h-20 flex-col gap-2" variant="outline">
              <PackageOpen className="w-6 h-6" />
              Riwayat
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Prescriptions */}
      <Card>
        <CardHeader>
          <CardTitle>Resep Terbaru</CardTitle>
          <CardDescription>Resep yang perlu diproses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {prescriptions
              .filter((p) => p.status !== "dispensed")
              .slice(0, 5)
              .map((prescription, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium">{prescription.patientName}</p>
                      <p className="text-sm text-foreground/60">
                        {prescription.medicines.length} obat • {prescription.doctorName}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(prescription.status)}
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderPrescriptions = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Resep Obat</h2>
          <p className="text-foreground/60">Kelola resep pasien</p>
        </div>
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="pending">Menunggu</SelectItem>
                <SelectItem value="preparing">Disiapkan</SelectItem>
                <SelectItem value="ready">Siap Diambil</SelectItem>
                <SelectItem value="dispensed">Sudah Diambil</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline">{getFilteredPrescriptions().length} resep</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID Resep</TableHead>
                <TableHead>Nama Pasien</TableHead>
                <TableHead>Dokter</TableHead>
                <TableHead>Jumlah Obat</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {getFilteredPrescriptions().map((prescription) => (
                <TableRow key={prescription.id}>
                  <TableCell className="font-medium">{prescription.id}</TableCell>
                  <TableCell>{prescription.patientName}</TableCell>
                  <TableCell>{prescription.doctorName}</TableCell>
                  <TableCell>{prescription.medicines.length} obat</TableCell>
                  <TableCell>{getStatusBadge(prescription.status)}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedPrescription(prescription)
                        setShowDetailDialog(true)
                      }}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Detail
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Prescription Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogTitle>Detail Resep</DialogTitle>
          <PrescriptionDetailDialog />
        </DialogContent>
      </Dialog>
    </div>
  )

  const renderInventory = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Stok Obat</h2>
          <p className="text-foreground/60">Kelola stok obat</p>
        </div>
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {stats.lowStock} obat stok rendah
        </Badge>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Obat</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Stok</TableHead>
                <TableHead>Satuan</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicines.map((medicine, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{medicine.name}</TableCell>
                  <TableCell>{medicine.category}</TableCell>
                  <TableCell>
                    <Badge 
                      variant={medicine.stock < 10 ? "destructive" : "outline"}
                    >
                      {medicine.stock}
                    </Badge>
                  </TableCell>
                  <TableCell>{medicine.unit}</TableCell>
                  <TableCell>
                    {medicine.stock < 10 ? (
                      <Badge variant="destructive">Stok Rendah</Badge>
                    ) : (
                      <Badge variant="outline">Tersedia</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )

  const renderHistory = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Riwayat Penyerahan</h2>
          <p className="text-foreground/60">Riwayat penyerahan obat kepada pasien</p>
        </div>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Nama Pasien</TableHead>
                <TableHead>Apoteker</TableHead>
                <TableHead>Jumlah Obat</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prescriptions
                .filter((p) => p.status === "dispensed")
                .map((prescription) => (
                  <TableRow key={prescription.id}>
                    <TableCell>{prescription.date}</TableCell>
                    <TableCell className="font-medium">{prescription.patientName}</TableCell>
                    <TableCell>{prescription.pharmacistName}</TableCell>
                    <TableCell>{prescription.medicines.length} obat</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline">
                        <Eye className="w-4 h-4 mr-1" />
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
      title="Apoteker"
      role="pharmacist"
      sidebarItems={sidebarItems}
    >
      {activeView === "dashboard" && renderDashboard()}
      {activeView === "prescriptions" && renderPrescriptions()}
      {activeView === "inventory" && renderInventory()}
      {activeView === "history" && renderHistory()}
    </DashboardLayout>
  )
}
