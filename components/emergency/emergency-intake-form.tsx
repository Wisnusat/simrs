"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, UserPlus, Search } from "lucide-react"

// Assuming we have a way to search patients or we just create a minimal one.
// Since the prompt instructed to make it simple: "fill minimal data, check nik if exist"
import { createClient } from "@/lib/supabase/client"
import { useEmergency } from "@/hooks/emergency/use-emergency"

interface EmergencyIntakeFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export function EmergencyIntakeForm({ onSuccess, onCancel }: EmergencyIntakeFormProps) {
  const [nik, setNik] = useState("")
  const [name, setName] = useState("")
  const [isCritical, setIsCritical] = useState(false)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  
  const { create } = useEmergency()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) {
      setError("Nama pasien harus diisi")
      return
    }
    if (nik && nik.length !== 16) {
      setError("NIK harus 16 digit")
      return
    }
    
    setLoading(true)
    setError("")
    
    try {
      let patientId: string | null = null
      
      // 1. Try to find patient by NIK if provided
      if (nik) {
        const { data: existingPatient } = await supabase
          .from("patients")
          .select("id")
          .eq("nik", nik)
          .maybeSingle()
          
        if (existingPatient) {
          patientId = existingPatient.id
        }
      }
      
      // 2. If no patient found or no NIK, create a minimal patient record
      if (!patientId) {
        // Generate random MR No if standard function not available
        const randMr = `MR-IGD-${Date.now().toString().slice(-6)}`
        
        const { data: newPatient, error: newError } = await supabase
          .from("patients")
          .insert({
            nik: nik || null,
            full_name: name,
            medical_record_no: randMr,
            gender: "unknown", // can be updated later
            date_of_birth: new Date().toISOString().split('T')[0] // dummy
          })
          .select("id")
          .single()
          
        if (newError || !newPatient) throw new Error("Gagal membuat data pasien baru: " + newError?.message)
        patientId = newPatient.id
      }
      
      // 3. Create Emergency Encounter
      const result = await create({
        patient_id: patientId,
        is_critical: isCritical
      })
      
      if (result) {
        onSuccess()
      } else {
        setError("Gagal mendaftarkan pasien ke IGD")
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-orange-50 dark:bg-orange-950/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800 mb-4">
        <h4 className="font-semibold text-orange-800 dark:text-orange-400 flex items-center gap-2">
          <UserPlus className="w-5 h-5" /> Registrasi Cepat IGD
        </h4>
        <p className="text-sm text-foreground/70 mt-1">
          Masukkan NIK untuk mengecek data pasien lama, atau isi nama untuk pasien tak dikenal/baru.
        </p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>NIK / Kartu Identitas</Label>
          <span className={`text-xs ${nik.length === 16 ? "text-green-600" : "text-foreground/50"}`}>
            {nik.length}/16 digit
          </span>
        </div>
        <Input
          value={nik}
          onChange={(e) => setNik(e.target.value.replace(/\D/g, "").slice(0, 16))}
          placeholder="Masukkan 16 digit NIK (opsional)"
          maxLength={16}
          inputMode="numeric"
        />
        {nik.length > 0 && nik.length < 16 && (
          <p className="text-xs text-amber-600">NIK harus tepat 16 digit</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Nama Pasien *</Label>
        <Input 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="Mis: Mr. X atau Nama Lengkap" 
          required 
        />
      </div>

      <div className="space-y-2 pt-2">
        <Label>Kondisi saat tiba</Label>
        <Select 
          value={isCritical ? "true" : "false"} 
          onValueChange={(v) => setIsCritical(v === "true")}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">Tidak Kritis</SelectItem>
            <SelectItem value="true">Gawat Darurat / Kritis</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" type="button" onClick={onCancel} disabled={loading}>
          Batal
        </Button>
        <Button type="submit" disabled={loading} className="bg-orange-600 hover:bg-orange-700">
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memproses...</> : "Daftarkan ke IGD"}
        </Button>
      </div>
    </form>
  )
}
