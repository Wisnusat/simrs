'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserCheck, UserX, Clock, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

const ROLE_LABEL: Record<string, string> = {
    doctor: 'Dokter',
    nurse: 'Perawat',
    pharmacist: 'Apoteker',
    cashier: 'Kasir',
    lab_nurse: 'Perawat Lab',
    nutritionist: 'Ahli Gizi',
}

interface Practitioner {
    id: string
    full_name: string
    email: string
    role: string
    specialization?: string
    phone?: string
    nik?: string
    created_at: string
}

export default function ApprovalsPage() {
    const [pending, setPending] = useState<Practitioner[]>([])
    const [loading, setLoading] = useState(true)
    const [actionId, setActionId] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/cms/staff?active=false')
            const data = await res.json()
            if (data.success) setPending(data.data ?? [])
        } catch {
            toast.error('Gagal memuat data')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const handleApprove = async (id: string, name: string) => {
        setActionId(id)
        try {
            const res = await fetch(`/api/cms/staff/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: true }),
            })
            const data = await res.json()
            if (data.success) {
                toast.success(`${name} berhasil disetujui`)
                setPending(prev => prev.filter(p => p.id !== id))
            } else {
                toast.error(data.error ?? 'Gagal menyetujui')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        } finally {
            setActionId(null)
        }
    }

    const handleReject = async (id: string, name: string) => {
        if (!confirm(`Tolak dan hapus pendaftaran "${name}"?`)) return
        setActionId(id)
        try {
            const res = await fetch(`/api/cms/staff/${id}`, { method: 'DELETE' })
            const data = await res.json()
            if (data.success) {
                toast.success(`Pendaftaran ${name} ditolak`)
                setPending(prev => prev.filter(p => p.id !== id))
            } else {
                toast.error(data.error ?? 'Gagal menolak')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        } finally {
            setActionId(null)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        <Clock className="w-8 h-8 text-primary" />
                        Persetujuan Akun Staf
                    </h1>
                    <p className="text-foreground/60 mt-1">
                        Tinjau dan setujui pendaftaran akun staf baru
                    </p>
                </div>
                <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : pending.length === 0 ? (
                <Card className="border border-border/40">
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-foreground/40">
                        <UserCheck className="w-10 h-10" />
                        <p className="text-sm">Tidak ada pendaftaran yang menunggu persetujuan</p>
                    </CardContent>
                </Card>
            ) : (
                <Card className="border border-border/40">
                    <CardHeader>
                        <CardTitle className="text-base">Menunggu Persetujuan</CardTitle>
                        <CardDescription>{pending.length} pendaftaran baru</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                        {pending.map((p) => (
                            <div
                                key={p.id}
                                className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-muted/20"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-semibold">{p.full_name}</p>
                                        <Badge variant="secondary" className="text-xs">
                                            {ROLE_LABEL[p.role] ?? p.role}
                                        </Badge>
                                        {p.specialization && (
                                            <span className="text-xs text-foreground/50">{p.specialization}</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-foreground/60 mt-0.5">{p.email}</p>
                                    <div className="flex gap-4 mt-1 text-xs text-foreground/40">
                                        {p.phone && <span>HP: {p.phone}</span>}
                                        {p.nik && <span>NIK: {p.nik}</span>}
                                        <span>
                                            Daftar: {new Date(p.created_at).toLocaleDateString('id-ID', {
                                                day: '2-digit', month: 'short', year: 'numeric',
                                            })}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-destructive/50 text-destructive hover:bg-destructive/10"
                                        disabled={actionId === p.id}
                                        onClick={() => handleReject(p.id, p.full_name)}
                                    >
                                        {actionId === p.id
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : <><UserX className="w-4 h-4 mr-1" /> Tolak</>
                                        }
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700"
                                        disabled={actionId === p.id}
                                        onClick={() => handleApprove(p.id, p.full_name)}
                                    >
                                        {actionId === p.id
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : <><UserCheck className="w-4 h-4 mr-1" /> Setujui</>
                                        }
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
