/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { LogOut, Menu, X, Home, Loader2 } from "lucide-react"

interface UserProfile {
  id: string
  full_name: string
  role: string
  specialization: string | null
  email: string
  organization: {
    id: string
    name: string
    type: string
  } | null
}

interface DashboardLayoutProps {
  children: React.ReactNode
  title: string
  role: string
  sidebarItems: Array<{
    icon: React.ComponentType<any>
    label: string
    href?: string
    onClick?: () => void
    active?: boolean
  }>
  hideSidebar?: boolean
}

export default function DashboardLayout({ children, title, role, sidebarItems }: DashboardLayoutProps) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const router = useRouter()

  // Fetch real session from /api/auth/me on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/auth/me')

        if (!res.ok) {
          // Session invalid or expired — redirect to login
          router.push('/')
          return
        }

        const data = await res.json()
        if (data.success) {
          setProfile(data.data)
        } else {
          router.push('/')
        }
      } catch {
        router.push('/')
      }
    }

    fetchProfile()
  }, [router])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      // Always redirect even if the request fails
      router.push('/')
      router.refresh() // Force middleware to re-evaluate with cleared cookie
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case "owner": return "bg-amber-600"
      case "admin": return "bg-blue-600"
      case "doctor": return "bg-green-600"
      case "nurse": return "bg-pink-600"
      case "pharmacist": return "bg-purple-600"
      case "cashier": return "bg-orange-600"
      case "lab_nurse": return "bg-cyan-600"
      case "nutritionist": return "bg-lime-600"
      default: return "bg-gray-600"
    }
  }

  const getRoleInitials = (role: string) => {
    switch (role) {
      case "owner": return "OW"
      case "admin": return "AD"
      case "doctor": return "DR"
      case "nurse": return "NR"
      case "pharmacist": return "AP"
      case "cashier": return "KS"
      case "lab_nurse": return "LB"
      case "nutritionist": return "GZ"
      default: return "US"
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "owner": return "Owner"
      case "admin": return "Administrator"
      case "doctor": return "Dokter"
      case "nurse": return "Perawat"
      case "pharmacist": return "Apoteker"
      case "cashier": return "Kasir"
      case "lab_nurse": return "Perawat Lab"
      case "nutritionist": return "Ahli Gizi"
      default: return role
    }
  }

  return (
    <div className="min-h-screen bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-secondary/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-accent/5 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 bg-card/80 backdrop-blur supports-backdrop-filter:bg-card/60 border-b border-border/40">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden">
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <div className="min-w-0">
              <Link href="/" className="inline-flex items-center gap-2">
                <span className="text-lg font-bold text-foreground">Klinik Harapan Bunda</span>
              </Link>
              <h1 className="text-sm font-medium text-foreground/60 truncate mt-2">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push("/")} className="hidden sm:flex">
              <Home className="w-4 h-4 mr-2" />
              Beranda
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className={`${getRoleColor(role)} text-white text-xs font-bold`}>
                      {getRoleInitials(role)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <div className="px-2 py-1.5 border-b border-border/40 mb-1">
                  {/* Show real name from API, fallback to role while loading */}
                  <p className="text-sm font-medium truncate">
                    {profile?.full_name ?? '...'}
                  </p>
                  <p className="text-xs text-foreground/60">
                    {getRoleLabel(role)}
                  </p>
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
        </div>
      </header>

      <div className="relative z-10 flex h-screen">
        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-card/80 backdrop-blur supports-backdrop-filter:bg-card/60 border-r border-border/40 shadow-lg transform transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:static lg:inset-0 lg:h-screen
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}>
          <div className="flex flex-col h-screen pt-16 lg:pt-0">
            <div className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
              {sidebarItems.map((item, index) => {
                const IconComponent = item.icon
                const isActive = item.active ?? (item.href ? pathname === item.href : false)
                const btn = (
                  <Button
                    key={index}
                    variant={isActive ? "default" : "ghost"}
                    className="w-full justify-start"
                    onClick={item.onClick}
                  >
                    <IconComponent className="w-4 h-4 mr-3" />
                    {item.label}
                  </Button>
                )
                return item.href
                  ? <Link key={index} href={item.href}>{btn}</Link>
                  : btn
              })}
            </div>

            {/* Profile info at bottom of sidebar */}
            <div className="px-4 py-4 border-t border-border/40">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full ${getRoleColor(role)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                  {getRoleInitials(role)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {profile?.full_name ?? '...'}
                  </p>
                  <p className="text-xs text-foreground/50">
                    {getRoleLabel(role)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 h-screen overflow-y-auto">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}