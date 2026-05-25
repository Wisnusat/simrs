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
import { Stethoscope, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function ServicesPage() {
    const [services, setServices] = useState<any[]>([])
    const [locations, setLocations] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [showDialog, setShowDialog] = useState(false)
    const [saving, setSaving] = useState(false)
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
                <Button onClick={() => setShowDialog(true)} className="gap-2">
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
                                <TableHead>Kuota/Hari</TableHead>
                                <TableHead>Lokasi</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {services.map((svc: any) => (
                                <TableRow key={svc.id}>
                                    <TableCell className="font-medium">{svc.name}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{svc.code}</Badge>
                                    </TableCell>
                                    <TableCell>{svc.quota_per_day}</TableCell>
                                    <TableCell>{svc.locations?.name ?? '-'}</TableCell>
                                    <TableCell>
                                        <Badge variant={svc.is_active ? 'default' : 'secondary'}>
                                            {svc.is_active ? 'Aktif' : 'Nonaktif'}
                                        </Badge>
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

            {/* Add Poli Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Tambah Poli Baru</DialogTitle>
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
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Kode</Label>
                                <Input
                                    value={form.code}
                                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                                    placeholder="UMUM"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Kuota / Hari</Label>
                                <Input
                                    type="number"
                                    value={form.quota_per_day}
                                    onChange={e => setForm(f => ({ ...f, quota_per_day: parseInt(e.target.value) || 30 }))}
                                />
                            </div>
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
                        <Button onClick={handleCreate} disabled={saving} className="gap-2">
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                            Simpan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
