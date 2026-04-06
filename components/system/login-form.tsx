'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { useRouter } from 'next/navigation'

const roleConfig = {
  admin: {
    credentials: { username: "admin123", password: "admin123" },
    route: "/admin",
  },
  doctor: {
    credentials: { username: "dokter123", password: "dokter123" },
    route: "/doctor",
  },
  nurse: {
    credentials: { username: "perawat123", password: "perawat123" },
    route: "/nurse",
  },
  pharmacist: {
    credentials: { username: "apoteker123", password: "apoteker123" },
    route: "/pharmacist",
  },
  cashier: {
    credentials: { username: "kasir123", password: "kasir123" },
    route: "/cashier",
  },
}

export default function LoginForm() {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'doctor'
  })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const router = useRouter()

  const roles = [
    { value: 'doctor', label: 'Dokter'},
    { value: 'nurse', label: 'Perawat'},
    { value: 'pharmacist', label: 'Apoteker'},
    { value: 'cashier', label: 'Kasir'},
    { value: 'admin', label: 'Admin'},
    { value: 'owner', label: 'Owner'},
  ]

  const config = formData.role ? roleConfig[formData.role as keyof typeof roleConfig] : null

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.username.trim()) newErrors.username = 'Username is required'
    if (!formData.password.trim()) newErrors.password = 'Password is required'
    if (!formData.role.trim()) newErrors.role = 'Role is required'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (validateForm()) {
      // Mock login with loading animation
      setIsLoading(true)
      // Simulate loading
      await new Promise((resolve) => setTimeout(resolve, 1000))
      
      if (formData.username === config?.credentials.username && formData.password === config?.credentials.password) {
        // Store user session
        localStorage.setItem(
          "userSession",
          JSON.stringify({
            role: formData.role,
            username: formData.username,
            loginTime: new Date().toISOString(),
          }),
        )
      
        router.push(config.route)
      } else {
        setLoginError('Invalid credentials. Please try again.')
      }
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 bg-card p-8 rounded-xl border border-border/40 shadow-sm">
      {/* Email Field */}
      <div className="space-y-2">
        <label htmlFor="username" className="block text-sm font-medium text-foreground">
          Username
        </label>
        <input
          id="username"
          type="text"
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          placeholder="Username"
          className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          disabled={isLoading}
        />
        {errors.username && <p className="text-sm text-destructive">{errors.username}</p>}
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

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Role</label>
        <Select value={formData.role} onValueChange={(value) => {
          setFormData({ ...formData, role: value })
        }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role.value} value={role.value}>
                {role.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.role && <p className="text-sm text-destructive">{errors.role}</p>}
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
            <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
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
        <p className="text-xs text-foreground/50 mb-2">Demo Credentials:</p>
        <div className="space-y-1 text-xs text-foreground/60">
          <p>Username: <span className="font-mono text-foreground/70">{config?.credentials.username}</span></p>
          <p>Password: <span className="font-mono text-foreground/70">{config?.credentials.password}</span></p>
        </div>
      </div>
    </form>
  )
}
