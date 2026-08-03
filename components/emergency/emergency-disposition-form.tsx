"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, ArrowRightCircle, BedDouble, Info, Activity } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

import type { EmergencyEncounter, ReferralUrgency } from "@/lib/types/outpatient"
import { useEmergency } from "@/hooks/emergency/use-emergency"
import { postReferral } from "@/lib/api/client"
import { OrganizationSearch, type OrganizationSelection } from "@/components/shared/organization-search"
import { toast } from "sonner"

interface EmergencyDispositionFormProps {
  encounter: EmergencyEncounter
  onSuccess: () => void
}

export function EmergencyDispositionForm({ encounter, onSuccess }: EmergencyDispositionFormProps) {
  const [outcome, setOutcome] = useState<string>("discharged")

  // Referral fields
  const [referralOrg, setReferralOrg] = useState<OrganizationSelection>({ name: "", ssOrgId: null })
  const [referralSpecialty, setReferralSpecialty] = useState("")
  const [referralReason, setReferralReason] = useState("")
  const [referralUrgency, setReferralUrgency] = useState<ReferralUrgency>("routine")
  const [dischargeSummary, setDischargeSummary] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const { resolveOutcome } = useEmergency()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (outcome === "referred") {
      if (!referralOrg.name.trim()) { toast.error("Faskes tujuan wajib diisi"); return }
      if (!referralReason.trim()) { toast.error("Alasan rujukan wajib diisi"); return }
    }

    setSubmitting(true)
    try {
      const result = await resolveOutcome(encounter.id, {
        outcome: outcome as 'discharged' | 'referred' | 'admitted_inpatient',
        ...(outcome === "referred" && {
          referred_to: referralOrg.name,
        }),
      })

      if (!result) return

      // Create full referral record (same as doctor flow)
      if (outcome === "referred") {
        await postReferral({
          encounter_id: encounter.encounter_id,
          patient_id: encounter.patient_id,
          destination_facility_name: referralOrg.name,
          destination_specialty: referralSpecialty || undefined,
          ss_destination_org_id: referralOrg.ssOrgId ?? undefined,
          referral_reason: referralReason,
          urgency: referralUrgency,
        }).catch(() => {
          // non-fatal — outcome already saved
          toast.error("Gagal menyimpan detail rujukan, namun disposisi berhasil.")
        })
      }

      onSuccess()
    } finally {
      setSubmitting(false)
    }
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
          <div className="space-y-4 p-4 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
            <h4 className="font-semibold flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4 text-purple-500" /> Pengaturan Rujukan Keluar
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <OrganizationSearch
                  value={referralOrg}
                  onChange={setReferralOrg}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Poli / Spesialisasi</Label>
                <Input
                  value={referralSpecialty}
                  onChange={(e) => setReferralSpecialty(e.target.value)}
                  placeholder="Ex: Poli Jantung"
                />
              </div>
              <div className="space-y-2">
                <Label>Alasan Rujukan *</Label>
                <Input
                  value={referralReason}
                  onChange={(e) => setReferralReason(e.target.value)}
                  placeholder="Mis. Fasilitas tidak memadai, butuh spesialis"
                />
              </div>
              <div className="space-y-2">
                <Label>Urgensi</Label>
                <Select value={referralUrgency} onValueChange={(v) => setReferralUrgency(v as ReferralUrgency)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">Rutin (Biasa)</SelectItem>
                    <SelectItem value="urgent">Urgen (Segera)</SelectItem>
                    <SelectItem value="emergency">Gawat Darurat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
          disabled={submitting}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memproses...</> : "Selesaikan Kunjungan IGD"}
        </Button>
      </div>
    </form>
  )
}
