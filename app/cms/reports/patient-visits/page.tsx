/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { UserCheck, Download, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export default function PatientVisitsReportPage() {
    const now = new Date()
    const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0])
    const [to, setTo] = useState(now.toISOString().split('T')[0])
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [downloading, setDownloading] = useState(false)

    const fetchReport = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/cms/reports/patient-visits?from=${from}&to=${to}`)
            if (res.ok) {
                const json = await res.json()
                setData(json.data)
            } else {
                toast.error('Gagal mengambil data laporan')
            }
        } catch {
            toast.error('Terjadi kesalahan')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchReport() }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const handleDownload = async () => {
        setDownloading(true)
        try {
            const res = await fetch(`/api/cms/reports/patient-visits?from=${from}&to=${to}&format=xlsx`)
            if (!res.ok) throw new Error()
            const blob = await res.blob()
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `laporan-kunjungan-${from}-${to}.xlsx`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(a.href)
            toast.success('File berhasil diunduh')
        } catch {
            toast.error('Gagal mengunduh file')
        } finally {
            setDownloading(false)
        }
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        <UserCheck className="w-8 h-8 text-blue-500" />
                        Laporan Kunjungan Pasien
                    </h1>
                    <p className="text-foreground/60 mt-1">Kunjungan per poli dan tipe rawat</p>
                </div>
                <Button variant="outline" onClick={handleDownload} disabled={downloading || !data} className="gap-2">
                    {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Download Excel
                </Button>
            </div>

            <Card className="border border-border/40">
                <CardContent className="py-4">
                    <div className="flex items-end gap-4 flex-wrap">
                        <div className="space-y-1">
                            <Label className="text-xs">Dari</Label>
                            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-44" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Sampai</Label>
                            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-44" />
                        </div>
                        <Button onClick={fetchReport} disabled={loading} className="gap-2">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Tampilkan
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {data?.summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Total Kunjungan', value: data.summary.total_visits },
                        { label: 'Rawat Jalan', value: data.summary.total_outpatient },
                        { label: 'Rawat Inap', value: data.summary.total_inpatient },
                        { label: 'IGD', value: data.summary.total_emergency },
                    ].map((s, i) => (
                        <Card key={i} className="border border-border/40">
                            <CardContent className="p-4 text-center">
                                <p className="text-xs text-foreground/50 mb-1">{s.label}</p>
                                <p className="text-2xl font-bold text-foreground">{s.value.toLocaleString('id-ID')}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Per-Poli Summary */}
            {data?.summary?.by_poli && Object.keys(data.summary.by_poli).length > 0 && (
                <Card className="border border-border/40">
                    <CardHeader>
                        <CardTitle>Kunjungan per Poli</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {Object.entries(data.summary.by_poli as Record<string, number>)
                                .sort((a, b) => b[1] - a[1])
                                .map(([poli, count]) => (
                                    <div key={poli} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                        <span className="text-sm font-medium">{poli}</span>
                                        <span className="text-sm font-bold text-primary">{count}</span>
                                    </div>
                                ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="border border-border/40">
                <CardHeader>
                    <CardTitle>Detail Harian</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Tanggal</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead className="text-right">Rawat Jalan</TableHead>
                                        <TableHead className="text-right">Rawat Inap</TableHead>
                                        <TableHead className="text-right">IGD</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(data?.rows ?? []).map((row: any) => (
                                        <TableRow key={row.date}>
                                            <TableCell className="font-medium">{new Date(row.date).toLocaleDateString('id-ID')}</TableCell>
                                            <TableCell className="text-right font-semibold">{row.total_visits}</TableCell>
                                            <TableCell className="text-right">{row.outpatient}</TableCell>
                                            <TableCell className="text-right">{row.inpatient}</TableCell>
                                            <TableCell className="text-right">{row.emergency}</TableCell>
                                        </TableRow>
                                    ))}
                                    {(data?.rows ?? []).length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-foreground/40 py-8">
                                                Tidak ada data pada periode ini
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
