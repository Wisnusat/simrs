/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Pill, Plus, Loader2, Search, Trash2, RefreshCw, AlertTriangle, Sparkles, CheckCircle2, Package } from 'lucide-react'
import { toast } from 'sonner'

const UNITS = ['tablet', 'kapsul', 'ml', 'mg', 'gram', 'vial', 'ampul', 'sachet', 'botol', 'tube', 'strip', 'patch', 'suppositoria', 'pcs']
const FORMS = ['Tablet', 'Kapsul', 'Sirup', 'Injeksi', 'Infus', 'Salep', 'Krim', 'Tetes Mata', 'Tetes Telinga', 'Tetes Hidung', 'Suppositoria', 'Patch', 'Inhaler', 'Serbuk', 'Suspensi', 'Kaplet', 'Kapsul Lunak']
const CATEGORIES = ['Analgetik', 'Antibiotik', 'Antidiabetik', 'Antihipertensi', 'Antihistamin', 'Antiinflamasi', 'Antijamur', 'Antivirus', 'Vitamin & Suplemen', 'Gastrointestinal', 'Kardiovaskular', 'Dermatologi', 'Respirologi', 'Neurologi', 'Psikiatri', 'Onkologi', 'Lain-lain']

const EMPTY_FORM = {
    name: '', generic_name: '', brand_name: '', form: '', strength: '', unit: 'tablet',
    category: '', kfa_code: '', ss_medication_id: '',
    is_narcotics: false, is_psychotropics: false, requires_prescription: true,
}
const EMPTY_STOCK = { batch_number: '', expiry_date: '', quantity: '', unit_price: '', minimum_stock: '10' }

export default function MedicationsPage() {
    const [meds, setMeds] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [showInactive, setShowInactive] = useState(false)
    const [total, setTotal] = useState(0)

    // Sheet state
    const [showSheet, setShowSheet] = useState(false)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState({ ...EMPTY_FORM })
    const [stockForm, setStockForm] = useState({ ...EMPTY_STOCK })

    // KFA search
    const [kfaQuery, setKfaQuery] = useState('')
    const [kfaResults, setKfaResults] = useState<any[]>([])
    const [kfaLoading, setKfaLoading] = useState(false)
    const [kfaSelected, setKfaSelected] = useState(false)
    const kfaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Toggle loading
    const [togglingIds, setTogglingIds] = useState<Record<string, boolean>>({})

    const fetchMeds = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (search) params.set('search', search)
            if (showInactive) params.set('active', 'false')
            const res = await fetch(`/api/cms/medications?${params}`)
            if (res.ok) {
                const d = await res.json()
                setMeds(d.data ?? [])
                setTotal(d.meta?.total ?? (d.data ?? []).length)
            }
        } catch {
            toast.error('Gagal memuat data obat')
        } finally {
            setLoading(false)
        }
    }, [search, showInactive])

    useEffect(() => { fetchMeds() }, [fetchMeds])

    // KFA debounce search
    useEffect(() => {
        if (kfaQuery.length < 3) { setKfaResults([]); return }
        if (kfaTimer.current) clearTimeout(kfaTimer.current)
        kfaTimer.current = setTimeout(async () => {
            setKfaLoading(true)
            try {
                const res = await fetch(`/api/cms/medications/kfa-search?q=${encodeURIComponent(kfaQuery)}&size=10`)
                if (res.ok) {
                    const d = await res.json()
                    setKfaResults(d.data ?? [])
                } else {
                    setKfaResults([])
                    toast.error('Gagal mencari di KFA SATUSEHAT')
                }
            } catch {
                setKfaResults([])
            } finally {
                setKfaLoading(false)
            }
        }, 500)
    }, [kfaQuery])

    const selectKfa = (item: any) => {
        setForm(f => ({
            ...f,
            name: item.name || f.name,
            generic_name: item.generic_name || f.generic_name,
            brand_name: item.brand_name || f.brand_name,
            form: item.form || f.form,
            strength: item.strength || f.strength,
            unit: item.unit || f.unit,
            kfa_code: item.kfa_code || f.kfa_code,
            ss_medication_id: item.ss_medication_id || f.ss_medication_id,
        }))
        setKfaSelected(true)
        setKfaResults([])
        setKfaQuery('')
        toast.success(`Data KFA "${item.name}" berhasil diambil`)
    }

    const openSheet = () => {
        setForm({ ...EMPTY_FORM })
        setStockForm({ ...EMPTY_STOCK })
        setKfaQuery('')
        setKfaResults([])
        setKfaSelected(false)
        setShowSheet(true)
    }

    const handleSave = async () => {
        if (!form.name.trim()) { toast.error('Nama obat wajib diisi'); return }
        if (!form.unit.trim()) { toast.error('Satuan wajib diisi'); return }
        setSaving(true)
        try {
            const hasStock = parseFloat(stockForm.quantity) > 0
            const res = await fetch('/api/cms/medications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    stock: hasStock ? {
                        batch_number: stockForm.batch_number || null,
                        expiry_date: stockForm.expiry_date || null,
                        quantity: parseFloat(stockForm.quantity),
                        unit_price: parseFloat(stockForm.unit_price) || 0,
                        minimum_stock: parseInt(stockForm.minimum_stock) || 10,
                    } : null,
                }),
            })
            const d = await res.json()
            if (d.success) {
                toast.success(`Obat "${form.name}" berhasil ditambahkan`)
                setShowSheet(false)
                fetchMeds()
            } else {
                toast.error(d.error ?? 'Gagal menyimpan obat')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        } finally {
            setSaving(false)
        }
    }

    const handleToggleActive = async (id: string, current: boolean) => {
        setTogglingIds(prev => ({ ...prev, [id]: true }))
        try {
            const res = await fetch(`/api/cms/medications/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !current }),
            })
            const d = await res.json()
            if (d.success) {
                setMeds(prev => prev.map(m => m.id === id ? { ...m, is_active: !current } : m))
            } else {
                toast.error(d.error ?? 'Gagal mengubah status')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        } finally {
            setTogglingIds(prev => ({ ...prev, [id]: false }))
        }
    }

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Hapus obat "${name}"?`)) return
        try {
            const res = await fetch(`/api/cms/medications/${id}`, { method: 'DELETE' })
            const d = await res.json()
            if (d.success) {
                if (d.data?.deactivated) {
                    toast.warning(d.data.message)
                    setMeds(prev => prev.map(m => m.id === id ? { ...m, is_active: false } : m))
                } else {
                    toast.success('Obat berhasil dihapus')
                    setMeds(prev => prev.filter(m => m.id !== id))
                }
            } else {
                toast.error(d.error ?? 'Gagal menghapus obat')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        }
    }

    const belowMinCount = meds.filter(m => m.stock_below_minimum).length

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Pill className="w-8 h-8 text-primary" />
                        Manajemen Obat
                    </h1>
                    <p className="text-foreground/60 mt-1">Setup master data obat dan stok awal klinik</p>
                </div>
                <Button onClick={openSheet} className="gap-2">
                    <Plus className="w-4 h-4" /> Tambah Obat
                </Button>
            </div>

            {belowMinCount > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {belowMinCount} obat stok di bawah minimum
                </div>
            )}

            <Card className="border border-border/40">
                <CardHeader>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <CardTitle>Daftar Obat ({total})</CardTitle>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                                <Input
                                    className="pl-8 w-56"
                                    placeholder="Cari nama / KFA..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2 text-sm text-foreground/60">
                                <Switch checked={showInactive} onCheckedChange={setShowInactive} />
                                Tampilkan nonaktif
                            </div>
                            <Button variant="ghost" size="icon" onClick={fetchMeds} title="Refresh">
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nama Obat</TableHead>
                                    <TableHead>Generik</TableHead>
                                    <TableHead>Bentuk / Kekuatan</TableHead>
                                    <TableHead>KFA</TableHead>
                                    <TableHead className="text-center">Stok</TableHead>
                                    <TableHead className="w-[100px]">Status</TableHead>
                                    <TableHead className="text-right w-[80px]">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {meds.map((m: any) => (
                                    <TableRow key={m.id} className={!m.is_active ? 'opacity-50' : ''}>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium text-sm">{m.name}</p>
                                                {m.brand_name && m.brand_name !== m.name && (
                                                    <p className="text-xs text-foreground/50">{m.brand_name}</p>
                                                )}
                                                <div className="flex gap-1 mt-1 flex-wrap">
                                                    {m.is_narcotics && <Badge variant="destructive" className="text-[10px] px-1 py-0">Narkotika</Badge>}
                                                    {m.is_psychotropics && <Badge variant="destructive" className="text-[10px] px-1 py-0 bg-purple-600">Psikotropika</Badge>}
                                                    {m.category && <Badge variant="outline" className="text-[10px] px-1 py-0">{m.category}</Badge>}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-foreground/70">{m.generic_name || '-'}</TableCell>
                                        <TableCell>
                                            <span className="text-sm">
                                                {[m.form, m.strength].filter(Boolean).join(' ') || '-'}
                                            </span>
                                            <p className="text-xs text-foreground/50">{m.unit}</p>
                                        </TableCell>
                                        <TableCell>
                                            {m.kfa_code
                                                ? <span className="text-xs font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">{m.kfa_code}</span>
                                                : <span className="text-xs text-foreground/30">-</span>
                                            }
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className={`text-sm font-medium ${m.stock_below_minimum ? 'text-amber-600' : 'text-foreground'}`}>
                                                {m.total_stock ?? 0}
                                            </span>
                                            <p className="text-xs text-foreground/40">{m.unit}</p>
                                            {m.stock_below_minimum && (
                                                <AlertTriangle className="w-3 h-3 text-amber-500 mx-auto mt-0.5" />
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {togglingIds[m.id]
                                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                                    : <Switch
                                                        checked={!!m.is_active}
                                                        onCheckedChange={() => handleToggleActive(m.id, !!m.is_active)}
                                                    />
                                                }
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(m.id, m.name)}
                                                title="Hapus"
                                            >
                                                <Trash2 className="w-4 h-4 text-destructive/70" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {meds.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center text-foreground/40 py-12">
                                            Belum ada data obat. Klik &quot;Tambah Obat&quot; untuk memulai setup.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* ── Add Medication Sheet ───────────────────────────────────────── */}
            <Sheet open={showSheet} onOpenChange={setShowSheet}>
                <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
                    <SheetHeader className="border-b pb-4">
                        <SheetTitle className="flex items-center gap-2">
                            <Pill className="w-5 h-5 text-primary" />
                            Tambah Obat Baru
                        </SheetTitle>
                    </SheetHeader>

                    <div className="py-6 space-y-6">
                        {/* ── KFA Search ── */}
                        <div className="space-y-3 p-4 rounded-lg border border-border/40 bg-primary/5">
                            <p className="text-sm font-semibold flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-primary" />
                                Cari dari Master KFA SATUSEHAT
                                <span className="text-xs font-normal text-foreground/50">(opsional)</span>
                            </p>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                                <Input
                                    className="pl-8"
                                    placeholder="Ketik nama obat min. 3 karakter..."
                                    value={kfaQuery}
                                    onChange={e => { setKfaQuery(e.target.value); setKfaSelected(false) }}
                                />
                                {kfaLoading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />}
                            </div>
                            {kfaSelected && (
                                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Data KFA berhasil diisi. Periksa dan lengkapi field di bawah.
                                </p>
                            )}
                            {kfaResults.length > 0 && (
                                <div className="border border-border rounded-lg divide-y divide-border/50 max-h-48 overflow-y-auto bg-background">
                                    {kfaResults.map((r, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => selectKfa(r)}
                                            className="w-full text-left px-3 py-2.5 hover:bg-primary/5 transition-colors"
                                        >
                                            <p className="text-sm font-medium">{r.name}</p>
                                            <p className="text-xs text-foreground/50">
                                                {[r.generic_name, r.form, r.strength].filter(Boolean).join(' · ')}
                                                {r.kfa_code && <span className="ml-2 font-mono text-primary">{r.kfa_code}</span>}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {kfaQuery.length >= 3 && !kfaLoading && kfaResults.length === 0 && !kfaSelected && (
                                <p className="text-xs text-foreground/40">Tidak ditemukan di KFA. Isi manual di bawah.</p>
                            )}
                        </div>

                        {/* ── Drug Details ── */}
                        <div className="space-y-4">
                            <p className="text-sm font-semibold text-foreground/70 uppercase tracking-wide">Detail Obat</p>

                            <div className="space-y-1.5">
                                <Label className="text-xs">Nama Obat <span className="text-destructive">*</span></Label>
                                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Paracetamol 500mg" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Nama Generik</Label>
                                    <Input value={form.generic_name} onChange={e => setForm(f => ({ ...f, generic_name: e.target.value }))} placeholder="Paracetamol" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Nama Merek</Label>
                                    <Input value={form.brand_name} onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))} placeholder="Sanmol" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Bentuk Sediaan</Label>
                                    <select
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={form.form}
                                        onChange={e => setForm(f => ({ ...f, form: e.target.value }))}
                                    >
                                        <option value="">Pilih...</option>
                                        {FORMS.map(fo => <option key={fo} value={fo}>{fo}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Kekuatan / Dosis</Label>
                                    <Input value={form.strength} onChange={e => setForm(f => ({ ...f, strength: e.target.value }))} placeholder="500mg" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Satuan <span className="text-destructive">*</span></Label>
                                    <select
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={form.unit}
                                        onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                                    >
                                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Kategori</Label>
                                    <select
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={form.category}
                                        onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                    >
                                        <option value="">Pilih...</option>
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Kode KFA</Label>
                                    <Input value={form.kfa_code} onChange={e => setForm(f => ({ ...f, kfa_code: e.target.value }))} placeholder="93000396" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">ID SATUSEHAT</Label>
                                    <Input value={form.ss_medication_id} onChange={e => setForm(f => ({ ...f, ss_medication_id: e.target.value }))} placeholder="Auto dari KFA" />
                                </div>
                            </div>

                            <div className="flex gap-6 pt-1">
                                <label className="flex items-center gap-2 cursor-pointer text-sm">
                                    <Switch checked={form.is_narcotics} onCheckedChange={v => setForm(f => ({ ...f, is_narcotics: v }))} />
                                    Narkotika
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer text-sm">
                                    <Switch checked={form.is_psychotropics} onCheckedChange={v => setForm(f => ({ ...f, is_psychotropics: v }))} />
                                    Psikotropika
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer text-sm">
                                    <Switch checked={form.requires_prescription} onCheckedChange={v => setForm(f => ({ ...f, requires_prescription: v }))} />
                                    Perlu Resep
                                </label>
                            </div>
                        </div>

                        {/* ── Initial Stock ── */}
                        <div className="space-y-4 pt-4 border-t border-border/40">
                            <p className="text-sm font-semibold flex items-center gap-2">
                                <Package className="w-4 h-4 text-primary" />
                                Stok Awal
                                <span className="text-xs font-normal text-foreground/50">(opsional — bisa diisi via PO)</span>
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Jumlah</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={stockForm.quantity}
                                        onChange={e => setStockForm(f => ({ ...f, quantity: e.target.value }))}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Harga Satuan (Rp)</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={stockForm.unit_price}
                                        onChange={e => setStockForm(f => ({ ...f, unit_price: e.target.value }))}
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">No. Batch</Label>
                                    <Input value={stockForm.batch_number} onChange={e => setStockForm(f => ({ ...f, batch_number: e.target.value }))} placeholder="BATCH-001" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Exp. Date</Label>
                                    <Input type="date" value={stockForm.expiry_date} onChange={e => setStockForm(f => ({ ...f, expiry_date: e.target.value }))} />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Stok Minimum (alert)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    value={stockForm.minimum_stock}
                                    onChange={e => setStockForm(f => ({ ...f, minimum_stock: e.target.value }))}
                                />
                            </div>
                        </div>

                        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            {saving ? 'Menyimpan...' : 'Simpan Obat'}
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
