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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Users, Plus, Loader2, MoreHorizontal, Pencil, UserX, UserCheck, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

const ROLE_OPTIONS = [
    { value: 'owner', label: 'Owner' },
    { value: 'admin', label: 'Administrator' },
    { value: 'doctor', label: 'Dokter' },
    { value: 'nurse', label: 'Perawat' },
    { value: 'lab_nurse', label: 'Perawat Lab' },
    { value: 'pharmacist', label: 'Apoteker' },
    { value: 'nutritionist', label: 'Ahli Gizi' },
    { value: 'cashier', label: 'Kasir' },
]

const GENDER_OPTIONS = [
    { value: 'male', label: 'Laki-laki' },
    { value: 'female', label: 'Perempuan' },
]

function getRoleBadgeColor(role: string) {
    switch (role) {
        case 'owner': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
        case 'admin': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
        case 'doctor': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
        case 'nurse': return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200'
        case 'pharmacist': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
        case 'cashier': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
        case 'lab_nurse': return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200'
        case 'nutritionist': return 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200'
        default: return 'bg-gray-100 text-gray-800'
    }
}

function getRoleLabel(role: string) {
    return ROLE_OPTIONS.find(r => r.value === role)?.label ?? role
}

interface StaffForm {
    full_name: string
    email: string
    password: string
    role: string
    specialization: string
    gender: string
    phone: string
    nik: string
    nip: string
    str_number: string
    sip_number: string
    poli_service_id: string
}

const emptyForm: StaffForm = {
    full_name: '', email: '', password: '', role: '', specialization: '', gender: '', phone: '',
    nik: '', nip: '', str_number: '', sip_number: '', poli_service_id: '',
}

export default function StaffPage() {
    const [staff, setStaff] = useState<any[]>([])
    const [poliServices, setPoliServices] = useState<{ id: string; name: string }[]>([])
    const [loading, setLoading] = useState(true)
    const [showDialog, setShowDialog] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState<StaffForm>(emptyForm)
    const [showPassword, setShowPassword] = useState(false)
    const [filterRole, setFilterRole] = useState<string>('')
    const [showInactive, setShowInactive] = useState(false)
    const [search, setSearch] = useState('')

    useEffect(() => {
        fetch('/api/cms/poli')
            .then(r => r.json())
            .then(d => { if (d.success) setPoliServices(d.data ?? []) })
            .catch(() => {})
    }, [])

    const fetchStaff = useCallback(async () => {
        try {
            const params = new URLSearchParams()
            if (filterRole) params.set('role', filterRole)
            if (showInactive) params.set('active', 'false')
            const res = await fetch(`/api/cms/staff?${params.toString()}`)
            if (res.ok) {
                const data = await res.json()
                setStaff(data.data ?? [])
            }
        } catch (err) {
            console.error('Fetch staff error:', err)
        } finally {
            setLoading(false)
        }
    }, [filterRole, showInactive])

    useEffect(() => { fetchStaff() }, [fetchStaff])

    const handleOpenCreate = () => {
        setForm(emptyForm)
        setEditingId(null)
        setShowPassword(false)
        setShowDialog(true)
    }

    const handleOpenEdit = (member: any) => {
        setForm({
            full_name: member.full_name ?? '',
            email: member.email ?? '',
            password: '',
            role: member.role ?? '',
            specialization: member.specialization ?? '',
            gender: member.gender ?? '',
            phone: member.phone ?? '',
            nik: member.nik ?? '',
            nip: member.nip ?? '',
            str_number: member.str_number ?? '',
            sip_number: member.sip_number ?? '',
            poli_service_id: member.poli_service_id ?? '',
        })
        setEditingId(member.id)
        setShowPassword(false)
        setShowDialog(true)
    }

    const handleSave = async () => {
        if (!form.full_name || !form.role) {
            toast.error('Nama dan role wajib diisi')
            return
        }
        setSaving(true)
        try {
            const url = editingId ? `/api/cms/staff/${editingId}` : '/api/cms/staff'
            const method = editingId ? 'PATCH' : 'POST'
            const payload = {
                ...form,
                poli_service_id: form.poli_service_id || null,
            }
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (data.success) {
                toast.success(editingId ? 'Staf berhasil diperbarui' : 'Staf berhasil ditambahkan')
                setShowDialog(false)
                fetchStaff()
            } else {
                toast.error(data.error ?? 'Gagal menyimpan')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        } finally {
            setSaving(false)
        }
    }

    const handleToggleActive = async (member: any) => {
        try {
            const res = await fetch(`/api/cms/staff/${member.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !member.is_active }),
            })
            const data = await res.json()
            if (data.success) {
                toast.success(`Staf berhasil ${member.is_active ? 'dinonaktifkan' : 'diaktifkan'}`)
                fetchStaff()
            }
        } catch {
            toast.error('Gagal mengubah status')
        }
    }

    const filteredStaff = staff.filter(s =>
        s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        s.email?.toLowerCase().includes(search.toLowerCase())
    )

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        <Users className="w-8 h-8 text-primary" />
                        Manajemen Staf
                    </h1>
                    <p className="text-foreground/60 mt-1">Kelola akun dan data staf rumah sakit</p>
                </div>
                <Button onClick={handleOpenCreate} className="gap-2">
                    <Plus className="w-4 h-4" /> Tambah Staf
                </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
                <Input
                    placeholder="Cari nama atau email..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="max-w-xs"
                />
                <select
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={filterRole}
                    onChange={e => setFilterRole(e.target.value)}
                >
                    <option value="">Semua Role</option>
                    {ROLE_OPTIONS.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                </select>
                <Button
                    variant={showInactive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setShowInactive(!showInactive)}
                >
                    {showInactive ? 'Semua Status' : 'Tampilkan Nonaktif'}
                </Button>
            </div>

            <Card className="border border-border/40">
                <CardHeader>
                    <CardTitle>Daftar Staf ({filteredStaff.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nama</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Spesialisasi</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Telepon</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-10" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredStaff.map((member: any) => (
                                    <TableRow key={member.id} className={!member.is_active ? 'opacity-50' : ''}>
                                        <TableCell className="font-medium">{member.full_name}</TableCell>
                                        <TableCell>
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleBadgeColor(member.role)}`}>
                                                {getRoleLabel(member.role)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-foreground/60">{member.specialization ?? '-'}</TableCell>
                                        <TableCell className="text-foreground/60">{member.email ?? '-'}</TableCell>
                                        <TableCell className="text-foreground/60">{member.phone ?? '-'}</TableCell>
                                        <TableCell>
                                            <Badge variant={member.is_active ? 'default' : 'secondary'}>
                                                {member.is_active ? 'Aktif' : 'Nonaktif'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm">
                                                        <MoreHorizontal className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleOpenEdit(member)}>
                                                        <Pencil className="w-4 h-4 mr-2" /> Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleToggleActive(member)}>
                                                        {member.is_active
                                                            ? <><UserX className="w-4 h-4 mr-2" /> Nonaktifkan</>
                                                            : <><UserCheck className="w-4 h-4 mr-2" /> Aktifkan</>
                                                        }
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredStaff.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center text-foreground/40 py-8">
                                            Tidak ada data staf
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Add/Edit Staff Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingId ? 'Edit Staf' : 'Tambah Staf Baru'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Nama Lengkap *</Label>
                                <Input
                                    value={form.full_name}
                                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                                    placeholder="dr. Nama Lengkap"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Role *</Label>
                                <select
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={form.role}
                                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                                >
                                    <option value="">Pilih role...</option>
                                    {ROLE_OPTIONS.map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input
                                    type="email"
                                    value={form.email}
                                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                    placeholder="email@rumahsakit.com"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Telepon</Label>
                                <Input
                                    value={form.phone}
                                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                    placeholder="081234567890"
                                />
                            </div>
                        </div>

                        {/* Password — only shown when creating new staff */}
                        {!editingId && (
                            <div className="space-y-2">
                                <Label>
                                    Password Akun
                                    <span className="ml-1.5 text-xs font-normal text-foreground/40">(opsional — kosongkan jika staf mendaftar sendiri)</span>
                                </Label>
                                <div className="relative">
                                    <Input
                                        type={showPassword ? 'text' : 'password'}
                                        value={form.password}
                                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                                        placeholder="Minimal 8 karakter"
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {form.password && form.password.length < 8 && (
                                    <p className="text-xs text-destructive">Password minimal 8 karakter</p>
                                )}
                                {form.email && form.password && (
                                    <p className="text-xs text-green-600 dark:text-green-400">Akun login akan dibuat dengan email dan password ini.</p>
                                )}
                                {form.email && !form.password && (
                                    <p className="text-xs text-foreground/40">Tanpa password, data staf disimpan tanpa akun login.</p>
                                )}
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Spesialisasi</Label>
                                <Input
                                    value={form.specialization}
                                    onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))}
                                    placeholder="Dokter Umum"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Jenis Kelamin</Label>
                                <select
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={form.gender}
                                    onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                                >
                                    <option value="">Pilih...</option>
                                    {GENDER_OPTIONS.map(g => (
                                        <option key={g.value} value={g.value}>{g.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {(form.role === 'doctor' || form.role === 'nurse') && (
                            <div className="space-y-2">
                                <Label>
                                    Poli / Layanan
                                    <span className="ml-1.5 text-xs font-normal text-foreground/40">— untuk filter antrian pasien</span>
                                </Label>
                                <select
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={form.poli_service_id}
                                    onChange={e => setForm(f => ({ ...f, poli_service_id: e.target.value }))}
                                >
                                    <option value="">Tidak ditentukan (tampilkan semua antrian)</option>
                                    {poliServices.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>NIK</Label>
                                <Input
                                    value={form.nik}
                                    onChange={e => setForm(f => ({ ...f, nik: e.target.value }))}
                                    placeholder="320123456789xxxx"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>NIP</Label>
                                <Input
                                    value={form.nip}
                                    onChange={e => setForm(f => ({ ...f, nip: e.target.value }))}
                                    placeholder="1234567890"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>No. STR</Label>
                                <Input
                                    value={form.str_number}
                                    onChange={e => setForm(f => ({ ...f, str_number: e.target.value }))}
                                    placeholder="STR-xxxxxx"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>No. SIP</Label>
                                <Input
                                    value={form.sip_number}
                                    onChange={e => setForm(f => ({ ...f, sip_number: e.target.value }))}
                                    placeholder="SIP-xxxxxx"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDialog(false)}>Batal</Button>
                        <Button onClick={handleSave} disabled={saving} className="gap-2">
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                            {editingId ? 'Simpan Perubahan' : 'Tambah Staf'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
