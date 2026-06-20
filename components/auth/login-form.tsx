'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useRouter } from 'next/navigation'

// Route map per role — matches middleware
const ROLE_ROUTES: Record<string, string> = {
  admin: '/cms',
  doctor: '/doctor',
  nurse: '/nurse',
  pharmacist: '/pharmacist',
  cashier: '/cashier',
  lab_nurse: '/lab',
  nutritionist: '/nutritionist',
  owner: '/cms',
}

// Demo credentials shown at bottom of form
const DEMO_CREDENTIALS = [
  { role: 'Admin', email: 'admin@carewell.id', password: 'admin123' },
  { role: 'Dokter', email: 'dokter@carewell.id', password: 'dokter123' },
  { role: 'Perawat', email: 'perawat@carewell.id', password: 'perawat123' },
  { role: 'Apoteker', email: 'apoteker@carewell.id', password: 'apoteker123' },
  { role: 'Kasir', email: 'kasir@carewell.id', password: 'kasir123' },
  { role: 'Owner', email: 'owner@carewell.id', password: 'owner123' },
  { role: 'Gizi', email: 'gizi@carewell.id', password: 'gizi123' },
  { role: 'Lab', email: 'perawat.lab@carewell.id', password: 'labperawat123' }
]

export default function LoginForm() {
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const router = useRouter()

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    if (!formData.email.trim()) newErrors.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Enter a valid email'
    if (!formData.password.trim()) newErrors.password = 'Password is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsLoading(true)
    setLoginError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, password: formData.password }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setLoginError(data.error ?? 'Login failed. Please try again.')
        return
      }

      // Redirect based on role from API response
      const role = data.data.profile.role as string
      const route = ROLE_ROUTES[role] ?? '/admin'
      router.push(route)
      router.refresh() // Ensures middleware re-runs with new session cookie

    } catch {
      setLoginError('Network error. Please check your connection.')
    } finally {
      setIsLoading(false)
    }
  }

  // Fill form with demo credentials on click
  const fillDemo = (email: string, password: string) => {
    setFormData({ email, password })
    setLoginError('')
    setErrors({})
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 bg-card p-8 rounded-xl border border-border/40 shadow-sm">

      {/* Email Field */}
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="staff@carewell.id"
          className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          disabled={isLoading}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
      </div>

      {/* Password Field */}
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-foreground">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder="Enter your password"
            className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={isLoading}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground transition-colors disabled:opacity-50"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
      </div>

      {/* Error Message */}
      {loginError && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {loginError}
        </div>
      )}

      {/* Remember Me */}
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
            disabled={isLoading}
          />
          <span className="text-foreground/70">Remember me</span>
        </label>
        <a href="#" className="text-primary hover:text-primary/80 transition-colors font-medium">
          Forgot password?
        </a>
      </div>

      {/* Login Button */}
      <Button
        type="submit"
        disabled={isLoading}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 rounded-lg transition-all disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            Signing in...
          </>
        ) : (
          <>
            <LogIn size={18} />
            Sign In
          </>
        )}
      </Button>

      {/* Demo Credentials */}
      <div className="pt-4 border-t border-border/20">
        <p className="text-xs text-foreground/50 mb-2">Quick fill demo credentials:</p>
        <div className="flex flex-wrap gap-2">
          {DEMO_CREDENTIALS.map((c) => (
            <button
              key={c.role}
              type="button"
              onClick={() => fillDemo(c.email, c.password)}
              disabled={isLoading}
              className="text-xs px-2.5 py-1 rounded-md border border-border/40 text-foreground/60 hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all disabled:opacity-50"
            >
              {c.role}
            </button>
          ))}
        </div>
      </div>

    </form>
  )
}