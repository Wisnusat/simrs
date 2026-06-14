'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import LoginForm from '@/components/auth/login-form'

export default function SystemLoginPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-secondary/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-accent/5 blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center gap-2 mb-6">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
              ♥
            </div>
            <span className="text-2xl font-bold text-foreground">CareWell</span>
          </Link>
          <h1 className="text-3xl font-bold text-foreground mb-2">Staff Portal</h1>
          <p className="text-foreground/60">Internal Hospital Management System</p>
        </div>

        <div className="space-y-6">
          <LoginForm />
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-foreground/60">
          <p>
            Not a staff member?{' '}
            <Link href="https://klinik-eta.vercel.app/" className="text-primary hover:text-primary/80 transition-colors font-medium">
              Go back home
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
