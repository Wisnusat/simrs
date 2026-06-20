'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BedDouble, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

const ROOM_CLASSES = [
  { key: 'vip',     label: 'VIP' },
  { key: 'kelas_1', label: 'Kelas 1' },
  { key: 'kelas_2', label: 'Kelas 2' },
  { key: 'kelas_3', label: 'Kelas 3' },
] as const

type RoomClass = typeof ROOM_CLASSES[number]['key']
type Rates = Record<RoomClass, string>

const DEFAULT_RATES: Rates = { vip: '500000', kelas_1: '350000', kelas_2: '250000', kelas_3: '150000' }

export default function RoomRatesPage() {
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/cms/room-rates')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setRates({
            vip:     String(res.data.vip     ?? 0),
            kelas_1: String(res.data.kelas_1 ?? 0),
            kelas_2: String(res.data.kelas_2 ?? 0),
            kelas_3: String(res.data.kelas_3 ?? 0),
          })
        }
      })
      .catch(() => toast.error('Gagal memuat tarif kamar'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, number> = {}
      for (const { key } of ROOM_CLASSES) {
        const val = Number(rates[key])
        if (isNaN(val) || val < 0) {
          toast.error(`Tarif untuk ${key} tidak valid`)
          return
        }
        body[key] = val
      }

      const res = await fetch('/api/cms/room-rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.success) toast.success('Tarif kamar berhasil disimpan')
      else toast.error(json.error ?? 'Gagal menyimpan')
    } catch {
      toast.error('Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <BedDouble className="w-8 h-8 text-primary" />
          Tarif Kamar Rawat Inap
        </h1>
        <p className="text-foreground/60 mt-1">
          Biaya kamar per hari digunakan untuk menghitung tagihan otomatis saat pasien rawat inap.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tarif Per Kelas Kamar</CardTitle>
          <CardDescription>Satuan: Rupiah per hari</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ROOM_CLASSES.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-4">
              <Label className="w-24 shrink-0 font-medium">{label}</Label>
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground/50">Rp</span>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  className="pl-9"
                  value={rates[key]}
                  onChange={(e) => setRates((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            </div>
          ))}

          <Button onClick={handleSave} disabled={saving} className="mt-2 w-full">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? 'Menyimpan...' : 'Simpan Tarif'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
