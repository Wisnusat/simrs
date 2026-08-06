'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import DashboardLayout from '@/components/system/dashboard-layout'
import {
    LayoutDashboard,
    Building2,
    Stethoscope,
    Users,
    Globe,
    BarChart3,
    ClipboardCheck,
    DollarSign,
    UserCheck,
    Pill,
    FlaskConical,
    Activity,
    BedDouble,
    Clock,
} from 'lucide-react'

export default function CmsLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const [userRole, setUserRole] = useState<string>('admin')

    useEffect(() => {
        const fetchRole = async () => {
            try {
                const res = await fetch('/api/auth/me')
                if (res.ok) {
                    const data = await res.json()
                    if (data.success) {
                        setUserRole(data.data.role)
                    }
                }
            } catch { /* ignore */ }
        }
        fetchRole()
    }, [])

    const isOwner = userRole === 'owner'

    const navigateTo = useCallback((href: string) => {
        router.push(href)
    }, [router])

    const sidebarItems = [
        {
            icon: LayoutDashboard,
            label: 'Dashboard',
            href: '/cms',
            onClick: () => navigateTo('/cms'),
            active: pathname === '/cms',
        },
        {
            icon: Building2,
            label: 'Info Rumah Sakit',
            href: '/cms/hospital',
            onClick: () => navigateTo('/cms/hospital'),
            active: pathname === '/cms/hospital',
        },
        {
            icon: Stethoscope,
            label: 'Layanan / Poli',
            href: '/cms/services',
            onClick: () => navigateTo('/cms/services'),
            active: pathname === '/cms/services',
        },
        {
            icon: Users,
            label: 'Manajemen Staf',
            href: '/cms/staff',
            onClick: () => navigateTo('/cms/staff'),
            active: pathname === '/cms/staff',
        },
        {
            icon: Clock,
            label: 'Persetujuan Akun',
            href: '/cms/approvals',
            onClick: () => navigateTo('/cms/approvals'),
            active: pathname === '/cms/approvals',
        },
        {
            icon: Globe,
            label: 'Landing Page',
            href: '/cms/landing-page',
            onClick: () => navigateTo('/cms/landing-page'),
            active: pathname === '/cms/landing-page',
        },
        {
            icon: FlaskConical,
            label: 'Layanan Lab',
            href: '/cms/lab-services',
            onClick: () => navigateTo('/cms/lab-services'),
            active: pathname === '/cms/lab-services',
        },
        {
            icon: BedDouble,
            label: 'Tarif Kamar',
            href: '/cms/room-rates',
            onClick: () => navigateTo('/cms/room-rates'),
            active: pathname === '/cms/room-rates',
        },
        {
            icon: Pill,
            label: 'Manajemen Obat',
            href: '/cms/medications',
            onClick: () => navigateTo('/cms/medications'),
            active: pathname === '/cms/medications',
        },
        // Owner-only items
        ...(isOwner ? [
            {
                icon: BarChart3,
                label: 'Laporan',
                href: '/cms/reports',
                onClick: () => navigateTo('/cms/reports'),
                active: pathname === '/cms/reports',
            },
            {
                icon: DollarSign,
                label: 'Pendapatan',
                href: '/cms/reports/revenue',
                onClick: () => navigateTo('/cms/reports/revenue'),
                active: pathname === '/cms/reports/revenue',
            },
            {
                icon: UserCheck,
                label: 'Kunjungan Pasien',
                href: '/cms/reports/patient-visits',
                onClick: () => navigateTo('/cms/reports/patient-visits'),
                active: pathname === '/cms/reports/patient-visits',
            },
            {
                icon: Pill,
                label: 'Obat & Stok',
                href: '/cms/reports/medications',
                onClick: () => navigateTo('/cms/reports/medications'),
                active: pathname === '/cms/reports/medications',
            },
            {
                icon: FlaskConical,
                label: 'Laboratorium',
                href: '/cms/reports/lab',
                onClick: () => navigateTo('/cms/reports/lab'),
                active: pathname === '/cms/reports/lab',
            },
            // {
            //     icon: Activity,
            //     label: 'Diagnosis',
            //     href: '/cms/reports/diagnosis',
            //     onClick: () => navigateTo('/cms/reports/diagnosis'),
            //     active: pathname === '/cms/reports/diagnosis',
            // },
            {
                icon: ClipboardCheck,
                label: 'Approval PO',
                href: '/cms/po-approval',
                onClick: () => navigateTo('/cms/po-approval'),
                active: pathname === '/cms/po-approval',
            },
        ] : []),
    ]

    return (
        <DashboardLayout
            title="Content Management System"
            role={userRole}
            sidebarItems={sidebarItems}
        >
            {children}
        </DashboardLayout>
    )
}
