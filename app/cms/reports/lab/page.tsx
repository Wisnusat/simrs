/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FlaskConical, Download, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export default function LabReportPage() {
    const now = new Date()
    const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0])
    const [to, setTo] = useState(now.toISOString().split('T')[0])
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [downloading, setDownloading] = useState(false)

    const fetchReport = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/cms/reports/lab?from=${from}&to=${to}`)
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
            const res = await fetch(`/api/cms/reports/lab?from=${from}&to=${to}&format=xlsx`)
            if (!res.ok) throw new Error()
            const blob = await res.blob()
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `laporan-lab-${from}-${to}.xlsx`
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
                        <FlaskConical className="w-8 h-8 text-amber-500" />
                        Laporan Laboratorium
                    </h1>
                    <p className="text-foreground/60 mt-1">Pemeriksaan lab dan status penyelesaian</p>
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
                        { label: 'Total Order', value: data.summary.total_orders },
                        { label: 'Total Tes', value: data.summary.total_tests },
                        { label: 'Selesai', value: data.summary.completed_tests },
                        { label: 'Pending', value: data.summary.pending_tests },
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

            <Card className="border border-border/40">
                <CardHeader>
                    <CardTitle>Detail per Tes</CardTitle>
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
                                        <TableHead>Nama Tes</TableHead>
                                        <TableHead>Kode LOINC</TableHead>
                                        <TableHead className="text-right">Total Order</TableHead>
                                        <TableHead className="text-right">Selesai</TableHead>
                                        <TableHead className="text-right">Pending</TableHead>
                                        <TableHead className="text-right">% Selesai</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(data?.rows ?? []).map((row: any, i: number) => (
                                        <TableRow key={i}>
                                            <TableCell className="font-medium">{row.test_name}</TableCell>
                                            <TableCell className="text-foreground/60">{row.loinc_code ?? '-'}</TableCell>
                                            <TableCell className="text-right font-semibold">{row.total_orders}</TableCell>
                                            <TableCell className="text-right text-emerald-600">{row.completed}</TableCell>
                                            <TableCell className="text-right text-amber-500">{row.pending}</TableCell>
                                            <TableCell className="text-right">
                                                {row.total_orders > 0 ? Math.round((row.completed / row.total_orders) * 100) : 0}%
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {(data?.rows ?? []).length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center text-foreground/40 py-8">
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
