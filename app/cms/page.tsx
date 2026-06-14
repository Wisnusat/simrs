'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Calendar, DollarSign, Activity, TrendingUp, AlertTriangle } from 'lucide-react'

interface DashboardStats {
    totalStaff: number
    todayVisits: number
    monthRevenue: number
    activePatients: number
    lowStockMeds: number
    pendingPOs: number
}

export default function CmsDashboardPage() {
    const [stats, setStats] = useState<DashboardStats>({
        totalStaff: 0, todayVisits: 0, monthRevenue: 0, activePatients: 0, lowStockMeds: 0, pendingPOs: 0,
    })
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState<string>('admin')

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [meRes, staffRes] = await Promise.all([
                    fetch('/api/auth/me'),
                    fetch('/api/cms/staff'),
                ])

                if (meRes.ok) {
                    const meData = await meRes.json()
                    if (meData.success) setUserRole(meData.data.role)
                }

                const staffData = staffRes.ok ? await staffRes.json() : { data: [] }

                setStats(prev => ({
                    ...prev,
                    totalStaff: staffData.data?.length ?? 0,
                }))

                // Only owner can access reports
                if (userRole === 'owner') {
                    try {
                        const now = new Date()
                        const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
                        const to = now.toISOString().split('T')[0]

                        const [revenueRes, poRes] = await Promise.all([
                            fetch(`/api/cms/reports/revenue?from=${from}&to=${to}`),
                            fetch('/api/cms/po-approval?status=po_draft'),
                        ])

                        if (revenueRes.ok) {
                            const revData = await revenueRes.json()
                            setStats(prev => ({
                                ...prev,
                                monthRevenue: revData.data?.summary?.total_revenue ?? 0,
                            }))
                        }

                        if (poRes.ok) {
                            const poData = await poRes.json()
                            setStats(prev => ({
                                ...prev,
                                pendingPOs: poData.data?.length ?? 0,
                            }))
                        }
                    } catch { /* Owner stats are best-effort */ }
                }
            } catch (err) {
                console.error('Dashboard data fetch error:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const isOwner = userRole === 'owner'

    const statCards = [
        {
            title: 'Total Staf',
            value: stats.totalStaff,
            icon: Users,
            description: 'Staf aktif terdaftar',
            color: 'text-blue-500',
            bgColor: 'bg-blue-500/10',
        },
        {
            title: 'Kunjungan Hari Ini',
            value: stats.todayVisits,
            icon: Calendar,
            description: 'Semua tipe kunjungan',
            color: 'text-emerald-500',
            bgColor: 'bg-emerald-500/10',
        },
        ...(isOwner ? [
            {
                title: 'Pendapatan Bulan Ini',
                value: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(stats.monthRevenue),
                icon: DollarSign,
                description: 'Total revenue',
                color: 'text-amber-500',
                bgColor: 'bg-amber-500/10',
            },
            {
                title: 'PO Menunggu Approval',
                value: stats.pendingPOs,
                icon: AlertTriangle,
                description: 'Purchase orders draft',
                color: 'text-rose-500',
                bgColor: 'bg-rose-500/10',
            },
        ] : []),
    ]

    return (
        <div className="space-y-8">
            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold text-foreground">Dashboard CMS</h1>
                <p className="text-foreground/60 mt-1">
                    Kelola data dan informasi rumah sakit Anda
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((stat, i) => {
                    const Icon = stat.icon
                    return (
                        <Card key={i} className="border border-border/40 hover:shadow-md transition-shadow">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-foreground/60">{stat.title}</p>
                                        <p className="text-2xl font-bold text-foreground">
                                            {loading ? '...' : typeof stat.value === 'number' ? stat.value.toLocaleString('id-ID') : stat.value}
                                        </p>
                                        <p className="text-xs text-foreground/40">{stat.description}</p>
                                    </div>
                                    <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                                        <Icon className={`w-5 h-5 ${stat.color}`} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <QuickActionCard
                    icon={Activity}
                    title="Info Rumah Sakit"
                    description="Update nama, alamat, jam operasional, dan kontak rumah sakit"
                    href="/cms/hospital"
                    color="text-blue-500"
                />
                <QuickActionCard
                    icon={Users}
                    title="Manajemen Staf"
                    description="Tambah, edit, atau nonaktifkan akun staf rumah sakit"
                    href="/cms/staff"
                    color="text-emerald-500"
                />
                <QuickActionCard
                    icon={TrendingUp}
                    title="Landing Page"
                    description="Atur konten halaman utama website klinik"
                    href="/cms/landing-page"
                    color="text-violet-500"
                />
            </div>
        </div>
    )
}

function QuickActionCard({
    icon: Icon,
    title,
    description,
    href,
    color,
}: {
    icon: React.ComponentType<{ className?: string }>
    title: string
    description: string
    href: string
    color: string
}) {
    return (
        <a href={href}>
            <Card className="border border-border/40 hover:shadow-lg hover:border-primary/20 transition-all duration-300 cursor-pointer group h-full">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <Icon className={`w-6 h-6 ${color} group-hover:scale-110 transition-transform`} />
                        <CardTitle className="text-lg group-hover:text-primary transition-colors">{title}</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-foreground/60">{description}</p>
                </CardContent>
            </Card>
        </a>
    )
}
