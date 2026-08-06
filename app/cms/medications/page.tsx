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
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
    Pill, Plus, Loader2, Search, Trash2, RefreshCw, AlertTriangle,
    ChevronLeft, ChevronRight, Edit2, X, Package, ArrowLeft,
} from 'lucide-react'
import { toast } from 'sonner'

const UNITS = ['tablet', 'kapsul', 'ml', 'mg', 'gram', 'vial', 'ampul', 'sachet', 'botol', 'tube', 'strip', 'patch', 'suppositoria', 'pcs']
const FORMS = ['Tablet', 'Kapsul', 'Sirup', 'Injeksi', 'Infus', 'Salep', 'Krim', 'Tetes Mata', 'Tetes Telinga', 'Tetes Hidung', 'Suppositoria', 'Patch', 'Inhaler', 'Serbuk', 'Suspensi', 'Kaplet', 'Kapsul Lunak']
const CATEGORIES = ['Analgetik', 'Antibiotik', 'Antidiabetik', 'Antihipertensi', 'Antihistamin', 'Antiinflamasi', 'Antijamur', 'Antivirus', 'Vitamin & Suplemen', 'Gastrointestinal', 'Kardiovaskular', 'Dermatologi', 'Respirologi', 'Neurologi', 'Psikiatri', 'Onkologi', 'Lain-lain']

const KFA_PAGE_SIZE = 20

type KFAItem = {
    kfa_code: string
    name: string
    generic_name: string
    brand_name: string
    form: string
    strength: string
    unit: string
    ss_medication_id: string
    manufacturer: string
    active: boolean
}

type StockForm = {
    batch_number: string
    expiry_date: string
    quantity: string
    unit_price: string
    minimum_stock: string
}

type ManualForm = {
    name: string
    generic_name: string
    brand_name: string
    form: string
    strength: string
    unit: string
    category: string
    kfa_code: string
    is_narcotics: boolean
    is_psychotropics: boolean
    requires_prescription: boolean
}

type SelectedItem = {
    id: string
    kfa_item: KFAItem | null
    manual: ManualForm | null
    stock: StockForm
}

const EMPTY_STOCK: StockForm = { batch_number: '', expiry_date: '', quantity: '', unit_price: '', minimum_stock: '10' }
const EMPTY_MANUAL: ManualForm = {
    name: '', generic_name: '', brand_name: '', form: '', strength: '',
    unit: 'tablet', category: '', kfa_code: '',
    is_narcotics: false, is_psychotropics: false, requires_prescription: true,
}

export default function MedicationsPage() {
    // ── List state ──
    const [meds, setMeds] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [showInactive, setShowInactive] = useState(false)
    const [total, setTotal] = useState(0)
    const [togglingIds, setTogglingIds] = useState<Record<string, boolean>>({})

    // ── Mode ──
    const [mode, setMode] = useState<'list' | 'add'>('list')

    // ── KFA browser state ──
    const [kfaSearch, setKfaSearch] = useState('')
    const [kfaItems, setKfaItems] = useState<KFAItem[]>([])
    const [kfaTotal, setKfaTotal] = useState(0)
    const [kfaPage, setKfaPage] = useState(1)
    const [kfaLoading, setKfaLoading] = useState(false)
    const kfaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const kfaSearchRef = useRef('')
    const listDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ── Selected items ──
    const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])

    // ── Stock detail dialog ──
    const [stockDialogOpen, setStockDialogOpen] = useState(false)
    const [stockDialogKfa, setStockDialogKfa] = useState<KFAItem | null>(null)
    const [stockDialogEditIdx, setStockDialogEditIdx] = useState<number | null>(null)
    const [stockForm, setStockForm] = useState<StockForm>({ ...EMPTY_STOCK })

    // ── Manual input dialog ──
    const [manualDialogOpen, setManualDialogOpen] = useState(false)
    const [manualDialogEditIdx, setManualDialogEditIdx] = useState<number | null>(null)
    const [manualForm, setManualForm] = useState<ManualForm>({ ...EMPTY_MANUAL })
    const [manualStock, setManualStock] = useState<StockForm>({ ...EMPTY_STOCK })

    const [saving, setSaving] = useState(false)

    // ── Fetch medications list ──
    const fetchMeds = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (debouncedSearch) params.set('search', debouncedSearch)
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
    }, [debouncedSearch, showInactive])

    useEffect(() => { fetchMeds() }, [fetchMeds])

    // ── KFA fetch ──
    const fetchKfa = useCallback(async (q: string, page: number) => {
        setKfaLoading(true)
        try {
            const res = await fetch(`/api/cms/medications/kfa-search?q=${encodeURIComponent(q)}&size=${KFA_PAGE_SIZE}&page=${page}`)
            const d = await res.json()
            if (d.success) {
                setKfaItems(d.data ?? [])
                setKfaTotal(d.meta?.total ?? 0)
            } else {
                setKfaItems([])
                setKfaTotal(0)
                toast.warning('KFA tidak tersedia — gunakan input manual')
            }
        } catch {
            setKfaItems([])
            setKfaTotal(0)
        } finally {
            setKfaLoading(false)
        }
    }, [])

    // Fetch KFA on entering add mode (prefetches token too)
    useEffect(() => {
        if (mode === 'add') {
            setKfaPage(1)
            fetchKfa('', 1)
        }
    }, [mode, fetchKfa])

    // ── KFA search input: debounce 500ms, reset page ──
    const handleKfaSearchChange = (value: string) => {
        setKfaSearch(value)
        kfaSearchRef.current = value
        if (kfaDebounceRef.current) clearTimeout(kfaDebounceRef.current)
        kfaDebounceRef.current = setTimeout(() => {
            setKfaPage(1)
            fetchKfa(value, 1)
        }, 500)
    }

    const handleKfaPageChange = (newPage: number) => {
        setKfaPage(newPage)
        fetchKfa(kfaSearchRef.current, newPage)
    }

    const handleListSearchChange = (value: string) => {
        setSearch(value)
        if (listDebounceRef.current) clearTimeout(listDebounceRef.current)
        listDebounceRef.current = setTimeout(() => setDebouncedSearch(value), 500)
    }

    // ── Selection helpers ──
    const isKfaSelected = (kfaCode: string) =>
        selectedItems.some(i => i.kfa_item?.kfa_code === kfaCode)

    const isPending = (kfaCode: string) =>
        !isKfaSelected(kfaCode) && stockDialogKfa?.kfa_code === kfaCode && stockDialogOpen

    const handleCheckKfa = (item: KFAItem, checked: boolean) => {
        if (checked) {
            if (!isKfaSelected(item.kfa_code)) {
                setStockForm({ ...EMPTY_STOCK })
                setStockDialogKfa(item)
                setStockDialogEditIdx(null)
                setStockDialogOpen(true)
            }
        } else {
            setSelectedItems(prev => prev.filter(i => i.kfa_item?.kfa_code !== item.kfa_code))
            if (stockDialogKfa?.kfa_code === item.kfa_code) {
                setStockDialogOpen(false)
                setStockDialogKfa(null)
            }
        }
    }

    // ── Stock dialog confirm ──
    const handleStockConfirm = () => {
        if (!stockForm.quantity || !stockForm.unit_price) {
            toast.error('Jumlah dan harga satuan wajib diisi')
            return
        }
        if (stockDialogEditIdx !== null) {
            setSelectedItems(prev => prev.map((item, i) =>
                i === stockDialogEditIdx ? { ...item, stock: { ...stockForm } } : item
            ))
        } else if (stockDialogKfa) {
            setSelectedItems(prev => [...prev, {
                id: `kfa-${stockDialogKfa.kfa_code}`,
                kfa_item: stockDialogKfa,
                manual: null,
                stock: { ...stockForm },
            }])
        }
        setStockDialogOpen(false)
        setStockDialogKfa(null)
        setStockDialogEditIdx(null)
    }

    // ── Selected item actions ──
    const editSelectedItem = (index: number) => {
        const item = selectedItems[index]
        if (item.kfa_item) {
            setStockForm({ ...item.stock })
            setStockDialogKfa(item.kfa_item)
            setStockDialogEditIdx(index)
            setStockDialogOpen(true)
        } else {
            setManualForm(item.manual ? { ...item.manual } : { ...EMPTY_MANUAL })
            setManualStock({ ...item.stock })
            setManualDialogEditIdx(index)
            setManualDialogOpen(true)
        }
    }

    const removeSelectedItem = (index: number) => {
        setSelectedItems(prev => prev.filter((_, i) => i !== index))
    }

    // ── Manual dialog ──
    const openManualDialog = () => {
        setManualForm({ ...EMPTY_MANUAL })
        setManualStock({ ...EMPTY_STOCK })
        setManualDialogEditIdx(null)
        setManualDialogOpen(true)
    }

    const handleManualConfirm = () => {
        if (!manualForm.name.trim() || !manualForm.unit.trim()) {
            toast.error('Nama obat dan satuan wajib diisi')
            return
        }
        if (!manualStock.quantity || !manualStock.unit_price) {
            toast.error('Jumlah dan harga satuan wajib diisi')
            return
        }
        if (manualDialogEditIdx !== null) {
            setSelectedItems(prev => prev.map((item, i) =>
                i === manualDialogEditIdx ? { ...item, manual: { ...manualForm }, stock: { ...manualStock } } : item
            ))
        } else {
            setSelectedItems(prev => [...prev, {
                id: `manual-${Date.now()}`,
                kfa_item: null,
                manual: { ...manualForm },
                stock: { ...manualStock },
            }])
        }
        setManualDialogOpen(false)
        setManualDialogEditIdx(null)
    }

    // ── Bulk save ──
    const handleSaveAll = async () => {
        if (selectedItems.length === 0) return
        setSaving(true)
        let succeeded = 0
        let failed = 0
        for (const item of selectedItems) {
            try {
                const res = await fetch('/api/cms/medications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: item.kfa_item?.name ?? item.manual?.name,
                        generic_name: item.kfa_item?.generic_name || item.manual?.generic_name || undefined,
                        brand_name: item.kfa_item?.brand_name || item.manual?.brand_name || undefined,
                        form: item.kfa_item?.form || item.manual?.form || undefined,
                        strength: item.kfa_item?.strength || item.manual?.strength || undefined,
                        unit: item.kfa_item?.unit ?? item.manual?.unit,
                        category: item.manual?.category || undefined,
                        kfa_code: item.kfa_item?.kfa_code || item.manual?.kfa_code || undefined,
                        ss_medication_id: item.kfa_item?.ss_medication_id || undefined,
                        is_narcotics: item.manual?.is_narcotics ?? false,
                        is_psychotropics: item.manual?.is_psychotropics ?? false,
                        requires_prescription: item.manual?.requires_prescription ?? true,
                        stock: {
                            batch_number: item.stock.batch_number || undefined,
                            expiry_date: item.stock.expiry_date || undefined,
                            quantity: parseFloat(item.stock.quantity) || 0,
                            unit_price: parseFloat(item.stock.unit_price) || 0,
                            minimum_stock: parseInt(item.stock.minimum_stock) || 10,
                        },
                    }),
                })
                const d = await res.json()
                if (!d.success) throw new Error(d.error ?? 'Gagal')
                succeeded++
            } catch {
                failed++
            }
        }
        setSaving(false)
        if (succeeded > 0) toast.success(`${succeeded} obat berhasil disimpan`)
        if (failed > 0) toast.error(`${failed} obat gagal disimpan`)
        if (succeeded > 0) {
            setMode('list')
            setSelectedItems([])
            setKfaSearch('')
            setKfaItems([])
            setKfaTotal(0)
            fetchMeds()
        }
    }

    const cancelAdd = () => {
        setMode('list')
        setSelectedItems([])
        setKfaSearch('')
        kfaSearchRef.current = ''
        setKfaItems([])
        setKfaTotal(0)
        setKfaPage(1)
    }

    // ── List actions ──
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
    const totalPages = Math.ceil(kfaTotal / KFA_PAGE_SIZE)

    // ─────────────────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Pill className="w-8 h-8 text-primary" />
                        Manajemen Obat
                    </h1>
                    <p className="text-foreground/60 mt-1">Setup master data obat dan stok awal klinik</p>
                </div>
                {mode === 'list' ? (
                    <Button onClick={() => setMode('add')} className="gap-2">
                        <Plus className="w-4 h-4" /> Tambah Obat
                    </Button>
                ) : (
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={cancelAdd} className="gap-2">
                            <ArrowLeft className="w-4 h-4" /> Batal
                        </Button>
                        <Button
                            onClick={handleSaveAll}
                            disabled={selectedItems.length === 0 || saving}
                            className="gap-2"
                        >
                            {saving
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                                : <><Package className="w-4 h-4" /> Simpan {selectedItems.length} Obat</>
                            }
                        </Button>
                    </div>
                )}
            </div>

            {/* Below-min alert */}
            {belowMinCount > 0 && mode === 'list' && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {belowMinCount} obat stok di bawah minimum
                </div>
            )}

            {/* ── LIST MODE ──────────────────────────────────────────────────── */}
            {mode === 'list' && (
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
                                        onChange={e => handleListSearchChange(e.target.value)}
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
            )}

            {/* ── ADD MODE ───────────────────────────────────────────────────── */}
            {mode === 'add' && (
                <div className="flex gap-4 min-h-[600px] items-start">
                    {/* Left — KFA browser */}
                    <div className="flex-1 space-y-3 min-w-0">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                            <Input
                                className="pl-8"
                                placeholder="Cari obat di SATUSEHAT KFA (min. 3 karakter)..."
                                value={kfaSearch}
                                onChange={e => handleKfaSearchChange(e.target.value)}
                                autoFocus
                            />
                            {kfaLoading && (
                                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
                            )}
                        </div>

                        {kfaSearch.length > 0 && kfaSearch.length < 3 && (
                            <p className="text-sm text-foreground/40 pl-1">Ketik minimal 3 karakter untuk filter</p>
                        )}

                        {kfaLoading && kfaItems.length === 0 && (
                            <div className="flex justify-center py-12">
                                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                            </div>
                        )}

                        {!kfaLoading && kfaItems.length === 0 && (
                            <div className="text-center py-10 text-foreground/40">
                                <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p>{kfaSearch ? 'Tidak ditemukan di KFA SATUSEHAT' : 'Data KFA tidak tersedia'}</p>
                                <p className="text-xs mt-1">Gunakan &quot;Input Manual&quot; di panel kanan</p>
                            </div>
                        )}

                        {kfaItems.length > 0 && (
                            <>
                                <div className="relative border border-border/40 rounded-lg overflow-hidden">
                                    {kfaLoading && (
                                        <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-[1px] flex items-center justify-center rounded-lg">
                                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                        </div>
                                    )}
                                    <div className="overflow-x-auto">
                                    <Table className="table-fixed w-full">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-10"></TableHead>
                                                <TableHead className="w-[38%]">Nama Produk</TableHead>
                                                <TableHead className="w-[18%]">Zat Aktif</TableHead>
                                                <TableHead className="w-[12%]">Bentuk</TableHead>
                                                <TableHead className="w-[12%]">Kekuatan</TableHead>
                                                <TableHead className="w-[10%]">Satuan</TableHead>
                                                <TableHead className="w-[10%]">Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {kfaItems.map(item => {
                                                const selected = isKfaSelected(item.kfa_code)
                                                const pending = isPending(item.kfa_code)
                                                return (
                                                    <TableRow
                                                        key={item.kfa_code}
                                                        className={selected ? 'bg-primary/5' : ''}
                                                    >
                                                        <TableCell>
                                                            <Checkbox
                                                                checked={selected || pending}
                                                                onCheckedChange={checked => handleCheckKfa(item, !!checked)}
                                                                disabled={!item.active}
                                                                className={pending ? 'opacity-60' : ''}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="min-w-0">
                                                            <p className="text-sm font-medium leading-tight truncate" title={item.name}>{item.name}</p>
                                                            {item.manufacturer && (
                                                                <p className="text-xs text-foreground/40 mt-0.5 truncate">{item.manufacturer}</p>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-sm text-foreground/70 truncate">{item.generic_name || '-'}</TableCell>
                                                        <TableCell className="text-sm truncate">{item.form || '-'}</TableCell>
                                                        <TableCell className="text-sm truncate">{item.strength || '-'}</TableCell>
                                                        <TableCell className="text-sm truncate">{item.unit}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={item.active ? 'default' : 'secondary'} className="text-xs">
                                                                {item.active ? 'Valid' : 'Tidak Aktif'}
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                    </div>
                                </div>

                                {/* Pagination */}
                                {totalPages > 0 && (
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-foreground/50">
                                            {kfaTotal.toLocaleString('id-ID')} hasil
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                onClick={() => handleKfaPageChange(kfaPage - 1)}
                                                disabled={kfaPage <= 1 || kfaLoading}
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </Button>
                                            {(() => {
                                                const pages: number[] = []
                                                const start = Math.max(1, kfaPage - 2)
                                                const end = Math.min(totalPages, kfaPage + 2)
                                                for (let i = start; i <= end; i++) pages.push(i)
                                                return pages.map(p => (
                                                    <Button
                                                        key={p}
                                                        variant={p === kfaPage ? 'default' : 'outline'}
                                                        size="sm"
                                                        className="h-8 w-8 p-0"
                                                        onClick={() => handleKfaPageChange(p)}
                                                        disabled={kfaLoading}
                                                    >
                                                        {p}
                                                    </Button>
                                                ))
                                            })()}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                onClick={() => handleKfaPageChange(kfaPage + 1)}
                                                disabled={kfaPage >= totalPages || kfaLoading}
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Right — Selected items panel */}
                    <div className="w-72 shrink-0 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">Dipilih ({selectedItems.length})</p>
                            <Button variant="outline" size="sm" onClick={openManualDialog} className="gap-1 text-xs h-7">
                                <Plus className="w-3 h-3" /> Input Manual
                            </Button>
                        </div>

                        {selectedItems.length === 0 ? (
                            <div className="border-2 border-dashed border-border/40 rounded-lg p-5 text-center text-sm text-foreground/40">
                                Pilih obat dari tabel atau tambah manual
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[520px] overflow-y-auto">
                                {selectedItems.map((item, index) => {
                                    const name = item.kfa_item?.name ?? item.manual?.name ?? '-'
                                    const sub = item.kfa_item
                                        ? [item.kfa_item.form, item.kfa_item.strength].filter(Boolean).join(' · ')
                                        : [item.manual?.form, item.manual?.strength].filter(Boolean).join(' · ')
                                    return (
                                        <div key={item.id} className="border border-border/50 rounded-lg p-3 space-y-1.5">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium leading-tight line-clamp-2">{name}</p>
                                                    {sub && <p className="text-xs text-foreground/50 mt-0.5">{sub}</p>}
                                                </div>
                                                <div className="flex gap-0.5 shrink-0">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() => editSelectedItem(index)}
                                                        title="Edit"
                                                    >
                                                        <Edit2 className="w-3 h-3" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-destructive/70 hover:text-destructive"
                                                        onClick={() => removeSelectedItem(index)}
                                                        title="Hapus"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="text-xs text-foreground/50">
                                                {item.stock.quantity} {item.kfa_item?.unit ?? item.manual?.unit} ·{' '}
                                                Rp {parseFloat(item.stock.unit_price || '0').toLocaleString('id-ID')}
                                            </div>
                                            {!item.kfa_item && (
                                                <Badge variant="outline" className="text-[10px] px-1 py-0">Manual</Badge>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {selectedItems.length > 0 && (
                            <Button className="w-full gap-2" onClick={handleSaveAll} disabled={saving}>
                                {saving
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                                    : <><Package className="w-4 h-4" /> Simpan {selectedItems.length} Obat</>
                                }
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* ── STOCK DETAIL DIALOG ───────────────────────────────────────── */}
            <Dialog
                open={stockDialogOpen}
                onOpenChange={open => {
                    if (!open) {
                        setStockDialogOpen(false)
                        setStockDialogKfa(null)
                        setStockDialogEditIdx(null)
                    }
                }}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {stockDialogEditIdx !== null ? 'Edit Detail Stok' : 'Input Detail Stok'}
                        </DialogTitle>
                    </DialogHeader>
                    {stockDialogKfa && (
                        <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-0.5">
                            <p className="font-medium leading-tight">{stockDialogKfa.name}</p>
                            <p className="text-foreground/50 text-xs">
                                {[stockDialogKfa.form, stockDialogKfa.strength].filter(Boolean).join(' · ')}
                            </p>
                            <p className="text-foreground/40 text-xs font-mono">KFA: {stockDialogKfa.kfa_code}</p>
                        </div>
                    )}
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Jumlah <span className="text-destructive">*</span></Label>
                                <Input
                                    type="number" min="0" placeholder="0"
                                    value={stockForm.quantity}
                                    onChange={e => setStockForm(f => ({ ...f, quantity: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Harga Satuan (Rp) <span className="text-destructive">*</span></Label>
                                <Input
                                    type="number" min="0" placeholder="0"
                                    value={stockForm.unit_price}
                                    onChange={e => setStockForm(f => ({ ...f, unit_price: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">No. Batch (opsional)</Label>
                            <Input
                                placeholder="BATCH-001"
                                value={stockForm.batch_number}
                                onChange={e => setStockForm(f => ({ ...f, batch_number: e.target.value }))}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Tanggal Kadaluarsa</Label>
                                <Input
                                    type="date"
                                    value={stockForm.expiry_date}
                                    onChange={e => setStockForm(f => ({ ...f, expiry_date: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Stok Minimum</Label>
                                <Input
                                    type="number" min="0"
                                    value={stockForm.minimum_stock}
                                    onChange={e => setStockForm(f => ({ ...f, minimum_stock: e.target.value }))}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setStockDialogOpen(false)}>Batal</Button>
                        <Button onClick={handleStockConfirm}>
                            {stockDialogEditIdx !== null ? 'Update' : 'Tambahkan'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── MANUAL INPUT DIALOG ───────────────────────────────────────── */}
            <Dialog
                open={manualDialogOpen}
                onOpenChange={open => {
                    if (!open) {
                        setManualDialogOpen(false)
                        setManualDialogEditIdx(null)
                    }
                }}
            >
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {manualDialogEditIdx !== null ? 'Edit Obat Manual' : 'Input Obat Manual'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5">
                        <div className="space-y-3">
                            <p className="text-xs font-semibold text-foreground/50 uppercase tracking-wide">Info Obat</p>
                            <div className="space-y-1">
                                <Label className="text-xs">Nama Obat <span className="text-destructive">*</span></Label>
                                <Input
                                    placeholder="Cth: Paracetamol 500mg Tablet"
                                    value={manualForm.name}
                                    onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs">Nama Generik</Label>
                                    <Input
                                        placeholder="Paracetamol"
                                        value={manualForm.generic_name}
                                        onChange={e => setManualForm(f => ({ ...f, generic_name: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Nama Dagang</Label>
                                    <Input
                                        placeholder="Sanmol, Panadol..."
                                        value={manualForm.brand_name}
                                        onChange={e => setManualForm(f => ({ ...f, brand_name: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs">Bentuk Sediaan</Label>
                                    <select
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={manualForm.form}
                                        onChange={e => setManualForm(f => ({ ...f, form: e.target.value }))}
                                    >
                                        <option value="">Pilih...</option>
                                        {FORMS.map(fo => <option key={fo} value={fo}>{fo}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Kekuatan / Dosis</Label>
                                    <Input
                                        placeholder="500mg"
                                        value={manualForm.strength}
                                        onChange={e => setManualForm(f => ({ ...f, strength: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs">Satuan <span className="text-destructive">*</span></Label>
                                    <select
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={manualForm.unit}
                                        onChange={e => setManualForm(f => ({ ...f, unit: e.target.value }))}
                                    >
                                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Kategori</Label>
                                    <select
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={manualForm.category}
                                        onChange={e => setManualForm(f => ({ ...f, category: e.target.value }))}
                                    >
                                        <option value="">Pilih...</option>
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Kode KFA (opsional)</Label>
                                <Input
                                    placeholder="93000396"
                                    value={manualForm.kfa_code}
                                    onChange={e => setManualForm(f => ({ ...f, kfa_code: e.target.value }))}
                                />
                            </div>
                            <div className="flex gap-6 flex-wrap pt-1">
                                <label className="flex items-center gap-2 cursor-pointer text-sm">
                                    <Switch
                                        checked={manualForm.is_narcotics}
                                        onCheckedChange={v => setManualForm(f => ({ ...f, is_narcotics: v }))}
                                    />
                                    Narkotika
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer text-sm">
                                    <Switch
                                        checked={manualForm.is_psychotropics}
                                        onCheckedChange={v => setManualForm(f => ({ ...f, is_psychotropics: v }))}
                                    />
                                    Psikotropika
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer text-sm">
                                    <Switch
                                        checked={manualForm.requires_prescription}
                                        onCheckedChange={v => setManualForm(f => ({ ...f, requires_prescription: v }))}
                                    />
                                    Perlu Resep
                                </label>
                            </div>
                        </div>

                        <div className="space-y-3 pt-2 border-t border-border/40">
                            <p className="text-xs font-semibold text-foreground/50 uppercase tracking-wide flex items-center gap-1.5">
                                <Package className="w-3.5 h-3.5" /> Stok Awal
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs">Jumlah <span className="text-destructive">*</span></Label>
                                    <Input
                                        type="number" min="0" placeholder="0"
                                        value={manualStock.quantity}
                                        onChange={e => setManualStock(s => ({ ...s, quantity: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Harga Satuan (Rp) <span className="text-destructive">*</span></Label>
                                    <Input
                                        type="number" min="0" placeholder="0"
                                        value={manualStock.unit_price}
                                        onChange={e => setManualStock(s => ({ ...s, unit_price: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">No. Batch (opsional)</Label>
                                <Input
                                    placeholder="BATCH-001"
                                    value={manualStock.batch_number}
                                    onChange={e => setManualStock(s => ({ ...s, batch_number: e.target.value }))}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs">Tanggal Kadaluarsa</Label>
                                    <Input
                                        type="date"
                                        value={manualStock.expiry_date}
                                        onChange={e => setManualStock(s => ({ ...s, expiry_date: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Stok Minimum</Label>
                                    <Input
                                        type="number" min="0"
                                        value={manualStock.minimum_stock}
                                        onChange={e => setManualStock(s => ({ ...s, minimum_stock: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setManualDialogOpen(false)}>Batal</Button>
                        <Button onClick={handleManualConfirm}>
                            {manualDialogEditIdx !== null ? 'Update' : 'Tambahkan'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
