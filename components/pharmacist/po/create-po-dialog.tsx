'use client'

import { useState, useMemo } from 'react'
import {
    Dialog, DialogContent, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Trash2, ShoppingCart, Loader2, X } from 'lucide-react'
import { formatRupiah } from './po-status-badge'
import { useVendors } from '@/hooks/pharmacist/use-vendors'
import type { CreatePoInput } from '@/hooks/pharmacist/use-purchase-orders'

interface Medication {
    id: string
    name: string
    generic_name?: string | null
    strength?: string | null
    stock_available: number
}

interface LineItem {
    medication_id: string
    quantity_ordered: number
    unit_price: number
}

const EMPTY_ITEM: LineItem = { medication_id: '', quantity_ordered: 1, unit_price: 0 }

interface CreatePoDialogProps {
    medications: Medication[]
    loading?: boolean
    onClose: () => void
    onCreate: (input: CreatePoInput) => Promise<string | null>
}

export function CreatePoDialog({ medications, loading = false, onClose, onCreate }: CreatePoDialogProps) {
    const { data: vendors } = useVendors()

    const [vendorId, setVendorId]         = useState('')
    const [orderDate, setOrderDate]       = useState(new Date().toISOString().split('T')[0])
    const [deliveryDate, setDeliveryDate] = useState('')
    const [notes, setNotes]               = useState('')
    const [items, setItems]               = useState<LineItem[]>([{ ...EMPTY_ITEM }])
    const [medSearch, setMedSearch]       = useState('')

    const filteredMeds = useMemo(
        () => medSearch
            ? medications.filter(m => m.name.toLowerCase().includes(medSearch.toLowerCase()))
            : medications,
        [medications, medSearch]
    )

    const total = useMemo(
        () => items.reduce((s, i) => s + i.quantity_ordered * i.unit_price, 0),
        [items]
    )

    const addItem    = () => setItems(prev => [...prev, { ...EMPTY_ITEM }])
    const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))
    const updateItem = <K extends keyof LineItem>(idx: number, field: K, value: LineItem[K]) =>
        setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))

    const isValid = vendorId && items.every(i => i.medication_id && i.quantity_ordered > 0)

    const handleCreate = async () => {
        if (!isValid) return
        const id = await onCreate({
            vendor_id: vendorId,
            order_date: orderDate,
            expected_delivery_date: deliveryDate || null,
            notes: notes || null,
            items,
        })
        if (id) onClose()
    }

    return (
        <Dialog open onOpenChange={open => { if (!open) onClose() }}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogTitle>Buat Purchase Order Baru</DialogTitle>
                <DialogDescription>
                    PO akan dibuat dalam status <strong>Draft</strong>. Kirim ke owner setelah selesai.
                </DialogDescription>

                <div className="space-y-6 pt-2">
                    {/* Header fields */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 col-span-2 sm:col-span-1">
                            <Label>Vendor <span className="text-destructive">*</span></Label>
                            <Select value={vendorId} onValueChange={setVendorId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Pilih vendor..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {vendors.length === 0
                                        ? <SelectItem value="none" disabled>Tidak ada vendor</SelectItem>
                                        : vendors.map(v => (
                                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                        ))
                                    }
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Tanggal Order</Label>
                            <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Estimasi Pengiriman</Label>
                            <Input type="date" value={deliveryDate} min={orderDate} onChange={e => setDeliveryDate(e.target.value)} />
                        </div>
                    </div>

                    {/* Item table */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <Label className="text-base font-semibold">Item Obat</Label>
                            <div className="flex gap-2 items-center">
                                <Input
                                    placeholder="Cari obat..."
                                    value={medSearch}
                                    onChange={e => setMedSearch(e.target.value)}
                                    className="w-40 h-8 text-sm"
                                />
                                <Button size="sm" variant="outline" onClick={addItem} className="gap-1 shrink-0">
                                    <Plus className="w-4 h-4" /> Tambah
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {items.map((item, idx) => (
                                <div
                                    key={idx}
                                    className="grid grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end p-3 rounded-lg border border-border/40 bg-card"
                                >
                                    <div className="space-y-1">
                                        <Label className="text-xs text-foreground/60">Obat</Label>
                                        <Select
                                            value={item.medication_id}
                                            onValueChange={v => updateItem(idx, 'medication_id', v)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Pilih obat..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {filteredMeds.map(m => (
                                                    <SelectItem key={m.id} value={m.id}>
                                                        {m.name}{m.strength ? ` (${m.strength})` : ''}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-foreground/60">Jumlah</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={item.quantity_ordered}
                                            onChange={e => updateItem(idx, 'quantity_ordered', Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-foreground/60">Harga Satuan (Rp)</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            value={item.unit_price}
                                            onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))}
                                        />
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeItem(idx)}
                                        disabled={items.length === 1}
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>

                        <div className="text-right text-lg font-bold pt-2 border-t border-border/20">
                            Total: {formatRupiah(total)}
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label>Catatan <span className="text-foreground/40 font-normal">(opsional)</span></Label>
                        <Textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Catatan untuk vendor atau admin..."
                            rows={2}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        <X className="w-4 h-4 mr-1" /> Batal
                    </Button>
                    <Button onClick={handleCreate} disabled={!isValid || loading} className="gap-2">
                        {loading
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <ShoppingCart className="w-4 h-4" />
                        }
                        Buat PO
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
