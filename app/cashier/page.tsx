"use client"

import { useState } from "react"
import DashboardLayout from "@/components/system/dashboard-layout"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Clock, CreditCard, DollarSign, LayoutDashboard, Receipt, TrendingUp } from "lucide-react"
import { useInvoices } from "@/hooks/outpatient/use-invoices"
import { PaymentForm } from "@/components/cashier/payment-form"
import { ReceiptView } from "@/components/cashier/receipt-view"
import { StatCard } from "@/components/shared/stat-card"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import type { Invoice, PaymentMethod } from "@/lib/types/outpatient"

const SIDEBAR = (active: string, set: (v: string) => void) => [
  { icon: LayoutDashboard, label: "Dashboard",         active: active === "dashboard", onClick: () => set("dashboard") },
  { icon: CreditCard,      label: "Pembayaran",        active: active === "payments",  onClick: () => set("payments") },
  { icon: Receipt,         label: "Riwayat Pembayaran", active: active === "history",  onClick: () => set("history") },
  { icon: TrendingUp,      label: "Laporan",           active: active === "reports",   onClick: () => set("reports") },
]

export default function CashierDashboard() {
  const [view, setView] = useState("dashboard")
  const [payTarget, setPayTarget] = useState<Invoice | null>(null)
  const [receiptTarget, setReceiptTarget] = useState<Invoice | null>(null)

  const { data: invoices, loading, refresh, stats, pay, cancel, actionLoading: paying, error: payError } = useInvoices({ today: true })

  const handlePay = async (method: PaymentMethod, paidAmount?: number) => {
    if (!payTarget) return false
    const ok = await pay(payTarget.id, method, paidAmount)
    if (ok) setPayTarget(null)
    return ok
  }

  const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`

  return (
    <DashboardLayout title="Kasir" role="cashier" sidebarItems={SIDEBAR(view, setView)}>
      {/* DASHBOARD */}
      {view === "dashboard" && (
        <div className="space-y-6">
          <PageHeader title="Dashboard Kasir" description="Kelola pembayaran pasien" onRefresh={refresh} isRefreshing={loading} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Invoice"     value={stats.total}                           icon={Receipt}      colorClass="text-blue-600" />
            <StatCard label="Menunggu Bayar"    value={stats.pending}                         icon={Clock}        colorClass="text-orange-600" />
            <StatCard label="Lunas Hari Ini"    value={stats.paidToday}                       icon={CheckCircle}  colorClass="text-green-600" />
            <StatCard label="Pendapatan"        value={fmt(stats.totalRevenue)}               icon={DollarSign}   colorClass="text-purple-600" />
          </div>
          <Card>
            <CardHeader><CardTitle>Invoice Menunggu Pembayaran</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {invoices.filter((inv) => inv.status === "unpaid").slice(0, 5).map((inv) => (
                <div key={inv.id} className="flex justify-between items-center p-3 rounded-lg bg-muted/40">
                  <div>
                    <p className="font-medium">{inv.patients.full_name}</p>
                    <p className="text-sm text-foreground/60">{fmt(inv.total_amount)}</p>
                  </div>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setPayTarget(inv)}>
                    <CreditCard className="w-4 h-4 mr-1" />Bayar
                  </Button>
                </div>
              ))}
              {stats.pending === 0 && <EmptyState message="Tidak ada invoice yang menunggu pembayaran." />}
            </CardContent>
          </Card>
        </div>
      )}

      {/* PAYMENTS */}
      {view === "payments" && (
        <div className="space-y-6">
          <PageHeader title="Pembayaran" description="Proses pembayaran pasien" onRefresh={refresh} isRefreshing={loading} />
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Invoice</TableHead>
                    <TableHead>Pasien</TableHead>
                    <TableHead>Layanan</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium font-mono">{inv.invoice_number}</TableCell>
                      <TableCell>{inv.patients.full_name}</TableCell>
                      <TableCell>
                        {inv.encounters?.encounter_class === "emergency"
                          ? <Badge className="bg-orange-500 hover:bg-orange-600 text-white">IGD</Badge>
                          : inv.encounters?.encounter_class === "inpatient"
                          ? <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Rawat Inap</Badge>
                          : <Badge variant="outline">{inv.encounters?.poli_services?.name ?? "Rawat Jalan"}</Badge>
                        }
                      </TableCell>
                      <TableCell>{fmt(inv.total_amount)}</TableCell>
                      <TableCell><Badge variant="outline">{inv.payment_type}</Badge></TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                      <TableCell>
                        {inv.status === "unpaid" && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setPayTarget(inv)}>
                            <CreditCard className="w-4 h-4 mr-1" />Bayar
                          </Button>
                        )}
                        {(inv.status === "paid" || inv.status === "bpjs_claim_pending") && (
                          <Button size="sm" variant="outline" onClick={() => setReceiptTarget(inv)}>
                            <Receipt className="w-4 h-4 mr-1" />Struk
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {invoices.length === 0 && !loading && <EmptyState message="Tidak ada invoice hari ini." />}
            </CardContent>
          </Card>
        </div>
      )}

      {/* HISTORY */}
      {view === "history" && (
        <div className="space-y-6">
          <PageHeader title="Riwayat Pembayaran" description="Invoice yang sudah lunas" onRefresh={refresh} isRefreshing={loading} />
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Invoice</TableHead>
                    <TableHead>Pasien</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.filter((i) => i.status === "paid").map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono">{inv.invoice_number}</TableCell>
                      <TableCell className="font-medium">{inv.patients.full_name}</TableCell>
                      <TableCell>{fmt(inv.total_amount)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setReceiptTarget(inv)}>
                          <Receipt className="w-4 h-4 mr-1" />Struk
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {invoices.filter((i) => i.status === "paid").length === 0 && (
                <EmptyState message="Belum ada pembayaran yang lunas hari ini." />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* REPORTS */}
      {view === "reports" && (
        <div className="space-y-6">
          <PageHeader title="Laporan" description="Ringkasan pendapatan hari ini" />
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Ringkasan Hari Ini</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span>Total Transaksi</span><span className="font-semibold">{stats.paidToday}</span></div>
                <div className="flex justify-between"><span>Total Pendapatan</span><span className="font-semibold">{fmt(stats.totalRevenue)}</span></div>
                <div className="flex justify-between"><span>Rata-rata per Pasien</span><span className="font-semibold">{fmt(stats.paidToday > 0 ? Math.round(stats.totalRevenue / stats.paidToday) : 0)}</span></div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Payment Dialog */}
      <Dialog open={!!payTarget} onOpenChange={(o) => { if (!o) setPayTarget(null) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogTitle>Proses Pembayaran</DialogTitle>
          {payTarget && (
            <PaymentForm
              invoice={payTarget}
              onPay={handlePay}
              onCancel={() => setPayTarget(null)}
              loading={paying}
              error={payError}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={!!receiptTarget} onOpenChange={(o) => { if (!o) setReceiptTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Struk Pembayaran</DialogTitle>
          {receiptTarget && <ReceiptView invoice={receiptTarget} />}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
