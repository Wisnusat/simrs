"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Loader2, ArrowRightCircle, BedDouble } from "lucide-react"

import type { EmergencyEncounter, Location, InpatientRoomClass } from "@/lib/types/outpatient"
import { useEmergency } from "@/hooks/emergency/use-emergency"
import { getLocations, postEpisodeOfCare, postInpatientAdmission } from "@/lib/api/client"
import { useToast } from "@/hooks/use-toast"

interface EmergencyDispositionFormProps {
  encounter: EmergencyEncounter
  onSuccess: () => void
}

export function EmergencyDispositionForm({ encounter, onSuccess }: EmergencyDispositionFormProps) {
  const [outcome, setOutcome] = useState<string>("discharged")
  
  // Options for 'referred_out'
  const [referredTo, setReferredTo] = useState("")
  const [referralLetter, setReferralLetter] = useState("")

  // Options for 'admitted_inpatient'
  const [rooms, setRooms] = useState<Location[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState<string>("")
  const [bedNumber, setBedNumber] = useState("")
  const [roomClass, setRoomClass] = useState<InpatientRoomClass>("kelas_3")
  
  const [dischargeSummary, setDischargeSummary] = useState("")
  
  const { update, actionLoading } = useEmergency()
  const { toast } = useToast()

  // Fetch rooms if outcome is admitted
  useEffect(() => {
    if (outcome === "admitted_inpatient") {
      setRoomsLoading(true)
      getLocations({ type: "patient_room" })
        .then(setRooms)
        .catch(() => {})
        .finally(() => setRoomsLoading(false))
    }
  }, [outcome])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (outcome === "admitted_inpatient") {
        if (!selectedRoom || !bedNumber) {
          toast({ title: "Error", description: "Kamar dan nomor bed harus diisi", variant: "destructive" })
          return
        }

        // 1. Create Episode of Care
        const episode = await postEpisodeOfCare({
          patient_id: encounter.patient_id,
          diagnosis_primary: encounter.triage_complaint || "Observasi IGD",
        })

        // 2. Create Admission
        await postInpatientAdmission({
          episode_of_care_id: episode.id,
          patient_id: encounter.patient_id,
          room_location_id: selectedRoom,
          bed_number: bedNumber,
          room_class: roomClass,
        })
      }

      // 3. Update the Emergency Encounter outcome & status
      let newStatus = outcome === "admitted_inpatient" ? "admitted_to_inpatient" 
                    : outcome === "referred" ? "referred_out" 
                    : "completed"

      const success = await update(encounter.id, {
        outcome,
        status: newStatus,
        referred_to: referredTo,
        referral_letter_no: referralLetter,
        resuscitation_notes: dischargeSummary
      })

      if (success) {
        onSuccess()
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Gagal menyimpan disposisi", variant: "destructive" })
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

        {/* Extended options based on outcome */}
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
          <div className="space-y-4 p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
            <h4 className="font-semibold flex items-center gap-2 text-sm">
              <BedDouble className="w-4 h-4 text-blue-500" /> Registrasi Rawat Inap
            </h4>

            {/* Room selection */}
            <div className="space-y-2">
              <Label>Pilih Kamar *</Label>
              {roomsLoading ? (
                <div className="flex items-center gap-2 text-sm text-foreground/50">
                  <Loader2 className="w-4 h-4 animate-spin" /> Memuat kamar...
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {rooms.map((room) => {
                    const available = room.capacity - (room.occupied ?? 0)
                    const isFull = available <= 0
                    return (
                      <button
                        key={room.id}
                        type="button"
                        disabled={isFull}
                        className={`p-3 rounded-lg border text-left text-sm transition-all ${
                          selectedRoom === room.id
                            ? "border-blue-500 bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-500"
                            : isFull
                            ? "border-border/40 opacity-50 cursor-not-allowed"
                            : "border-border hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/10"
                        }`}
                        onClick={() => setSelectedRoom(room.id)}
                      >
                        <p className="font-medium">{room.name}</p>
                        <p className="text-xs text-foreground/50">
                          {room.floor ? `Lantai ${room.floor} · ` : ""}
                          Tersedia: {available}/{room.capacity}
                        </p>
                      </button>
                    )
                  })}
                  {rooms.length === 0 && (
                    <p className="text-sm text-foreground/50 col-span-2 text-center py-4">Belum ada kamar tersedia.</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nomor Bed *</Label>
                <Input
                  value={bedNumber}
                  onChange={(e) => setBedNumber(e.target.value)}
                  placeholder="mis. A1, B2"
                />
              </div>
              <div className="space-y-2">
                <Label>Kelas Kamar *</Label>
                <Select value={roomClass} onValueChange={(v) => setRoomClass(v as InpatientRoomClass)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vip">VIP</SelectItem>
                    <SelectItem value="kelas_1">Kelas 1</SelectItem>
                    <SelectItem value="kelas_2">Kelas 2</SelectItem>
                    <SelectItem value="kelas_3">Kelas 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
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
