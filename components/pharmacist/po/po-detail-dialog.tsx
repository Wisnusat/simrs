'use client'

import { useState, useEffect } from 'react'
import {
    Dialog, DialogContent, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CheckCircle, Eye, PackageCheck, Loader2 } from 'lucide-react'
import { PoStatusBadge, formatRupiah } from './po-status-badge'
import type { PurchaseOrder, PoItem, ReceiveItemInput } from '@/hooks/pharmacist/use-purchase-orders'

type Mode = 'detail' | 'receive'

interface PoDetailDialogProps {
    po: PurchaseOrder
    initialMode?: Mode
    actionLoading?: boolean
    onClose: () => void
    onReceive: (id: string, items: ReceiveItemInput[]) => Promise<{ success: boolean }>
}

export function PoDetailDialog({
    po, initialMode = 'detail', actionLoading, onClose, onReceive,
}: PoDetailDialogProps) {
    const [mode, setMode] = useState<Mode>(initialMode)
    const [recvQty, setRecvQty]       = useState<Record<string, number>>({})
    const [recvExpiry, setRecvExpiry] = useState<Record<string, string>>({})
    const [recvBatch, setRecvBatch]   = useState<Record<string, string>>({})

    // Reset receive fields when PO changes
    useEffect(() => {
        setMode(initialMode)
        const qty: Record<string, number> = {}
        for (const item of po.purchase_order_items) {
            qty[item.id] = item.quantity_ordered - (item.quantity_received ?? 0)
        }
        setRecvQty(qty)
        setRecvExpiry({})
        setRecvBatch({})
    }, [po.id, initialMode]) // eslint-disable-line react-hooks/exhaustive-deps

    const canReceive = po.status === 'po_sent' || po.status === 'po_partially_received'
    const pendingItems = po.purchase_order_items.filter(i => !i.is_fully_received)
    const allDone = pendingItems.length === 0

    const handleReceive = async () => {
        const items: ReceiveItemInput[] = po.purchase_order_items
            .filter(item => !item.is_fully_received && (recvQty[item.id] ?? 0) > 0)
            .map(item => ({
                item_id: item.id,
                quantity_received: recvQty[item.id] ?? 0,
                expiry_date: recvExpiry[item.id] || null,
                batch_number: recvBatch[item.id] || null,
            }))

        if (!items.length) return
        const result = await onReceive(po.id, items)
        if (result.success) onClose()
    }

    return (
        <Dialog open onOpenChange={open => { if (!open) onClose() }}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogTitle className="flex items-center gap-3">
                    PO — {po.po_number}
                    <PoStatusBadge status={po.status} />
                </DialogTitle>
                <DialogDescription>
                    Vendor: <strong>{po.vendors?.name}</strong>
                    {po.expected_delivery_date && (
                        <> · Estimasi tiba: {new Date(po.expected_delivery_date).toLocaleDateString('id-ID')}</>
                    )}
                </DialogDescription>

                {po.rejection_reason && (
                    <Alert variant="destructive">
                        <AlertDescription>Ditolak: {po.rejection_reason}</AlertDescription>
                    </Alert>
                )}

                {/* Mode switcher */}
                {canReceive && !allDone && (
                    <div className="flex gap-2">
                        <Button
                            variant={mode === 'detail' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setMode('detail')}
                        >
                            <Eye className="w-4 h-4 mr-1" /> Detail
                        </Button>
                        <Button
                            variant={mode === 'receive' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setMode('receive')}
                        >
                            <PackageCheck className="w-4 h-4 mr-1" /> Catat Penerimaan
                        </Button>
                    </div>
                )}

                {/* ── Detail mode ── */}
                {mode === 'detail' && (
                    <DetailTable po={po} />
                )}

                {/* ── Receive mode ── */}
                {mode === 'receive' && (
                    <ReceiveForm
                        items={pendingItems}
                        allDone={allDone}
                        recvQty={recvQty}
                        recvExpiry={recvExpiry}
                        recvBatch={recvBatch}
                        onQtyChange={(id, v) => setRecvQty(prev => ({ ...prev, [id]: v }))}
                        onExpiryChange={(id, v) => setRecvExpiry(prev => ({ ...prev, [id]: v }))}
                        onBatchChange={(id, v) => setRecvBatch(prev => ({ ...prev, [id]: v }))}
                    />
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Tutup</Button>
                    {mode === 'receive' && !allDone && (
                        <Button
                            onClick={handleReceive}
                            disabled={actionLoading}
                            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                        >
                            {actionLoading
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <PackageCheck className="w-4 h-4" />}
                            Simpan Penerimaan
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── sub-components ───────────────────────────────────────────────────────────

function DetailTable({ po }: { po: PurchaseOrder }) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Obat</TableHead>
                    <TableHead className="text-right">Dipesan</TableHead>
                    <TableHead className="text-right">Harga Satuan</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="text-right">Diterima</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {po.purchase_order_items.map(item => (
                    <TableRow key={item.id}>
                        <TableCell>
                            <p className="font-medium">{item.medications.name}</p>
                            {item.medications.generic_name && (
                                <p className="text-xs text-foreground/50">{item.medications.generic_name}</p>
                            )}
                        </TableCell>
                        <TableCell className="text-right">{item.quantity_ordered}</TableCell>
                        <TableCell className="text-right">{formatRupiah(item.unit_price)}</TableCell>
                        <TableCell className="text-right">{formatRupiah(item.subtotal)}</TableCell>
                        <TableCell className="text-right">
                            <span className={item.is_fully_received ? 'text-emerald-600 font-semibold' : 'text-amber-500'}>
                                {item.quantity_received}/{item.quantity_ordered}
                            </span>
                            {item.is_fully_received && (
                                <CheckCircle className="w-3 h-3 text-emerald-500 inline-block ml-1" />
                            )}
                        </TableCell>
                    </TableRow>
                ))}
                <TableRow>
                    <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                    <TableCell className="text-right font-bold">{formatRupiah(po.total_amount)}</TableCell>
                    <TableCell />
                </TableRow>
            </TableBody>
        </Table>
    )
}

interface ReceiveFormProps {
    items: PoItem[]
    allDone: boolean
    recvQty: Record<string, number>
    recvExpiry: Record<string, string>
    recvBatch: Record<string, string>
    onQtyChange: (id: string, v: number) => void
    onExpiryChange: (id: string, v: string) => void
    onBatchChange: (id: string, v: string) => void
}

function ReceiveForm({
    items, allDone,
    recvQty, recvExpiry, recvBatch,
    onQtyChange, onExpiryChange, onBatchChange,
}: ReceiveFormProps) {
    if (allDone) {
        return (
            <p className="text-center text-emerald-600 font-medium py-6">
                ✓ Semua item sudah diterima
            </p>
        )
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-foreground/60">
                Isi jumlah item yang diterima. Stok obat akan otomatis bertambah.
            </p>
            {items.map(item => {
                const remaining = item.quantity_ordered - (item.quantity_received ?? 0)
                return (
                    <div key={item.id} className="p-4 rounded-xl border border-border/40 bg-card space-y-3">
                        <div>
                            <p className="font-semibold">{item.medications.name}</p>
                            <p className="text-xs text-foreground/50">
                                Dipesan: {item.quantity_ordered} · Diterima: {item.quantity_received ?? 0} · Sisa: {remaining}
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Qty Diterima</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={remaining}
                                    value={recvQty[item.id] ?? 0}
                                    onChange={e => onQtyChange(item.id, Number(e.target.value))}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Tgl Kadaluarsa</Label>
                                <Input
                                    type="date"
                                    value={recvExpiry[item.id] ?? ''}
                                    onChange={e => onExpiryChange(item.id, e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">No. Batch</Label>
                                <Input
                                    value={recvBatch[item.id] ?? ''}
                                    placeholder="Opsional"
                                    onChange={e => onBatchChange(item.id, e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
