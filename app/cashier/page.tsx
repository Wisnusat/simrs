"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from "react"
import DashboardLayout from "@/components/system/dashboard-layout"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle, Clock, CreditCard, DollarSign, LayoutDashboard, Loader2, LogOut, Receipt, TrendingUp } from "lucide-react"
import { useInvoices } from "@/hooks/outpatient/use-invoices"
import { useAdmissions } from "@/hooks/inpatient/use-admissions"
import { PaymentForm } from "@/components/cashier/payment-form"
import { ReceiptView } from "@/components/cashier/receipt-view"
import { StatCard } from "@/components/shared/stat-card"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import { getInvoices, payInvoice } from "@/lib/api/client"
import type { Invoice, InpatientAdmission, PaymentMethod } from "@/lib/types/outpatient"

type View = 'dashboard' | 'payments' | 'discharge' | 'history' | 'reports'

const SIDEBAR = (active: View, set: (v: View) => void) => [
  { icon: LayoutDashboard, label: "Dashboard",          active: active === "dashboard", onClick: () => set("dashboard") },
  { icon: CreditCard,      label: "Pembayaran",         active: active === "payments",  onClick: () => set("payments") },
  { icon: LogOut,          label: "Siap Pulang",        active: active === "discharge", onClick: () => set("discharge") },
  { icon: Receipt,         label: "Riwayat Pembayaran", active: active === "history",   onClick: () => set("history") },
  { icon: TrendingUp,      label: "Laporan",            active: active === "reports",   onClick: () => set("reports") },
]

export default function CashierDashboard() {
  const [view, setView] = useState<View>("dashboard")
  const [payTarget, setPayTarget] = useState<Invoice | null>(null)
  const [receiptTarget, setReceiptTarget] = useState<Invoice | null>(null)

  // Invoice loading for a discharge-approved patient
  const [dischargeTarget, setDischargeTarget] = useState<InpatientAdmission | null>(null)
  const [dischargeInvoice, setDischargeInvoice] = useState<Invoice | null>(null)
  const [dischargeInvLoading, setDischargeInvLoading] = useState(false)
  const [dischargeInvError, setDischargeInvError] = useState<string | null>(null)
  const [dischargePayLoading, setDischargePayLoading] = useState(false)
  const [dischargePayError, setDischargePayError] = useState<string | null>(null)

  const { data: invoices, loading, refresh, stats, pay, cancel, actionLoading: paying, error: payError } = useInvoices({ today: true })
  const { data: dischargeAdmissions, loading: dischargeLoading, refresh: refreshDischarge } = useAdmissions({ status: 'discharge_approved' })

  const handlePay = async (method: PaymentMethod, paidAmount?: number) => {
    if (!payTarget) return false
    const ok = await pay(payTarget.id, method, paidAmount)
    if (ok) setPayTarget(null)
    return ok
  }

  const openDischargePatient = useCallback(async (adm: InpatientAdmission) => {
    setDischargeTarget(adm)
    setDischargeInvoice(null)
    setDischargeInvError(null)
    setDischargePayError(null)
    setDischargeInvLoading(true)
    try {
      const inv = await getInvoices({ episode_of_care_id: adm.episode_of_care_id })
      setDischargeInvoice(Array.isArray(inv) ? inv[0] ?? null : (inv as Invoice | null))
      if (!inv || (Array.isArray(inv) && inv.length === 0)) {
        setDischargeInvError('Invoice belum tersedia. Tunggu beberapa detik lalu coba lagi.')
      }
    } catch {
      setDischargeInvError('Invoice belum tersedia. Tunggu beberapa detik lalu coba lagi.')
    } finally {
      setDischargeInvLoading(false)
    }
  }, [])

  const handleDischargePay = async (method: PaymentMethod, paidAmount?: number) => {
    if (!dischargeInvoice) return false
    setDischargePayLoading(true)
    setDischargePayError(null)
    try {
      await payInvoice(dischargeInvoice.id, { payment_method: method, paid_amount: paidAmount })
      setDischargeTarget(null)
      setDischargeInvoice(null)
      refreshDischarge()
      refresh()
      return true
    } catch (err: any) {
      setDischargePayError(err.message ?? 'Gagal memproses pembayaran')
      return false
    } finally {
      setDischargePayLoading(false)
    }
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
          {dischargeAdmissions.length > 0 && (
            <Card className="border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LogOut className="w-4 h-4 text-blue-500" />
                  Pasien Siap Pulang
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{dischargeAdmissions.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dischargeAdmissions.slice(0, 3).map((adm) => (
                  <div key={adm.id} className="flex justify-between items-center p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
                    <div>
                      <p className="font-medium">{adm.patients.full_name}</p>
                      <p className="text-sm text-foreground/60">{adm.locations?.name} · Bed {adm.bed_number}</p>
                    </div>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => { setView("discharge"); openDischargePatient(adm) }}>
                      <CreditCard className="w-4 h-4 mr-1" />Bayar & Pulangkan
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
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

      {/* SIAP PULANG */}
      {view === "discharge" && (
        <div className="space-y-6">
          <PageHeader title="Pasien Siap Pulang" description="Rawat inap — dokter sudah setujui kepulangan. Selesaikan pembayaran untuk memulangkan pasien." onRefresh={refreshDischarge} isRefreshing={dischargeLoading} />
          {dischargeAdmissions.length === 0 && !dischargeLoading && (
            <EmptyState message="Tidak ada pasien yang menunggu kepulangan saat ini." />
          )}
          <div className="space-y-3">
            {dischargeAdmissions.map((adm) => (
              <Card key={adm.id} className={dischargeTarget?.id === adm.id ? "border-blue-400 ring-1 ring-blue-400" : ""}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="font-semibold">{adm.patients.full_name}</p>
                      <p className="text-sm text-foreground/60">
                        MR: {adm.patients.medical_record_no} · {adm.locations?.name} · Bed {adm.bed_number}
                      </p>
                      {adm.discharge_approved_at && (
                        <p className="text-xs text-foreground/50 mt-0.5">
                          Disetujui: {new Date(adm.discharge_approved_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                    <Button
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => openDischargePatient(adm)}
                      disabled={dischargeTarget?.id === adm.id && dischargeInvLoading}
                    >
                      {dischargeTarget?.id === adm.id && dischargeInvLoading
                        ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Memuat Invoice...</>
                        : <><CreditCard className="w-4 h-4 mr-1" />Bayar & Pulangkan</>
                      }
                    </Button>
                  </div>

                  {dischargeTarget?.id === adm.id && (
                    <div className="mt-4 border-t pt-4">
                      {dischargeInvError && (
                        <Alert variant="destructive" className="mb-3">
                          <AlertDescription>{dischargeInvError}</AlertDescription>
                        </Alert>
                      )}
                      {dischargeInvoice && (
                        <PaymentForm
                          invoice={dischargeInvoice}
                          onPay={handleDischargePay}
                          onCancel={() => { setDischargeTarget(null); setDischargeInvoice(null) }}
                          loading={dischargePayLoading}
                          error={dischargePayError}
                        />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
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

      {/* Payment Dialog (outpatient) */}
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
