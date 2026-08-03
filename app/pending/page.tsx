'use client'

import { Clock, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function PendingPage() {
    const router = useRouter()

    const handleLogout = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/')
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
            <div className="max-w-md w-full text-center space-y-6">
                <div className="flex justify-center">
                    <div className="h-20 w-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <Clock className="w-10 h-10 text-amber-500" />
                    </div>
                </div>
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold text-foreground">Menunggu Persetujuan</h1>
                    <p className="text-foreground/60 text-sm leading-relaxed">
                        Akun Anda telah terdaftar dan sedang menunggu persetujuan dari administrator.
                        Anda akan dapat mengakses sistem setelah akun disetujui.
                    </p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm text-amber-700 dark:text-amber-300">
                    Hubungi administrator klinik jika membutuhkan akses segera.
                </div>
                <Button variant="outline" onClick={handleLogout} className="gap-2">
                    <LogOut className="w-4 h-4" /> Keluar
                </Button>
            </div>
        </div>
    )
}
