/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
    ClipboardCheck,
    Loader2,
    CheckCircle2,
    XCircle,
    Eye,
    ChevronDown,
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

function getStatusBadge(status: string) {
    switch (status) {
        case 'po_draft': return <Badge variant="outline" className="text-amber-600 border-amber-300">Draft</Badge>
        case 'po_sent': return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Sent</Badge>
        case 'po_partially_received': return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">Partial</Badge>
        case 'po_completed': return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">Completed</Badge>
        case 'po_cancelled': return <Badge variant="destructive">Cancelled</Badge>
        default: return <Badge variant="outline">{status}</Badge>
    }
}

function formatRupiah(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

export default function POApprovalPage() {
    const [orders, setOrders] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState<string>('')
    const [selectedPO, setSelectedPO] = useState<any>(null)
    const [showDetail, setShowDetail] = useState(false)
    const [showRejectDialog, setShowRejectDialog] = useState(false)
    const [rejectReason, setRejectReason] = useState('')
    const [actionLoading, setActionLoading] = useState(false)

    const fetchOrders = useCallback(async () => {
        try {
            const params = statusFilter ? `?status=${statusFilter}` : ''
            const res = await fetch(`/api/cms/po-approval${params}`)
            if (res.ok) {
                const data = await res.json()
                setOrders(data.data ?? [])
            }
        } catch (err) {
            console.error('Fetch POs error:', err)
        } finally {
            setLoading(false)
        }
    }, [statusFilter])

    useEffect(() => { fetchOrders() }, [fetchOrders])

    const handleApprove = async (poId: string) => {
        setActionLoading(true)
        try {
            const res = await fetch(`/api/cms/po-approval/${poId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'approve' }),
            })
            const data = await res.json()
            if (data.success) {
                toast.success('Purchase order berhasil di-approve')
                fetchOrders()
                setShowDetail(false)
            } else {
                toast.error(data.error ?? 'Gagal approve')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        } finally {
            setActionLoading(false)
        }
    }

    const handleReject = async () => {
        if (!selectedPO) return
        setActionLoading(true)
        try {
            const res = await fetch(`/api/cms/po-approval/${selectedPO.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reject', rejection_reason: rejectReason }),
            })
            const data = await res.json()
            if (data.success) {
                toast.success('Purchase order berhasil ditolak')
                setShowRejectDialog(false)
                setRejectReason('')
                fetchOrders()
                setShowDetail(false)
            } else {
                toast.error(data.error ?? 'Gagal menolak')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        } finally {
            setActionLoading(false)
        }
    }

    const openDetail = (po: any) => {
        setSelectedPO(po)
        setShowDetail(true)
    }

    const canApprove = (po: any) => po.status === 'po_draft' || po.status === 'po_sent'

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                    <ClipboardCheck className="w-8 h-8 text-primary" />
                    Approval Purchase Order
                </h1>
                <p className="text-foreground/60 mt-1">Review dan approve/reject PO dari farmasi</p>
            </div>

            {/* Status filter */}
            <div className="flex gap-2 flex-wrap">
                {[
                    { value: '', label: 'Semua' },
                    { value: 'po_draft', label: 'Draft' },
                    { value: 'po_sent', label: 'Sent' },
                    { value: 'po_partially_received', label: 'Partial' },
                    { value: 'po_completed', label: 'Completed' },
                    { value: 'po_cancelled', label: 'Cancelled' },
                ].map(opt => (
                    <Button
                        key={opt.value}
                        variant={statusFilter === opt.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setStatusFilter(opt.value)}
                    >
                        {opt.label}
                    </Button>
                ))}
            </div>

            <Card className="border border-border/40">
                <CardHeader>
                    <CardTitle>Daftar Purchase Order ({orders.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>No. PO</TableHead>
                                    <TableHead>Vendor</TableHead>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead>Dibuat oleh</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-10" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.map((po: any) => (
                                    <TableRow key={po.id} className={canApprove(po) ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}>
                                        <TableCell className="font-mono font-semibold">{po.po_number}</TableCell>
                                        <TableCell>{po.vendor?.name ?? po.vendors?.name ?? '-'}</TableCell>
                                        <TableCell>{new Date(po.order_date).toLocaleDateString('id-ID')}</TableCell>
                                        <TableCell className="text-foreground/60">{po.created_by_name}</TableCell>
                                        <TableCell className="text-right font-semibold">{formatRupiah(po.total_amount)}</TableCell>
                                        <TableCell>{getStatusBadge(po.status)}</TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm">
                                                        <ChevronDown className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => openDetail(po)}>
                                                        <Eye className="w-4 h-4 mr-2" /> Lihat Detail
                                                    </DropdownMenuItem>
                                                    {canApprove(po) && (
                                                        <>
                                                            <DropdownMenuItem onClick={() => handleApprove(po.id)}>
                                                                <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" /> Approve
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => { setSelectedPO(po); setShowRejectDialog(true) }}>
                                                                <XCircle className="w-4 h-4 mr-2 text-rose-500" /> Reject
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {orders.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center text-foreground/40 py-8">
                                            Tidak ada purchase order
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Detail Dialog */}
            <Dialog open={showDetail} onOpenChange={setShowDetail}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Detail PO — {selectedPO?.po_number}</DialogTitle>
                        <DialogDescription>
                            Vendor: {selectedPO?.vendor?.name ?? selectedPO?.vendors?.name ?? '-'}
                        </DialogDescription>
                    </DialogHeader>
                    {selectedPO && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div>
                                    <p className="text-xs text-foreground/50">Status</p>
                                    <div className="mt-1">{getStatusBadge(selectedPO.status)}</div>
                                </div>
                                <div>
                                    <p className="text-xs text-foreground/50">Tanggal Order</p>
                                    <p className="font-medium">{new Date(selectedPO.order_date).toLocaleDateString('id-ID')}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-foreground/50">Estimasi Pengiriman</p>
                                    <p className="font-medium">
                                        {selectedPO.expected_delivery_date
                                            ? new Date(selectedPO.expected_delivery_date).toLocaleDateString('id-ID')
                                            : '-'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-foreground/50">Dibuat oleh</p>
                                    <p className="font-medium">{selectedPO.created_by_name}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-foreground/50">Di-approve oleh</p>
                                    <p className="font-medium">{selectedPO.approved_by_name ?? '-'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-foreground/50">Total</p>
                                    <p className="font-bold text-lg">{formatRupiah(selectedPO.total_amount)}</p>
                                </div>
                            </div>

                            {selectedPO.rejection_reason && (
                                <div className="p-3 bg-rose-50 dark:bg-rose-950/20 rounded-lg border border-rose-200 dark:border-rose-800">
                                    <p className="text-xs text-rose-600 font-medium mb-1">Alasan Penolakan</p>
                                    <p className="text-sm">{selectedPO.rejection_reason}</p>
                                </div>
                            )}

                            {selectedPO.notes && (
                                <div className="p-3 bg-muted/50 rounded-lg">
                                    <p className="text-xs text-foreground/50 mb-1">Catatan</p>
                                    <p className="text-sm">{selectedPO.notes}</p>
                                </div>
                            )}

                            {/* Line Items */}
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Obat</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Harga Satuan</TableHead>
                                        <TableHead className="text-right">Subtotal</TableHead>
                                        <TableHead className="text-right">Diterima</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(selectedPO.items ?? selectedPO.purchase_order_items ?? []).map((item: any, i: number) => (
                                        <TableRow key={i}>
                                            <TableCell className="font-medium">
                                                {item.medication_name ?? item.medications?.name ?? '-'}
                                            </TableCell>
                                            <TableCell className="text-right">{item.quantity_ordered}</TableCell>
                                            <TableCell className="text-right">{formatRupiah(item.unit_price)}</TableCell>
                                            <TableCell className="text-right">{formatRupiah(item.subtotal)}</TableCell>
                                            <TableCell className="text-right">
                                                {item.quantity_received}/{item.quantity_ordered}
                                                {item.is_fully_received && (
                                                    <CheckCircle2 className="w-3 h-3 text-emerald-500 inline-block ml-1" />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    <DialogFooter>
                        {selectedPO && canApprove(selectedPO) && (
                            <>
                                <Button
                                    variant="outline"
                                    className="text-rose-600 border-rose-300 hover:bg-rose-50"
                                    onClick={() => { setShowDetail(false); setShowRejectDialog(true) }}
                                >
                                    <XCircle className="w-4 h-4 mr-2" /> Reject
                                </Button>
                                <Button
                                    onClick={() => handleApprove(selectedPO.id)}
                                    disabled={actionLoading}
                                    className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                                >
                                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    Approve
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Dialog */}
            <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Tolak Purchase Order</DialogTitle>
                        <DialogDescription>
                            PO {selectedPO?.po_number} — {selectedPO?.vendor?.name ?? selectedPO?.vendors?.name}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Alasan Penolakan</Label>
                            <Textarea
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder="Jelaskan alasan penolakan PO ini..."
                                rows={4}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Batal</Button>
                        <Button
                            variant="destructive"
                            onClick={handleReject}
                            disabled={actionLoading}
                            className="gap-2"
                        >
                            {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                            Tolak PO
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
