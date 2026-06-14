'use client'

export const dynamic = 'force-dynamic'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart3, DollarSign, UserCheck, Pill, FlaskConical, Activity } from 'lucide-react'
import Link from 'next/link'

const reports = [
    {
        title: 'Laporan Pendapatan',
        description: 'Total pendapatan, pembayaran umum vs BPJS, invoice harian, diskon, dan pajak.',
        icon: DollarSign,
        href: '/cms/reports/revenue',
        color: 'text-emerald-500',
        bgColor: 'bg-emerald-500/10',
    },
    {
        title: 'Kunjungan Pasien',
        description: 'Jumlah kunjungan harian per poli, rawat jalan/inap/IGD, tren kunjungan.',
        icon: UserCheck,
        href: '/cms/reports/patient-visits',
        color: 'text-blue-500',
        bgColor: 'bg-blue-500/10',
    },
    {
        title: 'Obat & Stok',
        description: 'Stok obat saat ini, obat di bawah minimum, riwayat dispensasi, batch kedaluwarsa.',
        icon: Pill,
        href: '/cms/reports/medications',
        color: 'text-purple-500',
        bgColor: 'bg-purple-500/10',
    },
    {
        title: 'Laboratorium',
        description: 'Pemeriksaan lab yang dipesan, tes terpopuler, status penyelesaian.',
        icon: FlaskConical,
        href: '/cms/reports/lab',
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/10',
    },
    // {
    //     title: 'Diagnosis',
    //     description: 'Frekuensi diagnosis ICD-10, top 10 diagnosis, primer vs sekunder.',
    //     icon: Activity,
    //     href: '/cms/reports/diagnosis',
    //     color: 'text-rose-500',
    //     bgColor: 'bg-rose-500/10',
    // },
]

export default function ReportsHubPage() {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                    <BarChart3 className="w-8 h-8 text-primary" />
                    Laporan
                </h1>
                <p className="text-foreground/60 mt-1">
                    Unduh laporan untuk keperluan audit dan analisis rumah sakit
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reports.map(report => {
                    const Icon = report.icon
                    return (
                        <Link key={report.href} href={report.href}>
                            <Card className="border border-border/40 hover:shadow-lg hover:border-primary/20 transition-all duration-300 cursor-pointer group h-full">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2.5 rounded-xl ${report.bgColor}`}>
                                            <Icon className={`w-5 h-5 ${report.color}`} />
                                        </div>
                                        <CardTitle className="text-lg group-hover:text-primary transition-colors">
                                            {report.title}
                                        </CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <CardDescription className="text-sm">{report.description}</CardDescription>
                                </CardContent>
                            </Card>
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}
