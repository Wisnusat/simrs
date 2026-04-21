"use client"
import { useState, useEffect } from "react"
import DashboardLayout from "@/components/system/dashboard-layout"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, CheckCircle, Clock, Eye, LayoutDashboard, Lock, Package, PackageOpen, Pill } from "lucide-react"
import { usePrescriptions } from "@/hooks/outpatient/use-prescriptions"
import { useMedications } from "@/hooks/outpatient/use-medications"
import { getInvoices } from "@/lib/api/client"
import { PrescriptionDetail } from "@/components/pharmacist/prescription-detail"
import { StatCard } from "@/components/shared/stat-card"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import type { Invoice, Prescription } from "@/lib/types/outpatient"

const SIDEBAR = (active: string, set: (v: string) => void) => [
  { icon: LayoutDashboard, label: "Dashboard",        active: active === "dashboard",     onClick: () => set("dashboard") },
  { icon: Pill,            label: "Resep Obat",       active: active === "prescriptions", onClick: () => set("prescriptions") },
  { icon: Package,         label: "Stok Obat",        active: active === "inventory",     onClick: () => set("inventory") },
  { icon: PackageOpen,     label: "Riwayat",          active: active === "history",       onClick: () => set("history") },
]

export default function PharmacistDashboard() {
  const [view, setView] = useState("dashboard")
  const [selected, setSelected] = useState<Prescription | null>(null)
  const [invoice,  setInvoice]  = useState<Invoice | null>(null)
  const [invLoading, setInvLoading] = useState(false)

  const { data: prescriptions, loading, refresh, stats, dispense, actionLoading: dispensing, error: rxError } = usePrescriptions({ today: true })
  const { data: medications, loading: medLoading, search, setSearch } = useMedications()

  // Fetch invoice when opening prescription detail
  useEffect(() => {
    if (!selected) { setInvoice(null); return }
    setInvLoading(true)
    getInvoices({ encounter_id: selected.encounter_id })
      .then((data) => setInvoice(Array.isArray(data) ? data[0] ?? null : data as Invoice))
      .catch(() => setInvoice(null))
      .finally(() => setInvLoading(false))
  }, [selected])

  const isPaid = invoice?.status === "paid" || invoice?.status === "bpjs_claim_pending"

  const handleDispense = async (id: string) => {
    if (!isPaid) return false
    const result = await dispense(id)
    if (result) setSelected(null)
    return result
  }

  return (
    <DashboardLayout title="Apoteker" role="pharmacist" sidebarItems={SIDEBAR(view, setView)}>
      {/* DASHBOARD */}
      {view === "dashboard" && (
        <div className="space-y-6">
          <PageHeader title="Dashboard Apoteker" description="Kelola resep dan stok obat" onRefresh={refresh} isRefreshing={loading} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Resep Menunggu"     value={stats.active}    icon={Clock}       colorClass="text-orange-600" />
            <StatCard label="Diserahkan Hari Ini" value={stats.completed} icon={CheckCircle} colorClass="text-green-600" />
            <StatCard label="Stok Rendah"        value={medications.filter((m) => m.stock_available < 10).length} icon={AlertCircle} colorClass="text-red-600" />
          </div>
          <Card>
            <CardHeader><CardTitle>Resep Menunggu Diproses</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {prescriptions.filter((p) => p.status === "active").slice(0, 5).map((rx) => (
                <div key={rx.id} className="flex justify-between items-center p-3 rounded-lg bg-muted/40">
                  <div>
                    <p className="font-medium">{rx.patients.full_name}</p>
                    <p className="text-sm text-foreground/60">{rx.prescription_items.length} obat</p>
                  </div>
                  <div className="flex gap-2">
                    <StatusBadge status={rx.status} />
                    <Button size="sm" variant="outline" onClick={() => setSelected(rx)}><Eye className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
              {stats.active === 0 && <EmptyState message="Tidak ada resep yang menunggu." />}
            </CardContent>
          </Card>
        </div>
      )}

      {/* PRESCRIPTIONS */}
      {view === "prescriptions" && (
        <div className="space-y-6">
          <PageHeader title="Resep Obat" description="Semua resep hari ini" onRefresh={refresh} isRefreshing={loading} />
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pasien</TableHead>
                    <TableHead>Dokter</TableHead>
                    <TableHead>Jumlah Obat</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prescriptions.map((rx) => (
                    <TableRow key={rx.id}>
                      <TableCell className="font-medium">{rx.patients.full_name}</TableCell>
                      <TableCell>{rx.practitioners.full_name ?? "—"}</TableCell>
                      <TableCell>{rx.prescription_items.length} obat</TableCell>
                      <TableCell><StatusBadge status={rx.status} /></TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setSelected(rx)}>
                          <Eye className="w-4 h-4 mr-1" />Detail
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {prescriptions.length === 0 && !loading && <EmptyState message="Belum ada resep hari ini." />}
            </CardContent>
          </Card>
        </div>
      )}

      {/* INVENTORY */}
      {view === "inventory" && (
        <div className="space-y-6">
          <PageHeader title="Stok Obat" description="Stok obat saat ini" />
          <div className="max-w-sm">
            <Input placeholder="Cari obat..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Obat</TableHead>
                    <TableHead>Generik</TableHead>
                    <TableHead>Bentuk</TableHead>
                    <TableHead>Stok</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {medications.map((med) => (
                    <TableRow key={med.id}>
                      <TableCell className="font-medium">{med.name}</TableCell>
                      <TableCell className="text-foreground/60">{med.generic_name ?? "—"}</TableCell>
                      <TableCell>{med.form ?? "—"} {med.strength ?? ""}</TableCell>
                      <TableCell>
                        <Badge variant={med.stock_available < 10 ? "destructive" : "outline"}>
                          {med.stock_available}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {medications.length === 0 && !medLoading && <EmptyState message="Tidak ada obat ditemukan." />}
            </CardContent>
          </Card>
        </div>
      )}

      {/* HISTORY */}
      {view === "history" && (
        <div className="space-y-6">
          <PageHeader title="Riwayat Penyerahan" description="Resep yang sudah diserahkan" onRefresh={refresh} isRefreshing={loading} />
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pasien</TableHead>
                    <TableHead>Jumlah Obat</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prescriptions.filter((p) => p.status === "completed").map((rx) => (
                    <TableRow key={rx.id}>
                      <TableCell className="font-medium">{rx.patients.full_name}</TableCell>
                      <TableCell>{rx.prescription_items.length} obat</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setSelected(rx)}>
                          <Eye className="w-4 h-4 mr-1" />Detail
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {prescriptions.filter((p) => p.status === "completed").length === 0 && (
                <EmptyState message="Belum ada obat yang diserahkan hari ini." />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Prescription Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogTitle>Detail Resep</DialogTitle>
          {selected && (
            <div className="space-y-4">
              {/* Payment gate banner */}
              {invLoading ? (
                <Alert><AlertDescription>Memeriksa status pembayaran...</AlertDescription></Alert>
              ) : isPaid ? (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <AlertDescription className="text-green-700 dark:text-green-400">
                    <strong>Pembayaran Lunas</strong> — Obat boleh diserahkan.
                    {invoice && <span className="ml-2 text-xs">({invoice.invoice_number})</span>}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <Lock className="w-4 h-4" />
                  <AlertDescription>
                    <strong>Belum Dibayar</strong> — Pasien harus menyelesaikan pembayaran di kasir
                    sebelum obat dapat diserahkan.
                    {invoice && (
                      <span className="ml-1">
                        Status: <StatusBadge status={invoice.status} className="ml-1" />
                      </span>
                    )}
                    {!invoice && " Invoice belum dibuat."}
                  </AlertDescription>
                </Alert>
              )}

              <PrescriptionDetail
                prescription={selected}
                onDispense={handleDispense}
                onClose={() => setSelected(null)}
                loading={dispensing}
                error={rxError}
                disableDispense={!isPaid}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
