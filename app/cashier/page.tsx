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
  CreditCard,
  DollarSign,
  LayoutDashboard,
  Receipt,
  Search,
  TrendingUp
} from "lucide-react"
import { useEffect, useState } from "react"

interface Payment {
  id: string
  patientId: string
  patientName: string
  appointmentId: string
  prescriptionId?: string
  date: string
  time: string
  items: Array<{
    name: string
    quantity: number
    price: number
    total: number
  }>
  subtotal: number
  tax: number
  total: number
  status: "pending" | "paid" | "cancelled"
  paymentMethod: "cash" | "card" | "transfer"
  cashierId?: string
  cashierName?: string
  paidAt?: string
}

export default function CashierDashboard() {
  const [activeView, setActiveView] = useState("dashboard")
  const [payments, setPayments] = useState<Payment[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [showReceiptDialog, setShowReceiptDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer">("cash")
  const [cashReceived, setCashReceived] = useState("")

  const storage = HospitalStorage.getInstance()

  const sidebarItems = [
    {
      icon: LayoutDashboard,
      label: "Dashboard",
      active: activeView === "dashboard",
      onClick: () => setActiveView("dashboard"),
    },
    {
      icon: CreditCard,
      label: "Pembayaran",
      active: activeView === "payments",
      onClick: () => setActiveView("payments"),
    },
    {
      icon: Receipt,
      label: "Riwayat Pembayaran",
      active: activeView === "history",
      onClick: () => setActiveView("history"),
    },
    {
      icon: TrendingUp,
      label: "Laporan",
      active: activeView === "reports",
      onClick: () => setActiveView("reports"),
    },
  ]

  useEffect(() => {
    // Initialize dummy data if needed
    initializeDummyData()
    loadPayments()
  }, [])

  const loadPayments = () => {
    const allPayments = storage.getAll("payments") as Payment[]
    const allAppointments = storage.getAll("appointments")
    const allPrescriptions = storage.getAll("prescriptions")
    
    // Create pending payments for completed appointments
    const todayDate = new Date().toISOString().split("T")[0]
    const todayAppointments = allAppointments.filter((apt: any) => apt.date === todayDate)
    
    const pendingPayments = todayAppointments
      .filter((apt: any) => {
        // Check if appointment is completed and doesn't have payment yet
        const hasPayment = allPayments.find((p: any) => p.appointmentId === apt.id)
        const medicalRecord = storage.getAll("medicalRecords").find((mr: any) => mr.appointmentId === apt.id)
        const prescription = allPrescriptions.find((p: any) => p.appointmentId === apt.id)
        
        return medicalRecord && !hasPayment
      })
      .map((apt: any) => {
        const prescription = allPrescriptions.find((p: any) => p.appointmentId === apt.id)
        const medicalRecord = storage.getAll("medicalRecords").find((mr: any) => mr.appointmentId === apt.id)
        
        // Calculate items
        const items = []
        
        // Add consultation fee
        items.push({
          name: "Konsultasi Dokter",
          quantity: 1,
          price: 50000,
          total: 50000,
        })
        
        // Add prescription items if exists
        if (prescription) {
          const medicines = storage.getAll("medicines")
          ;(prescription as any).medicines.forEach((med: any) => {
            const medicineData = medicines.find((m: any) => m.id === med.medicineId)
            items.push({
              name: med.medicineName,
              quantity: med.quantity,
              price: (medicineData as any)?.price || 10000,
              total: med.quantity * ((medicineData as any)?.price || 10000),
            })
          })
        }
        
        const subtotal = items.reduce((sum, item) => sum + item.total, 0)
        const tax = Math.round(subtotal * 0.1) // 10% tax
        const total = subtotal + tax
        
        return {
          id: "PAY" + storage.generateId(),
          patientId: apt.patientId,
          patientName: apt.patientName,
          appointmentId: apt.id,
          prescriptionId: (prescription as any)?.id,
          date: new Date().toISOString().split("T")[0],
          time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          items,
          subtotal,
          tax,
          total,
          status: "pending" as const,
          paymentMethod: "cash" as const,
        }
      })
    
    setPayments([...allPayments, ...pendingPayments])
  }

  const getFilteredPayments = () => {
    let filtered = payments

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (payment) =>
          payment.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          payment.id.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((payment) => payment.status === statusFilter)
    }

    return filtered
  }

  const getStats = () => {
    const todayDate = new Date().toISOString().split("T")[0]
    const todayPayments = payments.filter((p) => p.date === todayDate)
    const paidPayments = todayPayments.filter((p) => p.status === "paid")
    
    return {
      totalPayments: payments.length,
      pendingPayments: payments.filter((p) => p.status === "pending").length,
      paidToday: paidPayments.length,
      totalRevenue: paidPayments.reduce((sum, p) => sum + p.total, 0),
      averagePayment: paidPayments.length > 0 ? paidPayments.reduce((sum, p) => sum + p.total, 0) / paidPayments.length : 0,
    }
  }

  const stats = getStats()

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: "Menunggu", variant: "outline" as const, icon: Clock },
      paid: { label: "Lunas", variant: "default" as const, icon: CheckCircle },
      cancelled: { label: "Dibatalkan", variant: "destructive" as const, icon: AlertCircle },
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

  const processPayment = async (paymentId: string) => {
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
      const currentCashier: any = users.find((u: any) => u.username === session.username)

      if (!currentCashier) {
        throw new Error("Data kasir tidak ditemukan")
      }

      const payment = payments.find((p) => p.id === paymentId)
      if (!payment) {
        throw new Error("Pembayaran tidak ditemukan")
      }

      // Validate cash received for cash payments
      if (paymentMethod === "cash" && Number(cashReceived) < payment.total) {
        throw new Error("Uang tunai yang diterima tidak mencukupi")
      }

      // Update payment status
      const updatedPayment: Payment = {
        ...payment,
        status: "paid",
        paymentMethod,
        cashierId: currentCashier.id,
        cashierName: currentCashier.name,
        paidAt: new Date().toISOString(),
      }

      storage.update("payments", paymentId, updatedPayment)
      
      // Reload data
      loadPayments()
      
      // Reset form
      setPaymentMethod("cash")
      setCashReceived("")
      setShowPaymentDialog(false)
      setSelectedPayment(null)

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const PaymentDialog = () => {
    if (!selectedPayment) return null

    const change = paymentMethod === "cash" && cashReceived ? Number(cashReceived) - selectedPayment.total : 0

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nama Pasien</Label>
            <p className="font-semibold">{selectedPayment.patientName}</p>
          </div>
          <div>
            <Label>ID Pembayaran</Label>
            <p className="font-semibold">{selectedPayment.id}</p>
          </div>
        </div>

        <div>
          <Label>Rincian Pembayaran</Label>
          <div className="mt-2 space-y-2">
            {selectedPayment.items.map((item, index) => (
              <div key={index} className="flex justify-between p-2 bg-muted rounded">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-foreground/60">{item.quantity} x Rp {item.price.toLocaleString()}</p>
                </div>
                <p className="font-semibold">Rp {item.total.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>Rp {selectedPayment.subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Pajak (10%):</span>
              <span>Rp {selectedPayment.tax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>Total:</span>
              <span>Rp {selectedPayment.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div>
          <Label>Metode Pembayaran</Label>
          <Select value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Pilih metode pembayaran" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Tunai</SelectItem>
              <SelectItem value="card">Kartu</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {paymentMethod === "cash" && (
          <div>
            <Label>Uang Diterima</Label>
            <Input
              type="number"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              placeholder="Masukkan jumlah uang tunai"
            />
            {change > 0 && (
              <p className="mt-2 text-green-600 font-semibold">
                Kembalian: Rp {change.toLocaleString()}
              </p>
            )}
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowPaymentDialog(false)
              setSelectedPayment(null)
              setError("")
            }}
            className="flex-1"
          >
            Batal
          </Button>
          <Button
            onClick={() => processPayment(selectedPayment.id)}
            disabled={loading || (paymentMethod === "cash" && (!cashReceived || Number(cashReceived) < selectedPayment.total))}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {loading ? "Memproses..." : "Proses Pembayaran"}
          </Button>
        </div>
      </div>
    )
  }

  const ReceiptDialog = () => {
    if (!selectedPayment) return null

    return (
      <div className="space-y-4 p-6 bg-white">
        <div className="text-center border-b pb-4">
          <h2 className="text-xl font-bold">RUMAH SAKIT SEHAT</h2>
          <p className="text-sm text-foreground/60">Jl. Sehat No. 1, Kota Sehat</p>
          <p className="text-sm text-foreground/60">Tel: (021) 1234-5678</p>
        </div>

        <div className="border-b pb-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p><strong>No.:</strong> {selectedPayment.id}</p>
              <p><strong>Tanggal:</strong> {selectedPayment.date}</p>
              <p><strong>Kasir:</strong> {selectedPayment.cashierName}</p>
            </div>
            <div>
              <p><strong>Pasien:</strong> {selectedPayment.patientName}</p>
              <p><strong>Metode:</strong> {selectedPayment.paymentMethod === "cash" ? "Tunai" : selectedPayment.paymentMethod === "card" ? "Kartu" : "Transfer"}</p>
            </div>
          </div>
        </div>

        <div className="border-b pb-4">
          <h3 className="font-semibold mb-2">Rincian Pembayaran</h3>
          {selectedPayment.items.map((item, index) => (
            <div key={index} className="flex justify-between text-sm">
              <span>{item.name} ({item.quantity}x)</span>
              <span>Rp {item.total.toLocaleString()}</span>
            </div>
          ))}
        </div>

        <div>
          <div className="flex justify-between font-bold">
            <span>Subtotal:</span>
            <span>Rp {selectedPayment.subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Pajak (10%):</span>
            <span>Rp {selectedPayment.tax.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-bold text-lg border-t pt-2">
            <span>Total:</span>
            <span>Rp {selectedPayment.total.toLocaleString()}</span>
          </div>
        </div>

        <div className="text-center pt-4 border-t">
          <p className="text-sm text-foreground/60">Terima kasih atas kunjungan Anda</p>
          <p className="text-sm text-foreground/60">Semoga lekas sembuh</p>
        </div>
      </div>
    )
  }

  const renderDashboard = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard Kasir</h2>
        <p className="text-foreground/60">Kelola pembayaran pasien</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground/60">Total Pembayaran</p>
                <p className="text-2xl font-bold">{stats.totalPayments}</p>
              </div>
              <Receipt className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground/60">Menunggu Pembayaran</p>
                <p className="text-2xl font-bold text-orange-600">{stats.pendingPayments}</p>
              </div>
              <Clock className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground/60">Lunas Hari Ini</p>
                <p className="text-2xl font-bold text-green-600">{stats.paidToday}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground/60">Pendapatan Hari Ini</p>
                <p className="text-2xl font-bold text-purple-600">Rp {stats.totalRevenue.toLocaleString()}</p>
              </div>
              <DollarSign className="w-8 h-8 text-purple-600" />
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
            <Button onClick={() => setActiveView("payments")} className="h-20 flex-col gap-2">
              <CreditCard className="w-6 h-6" />
              Pembayaran
            </Button>
            <Button onClick={() => setActiveView("history")} className="h-20 flex-col gap-2" variant="outline">
              <Receipt className="w-6 h-6" />
              Riwayat
            </Button>
            <Button onClick={() => setActiveView("reports")} className="h-20 flex-col gap-2" variant="outline">
              <TrendingUp className="w-6 h-6" />
              Laporan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderPayments = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Pembayaran</h2>
          <p className="text-foreground/60">Proses pembayaran pasien</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-foreground/40 w-4 h-4" />
              <Input
                placeholder="Cari pembayaran..."
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
                <SelectItem value="paid">Lunas</SelectItem>
                <SelectItem value="cancelled">Dibatalkan</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline">{getFilteredPayments().length} pembayaran</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID Pembayaran</TableHead>
                <TableHead>Nama Pasien</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {getFilteredPayments().map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium">{payment.id}</TableCell>
                  <TableCell>{payment.patientName}</TableCell>
                  <TableCell>Rp {payment.total.toLocaleString()}</TableCell>
                  <TableCell>{getStatusBadge(payment.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {payment.status === "pending" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedPayment(payment)
                            setShowPaymentDialog(true)
                          }}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CreditCard className="w-4 h-4 mr-1" />
                          Bayar
                        </Button>
                      )}
                      {payment.status === "paid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedPayment(payment)
                            setShowReceiptDialog(true)
                          }}
                        >
                          <Receipt className="w-4 h-4 mr-1" />
                          Struk
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogTitle>Proses Pembayaran</DialogTitle>
          <PaymentDialog />
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-md">
          <DialogTitle>Struk Pembayaran</DialogTitle>
          <ReceiptDialog />
        </DialogContent>
      </Dialog>
    </div>
  )

  const renderHistory = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Riwayat Pembayaran</h2>
          <p className="text-foreground/60">Riwayat semua pembayaran</p>
        </div>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>ID Pembayaran</TableHead>
                <TableHead>Nama Pasien</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Kasir</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments
                .filter((p) => p.status === "paid")
                .map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{payment.date}</TableCell>
                    <TableCell className="font-medium">{payment.id}</TableCell>
                    <TableCell>{payment.patientName}</TableCell>
                    <TableCell>Rp {payment.total.toLocaleString()}</TableCell>
                    <TableCell>{payment.cashierName}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedPayment(payment)
                          setShowReceiptDialog(true)
                        }}
                      >
                        <Receipt className="w-4 h-4 mr-1" />
                        Struk
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

  const renderReports = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Laporan</h2>
          <p className="text-foreground/60">Laporan pendapatan dan statistik</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Ringkasan Hari Ini</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span>Total Transaksi:</span>
                <span className="font-semibold">{stats.paidToday}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Pendapatan:</span>
                <span className="font-semibold">Rp {stats.totalRevenue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Rata-rata Pembayaran:</span>
                <span className="font-semibold">Rp {Math.round(stats.averagePayment).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Metode Pembayaran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span>Tunai:</span>
                <span className="font-semibold">
                  {payments.filter((p) => p.status === "paid" && p.paymentMethod === "cash").length}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Kartu:</span>
                <span className="font-semibold">
                  {payments.filter((p) => p.status === "paid" && p.paymentMethod === "card").length}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Transfer:</span>
                <span className="font-semibold">
                  {payments.filter((p) => p.status === "paid" && p.paymentMethod === "transfer").length}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  return (
    <DashboardLayout
      title="Kasir"
      role="cashier"
      sidebarItems={sidebarItems}
    >
      {activeView === "dashboard" && renderDashboard()}
      {activeView === "payments" && renderPayments()}
      {activeView === "history" && renderHistory()}
      {activeView === "reports" && renderReports()}
    </DashboardLayout>
  )
}
