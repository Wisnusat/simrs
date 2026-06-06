/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Stethoscope, Plus, Loader2, Pencil, Trash2 } from 'lucide-react'
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
            const res = await fetch(`/api/cms/poli/${id}`, {
                method: 'DELETE',
            })
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
                    <p className="text-foreground/60 mt-1">Kelola layanan poli rumah sakit</p>
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
                                <TableHead className="text-right w-[150px]">Aksi</TableHead>
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
                                        <div className="flex items-center justify-end gap-2">
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
        </div>
    )
}
