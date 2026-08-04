/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Stethoscope, Plus, Loader2, Pencil, Trash2, CalendarClock, Clock, UserRound } from 'lucide-react'
import { toast } from 'sonner'

export default function ServicesPage() {
    const [services, setServices] = useState<any[]>([])
    const [locations, setLocations] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [showDialog, setShowDialog] = useState(false)
    const [saving, setSaving] = useState(false)
    const [editingPoli, setEditingPoli] = useState<any | null>(null)
    const [togglingIds, setTogglingIds] = useState<Record<string, boolean>>({})
    const [form, setForm] = useState({
        name: '',
        code: '',
        location_id: '',
        speciality_code: '',
        quota_per_day: 30,
    })

    // Slot management state
    const [slotPoli, setSlotPoli] = useState<any | null>(null)
    const [slots, setSlots] = useState<any[]>([])
    const [slotsLoading, setSlotsLoading] = useState(false)
    const [practitioners, setPractitioners] = useState<any[]>([])
    const [slotForm, setSlotForm] = useState({ start_time: '08:00', end_time: '12:00', quota: 20, practitioner_id: '' })
    const [addingSlot, setAddingSlot] = useState(false)
    const [togglingSlotIds, setTogglingSlotIds] = useState<Record<string, boolean>>({})

    const fetchData = useCallback(async () => {
        try {
            const [servRes, locRes] = await Promise.all([
                fetch('/api/cms/poli'),
                fetch('/api/locations?type=poli'),
            ])
            if (servRes.ok) {
                const d = await servRes.json()
                setServices(d.data ?? [])
            }
            if (locRes.ok) {
                const d = await locRes.json()
                setLocations(d.data ?? [])
            }
        } catch (err) {
            console.error('Fetch error:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchData() }, [fetchData])

    const openAddDialog = () => {
        setEditingPoli(null)
        setForm({ name: '', code: '', location_id: '', speciality_code: '', quota_per_day: 30 })
        setShowDialog(true)
    }

    const openEditDialog = (svc: any) => {
        setEditingPoli(svc)
        setForm({
            name: svc.name,
            code: svc.code,
            location_id: svc.location_id || '',
            speciality_code: svc.speciality_code || '',
            quota_per_day: svc.quota_per_day || 30,
        })
        setShowDialog(true)
    }

    const handleCreate = async () => {
        if (!form.name || !form.code || !form.location_id) {
            toast.error('Nama, kode, dan lokasi wajib diisi')
            return
        }
        setSaving(true)
        try {
            const res = await fetch('/api/cms/poli', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })
            const data = await res.json()
            if (data.success) {
                toast.success('Poli berhasil ditambahkan')
                setShowDialog(false)
                setForm({ name: '', code: '', location_id: '', speciality_code: '', quota_per_day: 30 })
                fetchData()
            } else {
                toast.error(data.error ?? 'Gagal menambahkan poli')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        } finally {
            setSaving(false)
        }
    }

    const handleUpdate = async () => {
        if (!editingPoli) return
        if (!form.name || !form.code || !form.location_id) {
            toast.error('Nama, kode, dan lokasi wajib diisi')
            return
        }
        setSaving(true)
        try {
            const res = await fetch(`/api/cms/poli/${editingPoli.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })
            const data = await res.json()
            if (data.success) {
                toast.success('Poli berhasil diperbarui')
                setShowDialog(false)
                setForm({ name: '', code: '', location_id: '', speciality_code: '', quota_per_day: 30 })
                setEditingPoli(null)
                fetchData()
            } else {
                toast.error(data.error ?? 'Gagal memperbarui poli')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        } finally {
            setSaving(false)
        }
    }

    const handleToggleActive = async (id: string, currentStatus: boolean) => {
        setTogglingIds(prev => ({ ...prev, [id]: true }))
        try {
            const res = await fetch(`/api/cms/poli/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !currentStatus }),
            })
            const data = await res.json()
            if (data.success) {
                toast.success(`Poli berhasil ${!currentStatus ? 'diaktifkan' : 'dinonaktifkan'}`)
                fetchData()
            } else {
                toast.error(data.error ?? 'Gagal mengubah status')
            }
        } catch {
            toast.error('Terjadi kesalahan saat mengubah status')
        } finally {
            setTogglingIds(prev => ({ ...prev, [id]: false }))
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Apakah Anda yakin ingin menghapus poli ini?')) return
        try {
            const res = await fetch(`/api/cms/poli/${id}`, { method: 'DELETE' })
            const data = await res.json()
            if (data.success) {
                toast.success('Poli berhasil dihapus')
                fetchData()
            } else {
                toast.error(data.error ?? 'Gagal menghapus poli')
            }
        } catch {
            toast.error('Terjadi kesalahan saat menghapus')
        }
    }

    // ---- Slot management ----
    const openSlotSheet = async (svc: any) => {
        setSlotPoli(svc)
        setSlotForm({ start_time: '08:00', end_time: '12:00', quota: 20, practitioner_id: '' })
        setSlotsLoading(true)
        try {
            const [slotsRes, staffRes] = await Promise.all([
                fetch(`/api/cms/poli/${svc.id}/slots`),
                fetch('/api/cms/staff?role=doctor&active=true'),
            ])
            if (slotsRes.ok) { const d = await slotsRes.json(); setSlots(d.data ?? []) }
            if (staffRes.ok) { const d = await staffRes.json(); setPractitioners(d.data ?? []) }
        } catch {
            toast.error('Gagal memuat jadwal')
        } finally {
            setSlotsLoading(false)
        }
    }

    const handleAddSlot = async () => {
        if (!slotPoli) return
        if (slotForm.start_time >= slotForm.end_time) {
            toast.error('Jam mulai harus sebelum jam selesai')
            return
        }
        setAddingSlot(true)
        try {
            const res = await fetch(`/api/cms/poli/${slotPoli.id}/slots`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_time: slotForm.start_time,
                    end_time: slotForm.end_time,
                    quota: slotForm.quota,
                    practitioner_id: slotForm.practitioner_id || null,
                }),
            })
            const d = await res.json()
            if (d.success) {
                toast.success('Slot berhasil ditambahkan')
                setSlotForm({ start_time: '08:00', end_time: '12:00', quota: 20, practitioner_id: '' })
                const r = await fetch(`/api/cms/poli/${slotPoli.id}/slots`)
                if (r.ok) { const dd = await r.json(); setSlots(dd.data ?? []) }
            } else {
                toast.error(d.error ?? 'Gagal menambahkan slot')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        } finally {
            setAddingSlot(false)
        }
    }

    const handleToggleSlot = async (slotId: string, current: boolean) => {
        if (!slotPoli) return
        setTogglingSlotIds(prev => ({ ...prev, [slotId]: true }))
        try {
            const res = await fetch(`/api/cms/poli/${slotPoli.id}/slots/${slotId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !current }),
            })
            const d = await res.json()
            if (d.success) {
                setSlots(prev => prev.map(s => s.id === slotId ? { ...s, is_active: !current } : s))
            } else {
                toast.error(d.error ?? 'Gagal mengubah status slot')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        } finally {
            setTogglingSlotIds(prev => ({ ...prev, [slotId]: false }))
        }
    }

    const handleDeleteSlot = async (slotId: string) => {
        if (!slotPoli) return
        if (!confirm('Hapus slot ini?')) return
        try {
            const res = await fetch(`/api/cms/poli/${slotPoli.id}/slots/${slotId}`, { method: 'DELETE' })
            const d = await res.json()
            if (d.success) {
                toast.success('Slot dihapus')
                setSlots(prev => prev.filter(s => s.id !== slotId))
            } else {
                toast.error(d.error ?? 'Gagal menghapus slot')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        }
    }

    const formatTime = (t: string) => t?.slice(0, 5) ?? '-'

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        <Stethoscope className="w-8 h-8 text-primary" />
                        Layanan / Poli
                    </h1>
                    <p className="text-foreground/60 mt-1">Kelola layanan poli dan jadwal slot</p>
                </div>
                <Button onClick={openAddDialog} className="gap-2">
                    <Plus className="w-4 h-4" /> Tambah Poli
                </Button>
            </div>

            <Card className="border border-border/40">
                <CardHeader>
                    <CardTitle>Daftar Poli ({services.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nama</TableHead>
                                <TableHead>Kode</TableHead>
                                <TableHead>Lokasi</TableHead>
                                <TableHead className="w-[120px]">Status</TableHead>
                                <TableHead className="text-right w-[200px]">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {services.map((svc: any) => (
                                <TableRow key={svc.id}>
                                    <TableCell className="font-medium">{svc.name}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{svc.code}</Badge>
                                    </TableCell>
                                    <TableCell>{svc.locations?.name ?? '-'}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={!!svc.is_active}
                                                disabled={togglingIds[svc.id]}
                                                onCheckedChange={() => handleToggleActive(svc.id, !!svc.is_active)}
                                            />
                                            {togglingIds[svc.id] ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                            ) : (
                                                <Badge variant={svc.is_active ? 'default' : 'secondary'}>
                                                    {svc.is_active ? 'Aktif' : 'Nonaktif'}
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openSlotSheet(svc)}
                                                className="gap-1.5 text-xs text-primary hover:text-primary"
                                                title="Kelola Jadwal"
                                            >
                                                <CalendarClock className="w-3.5 h-3.5" />
                                                Jadwal
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openEditDialog(svc)}
                                                title="Edit Poli"
                                            >
                                                <Pencil className="w-4 h-4 text-foreground/70" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(svc.id)}
                                                title="Hapus Poli"
                                            >
                                                <Trash2 className="w-4 h-4 text-destructive/80" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {services.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-foreground/40 py-8">
                                        Belum ada layanan poli
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Poli Dialog (Add / Edit) */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingPoli ? 'Edit Poli' : 'Tambah Poli Baru'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nama Poli</Label>
                            <Input
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="Poli Umum"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Kode</Label>
                            <Input
                                value={form.code}
                                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                                placeholder="UMUM"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Lokasi</Label>
                            <select
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={form.location_id}
                                onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}
                            >
                                <option value="">Pilih lokasi...</option>
                                {locations.map((loc: any) => (
                                    <option key={loc.id} value={loc.id}>{loc.name} {loc.floor ? `(Lt. ${loc.floor})` : ''}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Kode Spesialitas (Opsional)</Label>
                            <Input
                                value={form.speciality_code}
                                onChange={e => setForm(f => ({ ...f, speciality_code: e.target.value }))}
                                placeholder="S001.09"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDialog(false)}>Batal</Button>
                        <Button onClick={editingPoli ? handleUpdate : handleCreate} disabled={saving} className="gap-2">
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                            {editingPoli ? 'Perbarui' : 'Simpan'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Slot Management Sheet */}
            <Sheet open={!!slotPoli} onOpenChange={(open) => { if (!open) setSlotPoli(null) }}>
                <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                    <SheetHeader className="pb-4 border-b">
                        <SheetTitle className="flex items-center gap-2">
                            <CalendarClock className="w-5 h-5 text-primary" />
                            Jadwal — {slotPoli?.name}
                        </SheetTitle>
                    </SheetHeader>

                    <div className="py-6 space-y-6">
                        {/* Existing slots */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-foreground/70 uppercase tracking-wide">Slot Aktif</h3>
                            {slotsLoading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                </div>
                            ) : slots.length === 0 ? (
                                <p className="text-sm text-foreground/40 py-4 text-center">Belum ada slot jadwal</p>
                            ) : (
                                <div className="space-y-2">
                                    {slots.map((slot: any) => (
                                        <div
                                            key={slot.id}
                                            className={`flex items-center justify-between p-3 rounded-lg border ${slot.is_active ? 'border-border bg-background' : 'border-border/40 bg-muted/30 opacity-60'}`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Clock className="w-4 h-4 text-primary shrink-0" />
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium tabular-nums">
                                                        {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-xs text-foreground/50">Kuota {slot.quota}</span>
                                                        {slot.practitioners && (
                                                            <span className="text-xs text-foreground/50 flex items-center gap-1">
                                                                <UserRound className="w-3 h-3" />
                                                                {slot.practitioners.full_name}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {togglingSlotIds[slot.id]
                                                    ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                                    : <Switch
                                                        checked={!!slot.is_active}
                                                        onCheckedChange={() => handleToggleSlot(slot.id, !!slot.is_active)}
                                                    />
                                                }
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => handleDeleteSlot(slot.id)}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Add slot form */}
                        <div className="space-y-4 pt-4 border-t">
                            <h3 className="text-sm font-semibold text-foreground/70 uppercase tracking-wide">Tambah Slot Baru</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Jam Mulai</Label>
                                    <Input
                                        type="time"
                                        value={slotForm.start_time}
                                        onChange={e => setSlotForm(f => ({ ...f, start_time: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Jam Selesai</Label>
                                    <Input
                                        type="time"
                                        value={slotForm.end_time}
                                        onChange={e => setSlotForm(f => ({ ...f, end_time: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Kuota Pasien</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={200}
                                    value={slotForm.quota}
                                    onChange={e => setSlotForm(f => ({ ...f, quota: parseInt(e.target.value) || 20 }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Dokter Jaga (Opsional)</Label>
                                <select
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={slotForm.practitioner_id}
                                    onChange={e => setSlotForm(f => ({ ...f, practitioner_id: e.target.value }))}
                                >
                                    <option value="">Tidak ditentukan</option>
                                    {practitioners.map((p: any) => (
                                        <option key={p.id} value={p.id}>{p.full_name}</option>
                                    ))}
                                </select>
                            </div>
                            <Button onClick={handleAddSlot} disabled={addingSlot} className="w-full gap-2">
                                {addingSlot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Tambah Slot
                            </Button>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
