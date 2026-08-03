"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, UserPlus, CheckCircle2, AlertCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useEmergency } from "@/hooks/emergency/use-emergency"

interface EmergencyIntakeFormProps {
  onSuccess: () => void
  onCancel: () => void
}

type NikStatus = "idle" | "checking" | "found" | "not_found"

export function EmergencyIntakeForm({ onSuccess, onCancel }: EmergencyIntakeFormProps) {
  const [nik, setNik] = useState("")
  const [name, setName] = useState("")
  const [isCritical, setIsCritical] = useState(false)
  const [nikStatus, setNikStatus] = useState<NikStatus>("idle")
  const [foundPatientId, setFoundPatientId] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const { create } = useEmergency()
  const supabase = createClient()

  // Auto-lookup when NIK reaches 16 digits
  useEffect(() => {
    if (nik.length !== 16) {
      setNikStatus("idle")
      setFoundPatientId(null)
      setName("")
      return
    }

    let cancelled = false
    setNikStatus("checking")

    supabase
      .from("patients")
      .select("id, full_name")
      .eq("nik", nik)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (data) {
          setFoundPatientId(data.id)
          setName(data.full_name)
          setNikStatus("found")
        } else {
          setFoundPatientId(null)
          setName("")
          setNikStatus("not_found")
        }
      })

    return () => { cancelled = true }
  }, [nik]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNikChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 16)
    setNik(val)
    if (val.length < 16) {
      setError("")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Nama pasien harus diisi")
      return
    }
    if (nik.length > 0 && nik.length < 16) {
      setError("NIK harus tepat 16 digit")
      return
    }

    setLoading(true)
    setError("")

    try {
      let patientId = foundPatientId

      if (!patientId) {
        const randMr = `MR-IGD-${Date.now().toString().slice(-6)}`
        const { data: newPatient, error: newError } = await supabase
          .from("patients")
          .insert({
            nik: nik || null,
            full_name: name.trim(),
            medical_record_no: randMr,
            gender: "unknown",
            date_of_birth: new Date().toISOString().split("T")[0],
          })
          .select("id")
          .single()

        if (newError || !newPatient) throw new Error("Gagal membuat data pasien baru: " + newError?.message)
        patientId = newPatient.id
      }

      const result = await create({ patient_id: patientId!, is_critical: isCritical })
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

  const nikIsPartial = nik.length > 0 && nik.length < 16

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

      {/* NIK */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>NIK / Kartu Identitas</Label>
          <span className={`text-xs ${nik.length === 16 ? "text-green-600" : "text-foreground/50"}`}>
            {nik.length}/16 digit
          </span>
        </div>
        <Input
          value={nik}
          onChange={handleNikChange}
          placeholder="Masukkan 16 digit NIK (opsional)"
          maxLength={16}
          inputMode="numeric"
        />
        {nikIsPartial && (
          <p className="text-xs text-amber-600">NIK harus tepat 16 digit</p>
        )}
        {nikStatus === "checking" && (
          <p className="text-xs text-foreground/50 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Mengecek data pasien...
          </p>
        )}
        {nikStatus === "found" && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Pasien ditemukan — data diisi otomatis
          </p>
        )}
        {nikStatus === "not_found" && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> NIK belum terdaftar — pasien baru akan dibuat
          </p>
        )}
      </div>

      {/* Nama */}
      <div className="space-y-1.5">
        <Label>
          Nama Pasien *
          {nikStatus === "found" && (
            <span className="ml-2 text-xs font-normal text-foreground/50">(dari data terdaftar, tidak dapat diubah)</span>
          )}
        </Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={nikStatus === "idle" || nik.length === 0 ? "Mis: Mr. X atau Nama Lengkap" : "Terisi otomatis setelah cek NIK"}
          disabled={nikStatus === "found"}
          required
        />
      </div>

      {/* Kondisi */}
      <div className="space-y-1.5 pt-1">
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
        <Button type="submit" disabled={loading || nikStatus === "checking"} className="bg-orange-600 hover:bg-orange-700">
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memproses...</> : "Daftarkan ke IGD"}
        </Button>
      </div>
    </form>
  )
}
