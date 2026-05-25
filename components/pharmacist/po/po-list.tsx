'use client'

import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Eye, Send, PackageCheck, ChevronDown, Loader2 } from 'lucide-react'
import { PoStatusBadge, PO_STATUS_CONFIG, formatRupiah } from './po-status-badge'
import type { PurchaseOrder } from '@/hooks/pharmacist/use-purchase-orders'

interface PoListProps {
    orders: PurchaseOrder[]
    loading: boolean
    statusFilter: string
    onFilterChange: (status: string) => void
    onView: (po: PurchaseOrder) => void
    onSend: (po: PurchaseOrder) => void
    onReceive: (po: PurchaseOrder) => void
}

const FILTER_OPTIONS = [
    { value: '', label: 'Semua' },
    ...Object.entries(PO_STATUS_CONFIG)
        .filter(([v]) => v !== 'po_cancelled')
        .map(([value, { label }]) => ({ value, label })),
]

export function PoList({
    orders, loading, statusFilter, onFilterChange, onView, onSend, onReceive,
}: PoListProps) {
    return (
        <div className="space-y-4">
            {/* Status filter */}
            <div className="flex gap-2 flex-wrap">
                {FILTER_OPTIONS.map(opt => (
                    <Button
                        key={opt.value}
                        variant={statusFilter === opt.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => onFilterChange(opt.value)}
                    >
                        {opt.label}
                    </Button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>No. PO</TableHead>
                            <TableHead>Vendor</TableHead>
                            <TableHead>Tanggal</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-10" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map(po => (
                            <TableRow key={po.id}>
                                <TableCell className="font-mono font-semibold">{po.po_number}</TableCell>
                                <TableCell>{po.vendors?.name ?? '—'}</TableCell>
                                <TableCell>{new Date(po.order_date).toLocaleDateString('id-ID')}</TableCell>
                                <TableCell className="text-right font-semibold">{formatRupiah(po.total_amount)}</TableCell>
                                <TableCell><PoStatusBadge status={po.status} /></TableCell>
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm">
                                                <ChevronDown className="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => onView(po)}>
                                                <Eye className="w-4 h-4 mr-2" /> Lihat Detail
                                            </DropdownMenuItem>
                                            {po.status === 'po_draft' && (
                                                <DropdownMenuItem onClick={() => onSend(po)}>
                                                    <Send className="w-4 h-4 mr-2 text-blue-500" /> Kirim ke Owner
                                                </DropdownMenuItem>
                                            )}
                                            {(po.status === 'po_sent' || po.status === 'po_partially_received') && (
                                                <DropdownMenuItem onClick={() => onReceive(po)}>
                                                    <PackageCheck className="w-4 h-4 mr-2 text-emerald-500" /> Catat Penerimaan
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                        {orders.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-foreground/40 py-10">
                                    Tidak ada purchase order
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            )}
        </div>
    )
}
