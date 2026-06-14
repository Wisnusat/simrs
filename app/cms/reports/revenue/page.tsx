/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DollarSign, Download, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

function formatRupiah(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

export default function RevenueReportPage() {
    const now = new Date()
    const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0])
    const [to, setTo] = useState(now.toISOString().split('T')[0])
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [downloading, setDownloading] = useState(false)

    const fetchReport = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/cms/reports/revenue?from=${from}&to=${to}`)
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
            const res = await fetch(`/api/cms/reports/revenue?from=${from}&to=${to}&format=xlsx`)
            if (!res.ok) throw new Error()
            const blob = await res.blob()
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `laporan-pendapatan-${from}-${to}.xlsx`
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
                        <DollarSign className="w-8 h-8 text-emerald-500" />
                        Laporan Pendapatan
                    </h1>
                    <p className="text-foreground/60 mt-1">Revenue report per periode</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={handleDownload} disabled={downloading || !data} className="gap-2">
                        {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Download Excel
                    </Button>
                </div>
            </div>

            {/* Filters */}
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

            {/* Summary Cards */}
            {data?.summary && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {[
                        { label: 'Total Invoice', value: data.summary.total_invoices },
                        { label: 'Total Pendapatan', value: formatRupiah(data.summary.total_revenue) },
                        { label: 'Terbayar', value: formatRupiah(data.summary.total_paid) },
                        { label: 'Belum Bayar', value: formatRupiah(data.summary.total_unpaid) },
                        { label: 'Umum', value: formatRupiah(data.summary.total_umum) },
                        { label: 'BPJS', value: formatRupiah(data.summary.total_bpjs) },
                    ].map((s, i) => (
                        <Card key={i} className="border border-border/40">
                            <CardContent className="p-4 text-center">
                                <p className="text-xs text-foreground/50 mb-1">{s.label}</p>
                                <p className="text-lg font-bold text-foreground">{typeof s.value === 'number' ? s.value.toLocaleString('id-ID') : s.value}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Data Table */}
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
                                        <TableHead className="text-right">Invoice</TableHead>
                                        <TableHead className="text-right">Subtotal</TableHead>
                                        <TableHead className="text-right">Diskon</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead className="text-right">Terbayar</TableHead>
                                        <TableHead className="text-right">Belum Bayar</TableHead>
                                        <TableHead className="text-right">Umum</TableHead>
                                        <TableHead className="text-right">BPJS</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(data?.rows ?? []).map((row: any) => (
                                        <TableRow key={row.date}>
                                            <TableCell className="font-medium">{new Date(row.date).toLocaleDateString('id-ID')}</TableCell>
                                            <TableCell className="text-right">{row.total_invoices}</TableCell>
                                            <TableCell className="text-right">{formatRupiah(row.subtotal)}</TableCell>
                                            <TableCell className="text-right">{formatRupiah(row.discount)}</TableCell>
                                            <TableCell className="text-right font-semibold">{formatRupiah(row.total)}</TableCell>
                                            <TableCell className="text-right text-emerald-600">{formatRupiah(row.paid)}</TableCell>
                                            <TableCell className="text-right text-rose-500">{formatRupiah(row.unpaid)}</TableCell>
                                            <TableCell className="text-right">{formatRupiah(row.payment_umum)}</TableCell>
                                            <TableCell className="text-right">{formatRupiah(row.payment_bpjs)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {(data?.rows ?? []).length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center text-foreground/40 py-8">
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
