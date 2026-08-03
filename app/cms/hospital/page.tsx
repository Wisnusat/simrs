/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Save, Loader2, Building2, Banknote } from 'lucide-react'
import { toast } from 'sonner'

export default function HospitalInfoPage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [org, setOrg] = useState<any>(null)
    const [form, setForm] = useState({
        name: '',
        address: '',
        phone: '',
        email: '',
        head_name: '',
        medical_fee: '50000',
        action_fee: '50000',
        operational_hours: {
            senin_jumat: { open: '08:00', close: '15:00' },
            sabtu: { open: '08:00', close: '12:00' },
            minggu: { open: '', close: '' },
            igd: '24 Jam',
        } as Record<string, any>,
    })

    useEffect(() => {
        const fetchOrg = async () => {
            try {
                const res = await fetch('/api/cms/organization')
                if (res.ok) {
                    const data = await res.json()
                    if (data.success && data.data) {
                        setOrg(data.data)
                        setForm({
                            name: data.data.name ?? '',
                            address: data.data.address ?? '',
                            phone: data.data.phone ?? '',
                            email: data.data.email ?? '',
                            head_name: data.data.head_name ?? '',
                            medical_fee: String(data.data.medical_fee ?? 50000),
                            action_fee: String(data.data.action_fee ?? 50000),
                            operational_hours: data.data.operational_hours ?? form.operational_hours,
                        })
                    }
                }
            } catch (err) {
                console.error('Fetch org error:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchOrg()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleSave = async () => {
        setSaving(true)
        try {
            const res = await fetch('/api/cms/organization', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    medical_fee: Number(form.medical_fee),
                    action_fee: Number(form.action_fee),
                }),
            })
            const data = await res.json()
            if (data.success) {
                toast.success('Informasi rumah sakit berhasil diperbarui')
                setOrg(data.data)
            } else {
                toast.error(data.error ?? 'Gagal menyimpan')
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
        <div className="space-y-8 max-w-4xl">
            <div>
                <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                    <Building2 className="w-8 h-8 text-primary" />
                    Info Rumah Sakit
                </h1>
                <p className="text-foreground/60 mt-1">Kelola informasi dasar rumah sakit</p>
            </div>

            <Card className="border border-border/40">
                <CardHeader>
                    <CardTitle>Informasi Umum</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nama Rumah Sakit</Label>
                            <Input
                                id="name"
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="Nama rumah sakit"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="head_name">Kepala / Direktur</Label>
                            <Input
                                id="head_name"
                                value={form.head_name}
                                onChange={e => setForm(f => ({ ...f, head_name: e.target.value }))}
                                placeholder="Nama kepala rumah sakit"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="address">Alamat</Label>
                        <Input
                            id="address"
                            value={form.address}
                            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                            placeholder="Alamat lengkap"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="phone">Telepon</Label>
                            <Input
                                id="phone"
                                value={form.phone}
                                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                placeholder="(021) 1234-5678"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={form.email}
                                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                placeholder="info@rumahsakit.com"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border border-border/40">
                <CardHeader>
                    <CardTitle>Jam Operasional</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {[
                        { key: 'senin_jumat', label: 'Senin – Jumat' },
                        { key: 'sabtu', label: 'Sabtu' },
                        { key: 'minggu', label: 'Minggu' },
                    ].map(({ key, label }) => (
                        <div key={key} className="grid grid-cols-3 gap-4 items-center">
                            <Label className="text-sm">{label}</Label>
                            <Input
                                type="time"
                                value={form.operational_hours[key]?.open ?? ''}
                                onChange={e => setForm(f => ({
                                    ...f,
                                    operational_hours: {
                                        ...f.operational_hours,
                                        [key]: { ...f.operational_hours[key], open: e.target.value },
                                    },
                                }))}
                                placeholder="Buka"
                            />
                            <Input
                                type="time"
                                value={form.operational_hours[key]?.close ?? ''}
                                onChange={e => setForm(f => ({
                                    ...f,
                                    operational_hours: {
                                        ...f.operational_hours,
                                        [key]: { ...f.operational_hours[key], close: e.target.value },
                                    },
                                }))}
                                placeholder="Tutup"
                            />
                        </div>
                    ))}
                    <div className="grid grid-cols-3 gap-4 items-center">
                        <Label className="text-sm">IGD / Darurat</Label>
                        <Input
                            className="col-span-2"
                            value={form.operational_hours.igd ?? ''}
                            onChange={e => setForm(f => ({
                                ...f,
                                operational_hours: { ...f.operational_hours, igd: e.target.value },
                            }))}
                            placeholder="24 Jam"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="border border-border/40">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Banknote className="w-5 h-5 text-primary" />
                        Tarif Layanan
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-foreground/60">
                        Tarif default yang digunakan saat membuat tagihan otomatis. Kasir tetap dapat menyesuaikan tiap item.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="medical_fee">Biaya Konsultasi Dokter (per kunjungan)</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground/50">Rp</span>
                                <Input
                                    id="medical_fee"
                                    type="number"
                                    min={0}
                                    step={1000}
                                    className="pl-9"
                                    value={form.medical_fee}
                                    onChange={e => setForm(f => ({ ...f, medical_fee: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="action_fee">Biaya Tindakan Default (per tindakan)</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground/50">Rp</span>
                                <Input
                                    id="action_fee"
                                    type="number"
                                    min={0}
                                    step={1000}
                                    className="pl-9"
                                    value={form.action_fee}
                                    onChange={e => setForm(f => ({ ...f, action_fee: e.target.value }))}
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving} size="lg" className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Simpan Perubahan
                </Button>
            </div>
        </div>
    )
}
