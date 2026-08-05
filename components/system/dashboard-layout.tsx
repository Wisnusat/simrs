'use client'

import type React from 'react'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { LogOut, Home, Loader2, Activity, UserCog, KeyRound, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserProfile {
  id: string
  full_name: string
  role: string
  specialization: string | null
  email: string
  poli_service_name: string | null
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
    badge?: number
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
  const [showProfile, setShowProfile] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)

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

  const handleChangePassword = async () => {
    if (!pwForm.current || !pwForm.next || !pwForm.confirm) {
      toast.error('Semua field password wajib diisi')
      return
    }
    if (pwForm.next.length < 8) {
      toast.error('Password baru minimal 8 karakter')
      return
    }
    if (pwForm.next !== pwForm.confirm) {
      toast.error('Konfirmasi password tidak cocok')
      return
    }
    setPwSaving(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Password berhasil diubah')
        setPwForm({ current: '', next: '', confirm: '' })
        setShowProfile(false)
      } else {
        toast.error(data.error ?? 'Gagal mengubah password')
      }
    } catch {
      toast.error('Terjadi kesalahan')
    } finally {
      setPwSaving(false)
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
                            {!!item.badge && (
                              <span className="ml-auto text-[10px] font-bold leading-none bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center group-data-[collapsible=icon]:hidden">
                                {item.badge > 99 ? "99+" : item.badge}
                              </span>
                            )}
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
                          {!!item.badge && (
                            <span className="ml-auto text-[10px] font-bold leading-none bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center group-data-[collapsible=icon]:hidden">
                              {item.badge > 99 ? "99+" : item.badge}
                            </span>
                          )}
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
            {profile?.poli_service_name && (
              <span className="hidden sm:inline-flex items-center rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground/60">
                {profile.poli_service_name}
              </span>
            )}
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
                  onClick={() => { setShowProfile(true); setPwForm({ current: '', next: '', confirm: '' }) }}
                  className="cursor-pointer gap-2"
                >
                  <UserCog className="w-4 h-4" />
                  Profil &amp; Password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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
      {/* ── Profile & Change Password Dialog ─────────────────────────── */}
      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5 text-primary" />
              Profil Saya
            </DialogTitle>
          </DialogHeader>

          {/* Profile info */}
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
              <Avatar className="h-12 w-12">
                <AvatarFallback className={`${color} text-white font-bold`}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate">{profile?.full_name ?? '-'}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-xs">{label}</Badge>
                  {profile?.specialization && (
                    <span className="text-xs text-foreground/50 truncate">{profile.specialization}</span>
                  )}
                </div>
                <p className="text-xs text-foreground/50 mt-0.5 truncate">{profile?.email ?? '-'}</p>
              </div>
            </div>
            {profile?.organization && (
              <p className="text-xs text-foreground/50 px-1">
                {profile.organization.name}
              </p>
            )}
          </div>

          <Separator />

          {/* Change password */}
          <div className="space-y-4">
            <p className="text-sm font-semibold flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" />
              Ubah Password
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Password Saat Ini</Label>
                <div className="relative">
                  <Input
                    type={showCurrent ? 'text' : 'password'}
                    value={pwForm.current}
                    onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                    placeholder="Password lama"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70"
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Password Baru</Label>
                <div className="relative">
                  <Input
                    type={showNext ? 'text' : 'password'}
                    value={pwForm.next}
                    onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                    placeholder="Minimal 8 karakter"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNext(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70"
                  >
                    {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Konfirmasi Password Baru</Label>
                <Input
                  type="password"
                  value={pwForm.confirm}
                  onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                  placeholder="Ulangi password baru"
                />
              </div>
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={pwSaving}
              className="w-full gap-2"
            >
              {pwSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {pwSaving ? 'Menyimpan...' : 'Ubah Password'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
