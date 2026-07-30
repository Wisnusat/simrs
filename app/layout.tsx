export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Klinik Utama Harapan Bunda — Melayani dengan Sepenuh Hati',
  description: 'Klinik Utama Harapan Bunda menyediakan layanan kesehatan berkualitas dengan dokter spesialis dan tenaga medis profesional di Dharmasraya, Sumatera Barat.',
  icons: {
    icon: [
      {
        url: '/favicon.ico',
      },
      {
        url: '/android-icon-36x36.png',
        sizes: '36x36',
        type: 'image/png',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id">
      <body className="font-sans antialiased">
        {children}
        <Toaster />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
