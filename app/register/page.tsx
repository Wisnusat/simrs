'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import RegisterForm from '@/components/auth/register-form'

export default function RegisterPage() {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
            {/* Decorative background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-secondary/10 blur-3xl" />
                <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-accent/5 blur-3xl" />
            </div>

            <div className="relative w-full max-w-lg">
                {/* Header */}
                <div className="text-center mb-8">
                    <Link href="/" className="inline-flex items-center justify-center gap-2 mb-6">
                        <span className="text-2xl font-bold text-foreground">Klinik Harapan Bunda</span>
                    </Link>
                    <h1 className="text-3xl font-bold text-foreground mb-2">Daftar Akun Staf</h1>
                    <p className="text-foreground/60">Buat akun untuk mengakses sistem SIMRS</p>
                </div>

                <RegisterForm />

                <div className="mt-6 text-center text-sm text-foreground/60">
                    Sudah punya akun?{' '}
                    <Link href="/" className="text-primary hover:text-primary/80 transition-colors font-medium">
                        Masuk di sini
                    </Link>
                </div>
            </div>
        </div>
    )
}
