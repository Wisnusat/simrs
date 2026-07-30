'use client'

import type React from 'react'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { LogOut, Home, Loader2, Activity } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserProfile {
  id: string
  full_name: string
  role: string
  specialization: string | null
  email: string
  organization: { id: string; name: string; type: string } | null
}

interface DashboardLayoutProps {
  children: React.ReactNode
  title: string
  role: string
  sidebarItems: Array<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: React.ComponentType<any>
    label: string
    href?: string
    onClick?: () => void
    active?: boolean
  }>
  hideSidebar?: boolean
}

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

function roleColor(role: string) {
  switch (role) {
    case 'owner': return 'bg-amber-600'
    case 'admin': return 'bg-blue-600'
    case 'doctor': return 'bg-green-600'
    case 'nurse': return 'bg-pink-600'
    case 'pharmacist': return 'bg-purple-600'
    case 'cashier': return 'bg-orange-600'
    case 'lab_nurse': return 'bg-cyan-600'
    case 'nutritionist': return 'bg-lime-600'
    default: return 'bg-gray-600'
  }
}

function roleInitials(role: string) {
  switch (role) {
    case 'owner': return 'OW'
    case 'admin': return 'AD'
    case 'doctor': return 'DR'
    case 'nurse': return 'NR'
    case 'pharmacist': return 'AP'
    case 'cashier': return 'KS'
    case 'lab_nurse': return 'LB'
    case 'nutritionist': return 'GZ'
    default: return 'US'
  }
}

function roleLabel(role: string) {
  switch (role) {
    case 'owner': return 'Owner'
    case 'admin': return 'Administrator'
    case 'doctor': return 'Dokter'
    case 'nurse': return 'Perawat'
    case 'pharmacist': return 'Apoteker'
    case 'cashier': return 'Kasir'
    case 'lab_nurse': return 'Perawat Lab'
    case 'nutritionist': return 'Ahli Gizi'
    default: return role
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardLayout({
  children,
  title,
  role,
  sidebarItems,
}: DashboardLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        if (!res.ok) { router.push('/'); return null }
        return res.json()
      })
      .then(data => {
        if (!data) return
        if (data.success) setProfile(data.data)
        else router.push('/')
      })
      .catch(() => router.push('/'))
  }, [router])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try { await fetch('/api/auth/logout', { method: 'POST' }) } finally {
      router.push('/')
      router.refresh()
    }
  }

  const initials = roleInitials(role)
  const color = roleColor(role)
  const label = roleLabel(role)

  return (
    <SidebarProvider>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <Sidebar collapsible="icon">
        {/* Logo row */}
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <Activity className="h-5 w-5" />
            <span className="truncate font-semibold text-sm group-data-[collapsible=icon]:hidden">
              Klinik Harapan Bunda
            </span>
          </div>
        </SidebarHeader>

        {/* Nav items */}
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {sidebarItems.map((item, i) => {
                  const Icon = item.icon
                  const isActive = item.active ?? (item.href ? pathname === item.href : false)

                  const btnClass = [
                    'h-11 px-3 text-sm font-medium rounded-lg',
                    'data-[active=true]:bg-primary data-[active=true]:text-primary-foreground',
                    'data-[active=true]:shadow-sm',
                  ].join(' ')

                  return (
                    <SidebarMenuItem key={i}>
                      {item.href ? (
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                          className={btnClass}
                        >
                          <Link href={item.href} onClick={item.onClick}>
                            <Icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton
                          isActive={isActive}
                          tooltip={item.label}
                          onClick={item.onClick}
                          className={btnClass}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* Profile footer */}
        <SidebarFooter className="border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className={`h-9 w-9 shrink-0 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold`}>
              {initials}
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-xs font-medium leading-tight">
                {profile?.full_name ?? '...'}
              </p>
              <p className="text-xs text-sidebar-foreground/50">{label}</p>
            </div>
          </div>
          <p className="px-2 pb-2 text-[10px] text-sidebar-foreground/30 group-data-[collapsible=icon]:hidden">
            v{process.env.NEXT_PUBLIC_APP_VERSION ?? '—'}
          </p>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      {/* ── Main area ───────────────────────────────────────────────────── */}
      <SidebarInset>
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 bg-card/80 backdrop-blur px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm font-medium text-foreground/70 truncate">{title}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/')}
              className="hidden sm:flex gap-1.5"
            >
              <Home className="w-4 h-4" />
              Beranda
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 w-9 rounded-full p-0">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className={`${color} text-white text-xs font-bold`}>
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <div className="px-2 py-1.5 border-b border-border/40 mb-1">
                  <p className="text-sm font-medium truncate">{profile?.full_name ?? '...'}</p>
                  <p className="text-xs text-foreground/60">{label}</p>
                  {profile?.organization && (
                    <p className="text-xs text-foreground/40 truncate mt-0.5">
                      {profile.organization.name}
                    </p>
                  )}
                </div>
                <DropdownMenuItem
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  {isLoggingOut
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <LogOut className="w-4 h-4 mr-2" />
                  }
                  {isLoggingOut ? 'Signing out...' : 'Logout'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
