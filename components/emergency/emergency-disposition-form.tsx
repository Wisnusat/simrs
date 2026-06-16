"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Loader2, ArrowRightCircle, BedDouble, Info } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

import type { EmergencyEncounter } from "@/lib/types/outpatient"
import { useEmergency } from "@/hooks/emergency/use-emergency"
import { useToast } from "@/hooks/use-toast"

interface EmergencyDispositionFormProps {
  encounter: EmergencyEncounter
  onSuccess: () => void
}

export function EmergencyDispositionForm({ encounter, onSuccess }: EmergencyDispositionFormProps) {
  const [outcome, setOutcome] = useState<string>("discharged")
  const [referredTo, setReferredTo] = useState("")
  const [referralLetter, setReferralLetter] = useState("")
  const [dischargeSummary, setDischargeSummary] = useState("")

  const { resolveOutcome, actionLoading } = useEmergency()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (outcome === "referred" && !referredTo) {
      toast({ title: "Error", description: "Tujuan rujukan harus diisi", variant: "destructive" })
      return
    }

    const input: Parameters<typeof resolveOutcome>[1] = {
      outcome: outcome as 'discharged' | 'referred' | 'admitted_inpatient',
      ...(outcome === "referred" && {
        referred_to: referredTo,
        referral_letter_no: referralLetter || undefined,
      }),
    }

    const result = await resolveOutcome(encounter.id, input)
    if (result) onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b">
        <ArrowRightCircle className="w-5 h-5 text-blue-500" />
        <h3 className="font-semibold text-lg">Disposisi & Kepulangan</h3>
      </div>

      <div className="space-y-4">
        <div className="space-y-3">
          <Label>Keputusan Lanjut (Disposisi) *</Label>
          <RadioGroup value={outcome} onValueChange={setOutcome} className="flex flex-col md:flex-row gap-4">
            <div className="flex items-center space-x-2 border p-3 rounded-lg flex-1 hover:bg-muted cursor-pointer">
              <RadioGroupItem value="discharged" id="discharged" />
              <Label htmlFor="discharged" className="cursor-pointer font-medium w-full">Pulang / Rawat Jalan</Label>
            </div>
            <div className="flex items-center space-x-2 border p-3 rounded-lg flex-1 hover:bg-muted cursor-pointer">
              <RadioGroupItem value="admitted_inpatient" id="admitted_inpatient" />
              <Label htmlFor="admitted_inpatient" className="cursor-pointer font-medium w-full">Rawat Inap</Label>
            </div>
            <div className="flex items-center space-x-2 border p-3 rounded-lg flex-1 hover:bg-muted cursor-pointer">
              <RadioGroupItem value="referred" id="referred" />
              <Label htmlFor="referred" className="cursor-pointer font-medium w-full">Rujuk ke RS Lain</Label>
            </div>
          </RadioGroup>
        </div>

        {outcome === "referred" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border bg-slate-50 dark:bg-slate-900/30">
            <div className="space-y-2">
              <Label>Tujuan Rujukan (Nama RS) *</Label>
              <Input
                value={referredTo}
                onChange={(e) => setReferredTo(e.target.value)}
                required
                placeholder="Mis: RS Pusat..."
              />
            </div>
            <div className="space-y-2">
              <Label>Nomor Surat Rujukan</Label>
              <Input
                value={referralLetter}
                onChange={(e) => setReferralLetter(e.target.value)}
                placeholder="Opsional"
              />
            </div>
          </div>
        )}

        {outcome === "admitted_inpatient" && (
          <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
            <BedDouble className="w-4 h-4 text-blue-500" />
            <AlertDescription className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <span>
                Pasien akan dipindahkan ke Rawat Inap. Perawat akan menentukan kamar dan kelas perawatan setelah pasien terdaftar.
              </span>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label>Catatan Pulang / Disposisi</Label>
          <Textarea
            rows={3}
            value={dischargeSummary}
            onChange={(e) => setDischargeSummary(e.target.value)}
            placeholder="Tambahkan instruksi pulang, edukasi, atau catatan rujukan..."
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={actionLoading}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {actionLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memproses...</> : "Selesaikan Kunjungan IGD"}
        </Button>
      </div>
    </form>
  )
}
