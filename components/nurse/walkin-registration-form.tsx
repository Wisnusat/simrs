"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, UserPlus, Search, CreditCard, Stethoscope } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { postWalkinRegistration } from "@/lib/api/client"
import { useToast } from "@/hooks/use-toast"

interface PoliService {
  id: string
  name: string
  code: string
}

export function WalkinRegistrationForm({ onSuccess }: { onSuccess?: () => void }) {
  const [nik, setNik] = useState("")
  const [name, setName] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("umum")
  const [bpjsNo, setBpjsNo] = useState("")
  
  const [services, setServices] = useState<PoliService[]>([])
  const [selectedService, setSelectedService] = useState("")
  
  const [loading, setLoading] = useState(false)
  const [verifyingBpjs, setVerifyingBpjs] = useState(false)
  const [bpjsVerified, setBpjsVerified] = useState(false)
  const [error, setError] = useState("")
  
  const supabase = createClient()
  const { toast } = useToast()

  // Load Poli Services
  useEffect(() => {
    async function loadServices() {
      const { data } = await supabase
        .from("poli_services")
        .select("id, name, code")
        .eq("is_active", true)
      
      if (data) {
        setServices(data)
      }
    }
    loadServices()
  }, [])

  const handleVerifyBpjs = async () => {
    if (!bpjsNo) {
      toast({ title: "Error", description: "Nomor BPJS tidak boleh kosong", variant: "destructive" })
      return
    }
    setVerifyingBpjs(true)
    
    // Mock BPJS verification
    setTimeout(() => {
      setVerifyingBpjs(false)
      // For mock, any 13 digit number is valid, or just always valid
      if (bpjsNo.length >= 10) {
        setBpjsVerified(true)
        toast({ title: "Berhasil", description: "Nomor BPJS Valid (Mock)" })
      } else {
        setBpjsVerified(false)
        toast({ title: "Error", description: "Nomor BPJS Tidak Valid", variant: "destructive" })
      }
    }, 1000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) {
      setError("Nama pasien harus diisi")
      return
    }
    if (!selectedService) {
      setError("Poli / Layanan harus dipilih")
      return
    }
    if (paymentMethod === "bpjs" && !bpjsVerified) {
      setError("Mohon verifikasi nomor BPJS terlebih dahulu")
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
        // Generate random MR No
        const randMr = `MR-WI-${Date.now().toString().slice(-6)}`
        
        const { data: newPatient, error: newError } = await supabase
          .from("patients")
          .insert({
            nik: nik || null,
            full_name: name,
            medical_record_no: randMr,
            gender: "unknown",
            date_of_birth: new Date().toISOString().split('T')[0], // dummy
            bpjs_no: bpjsNo || null
          })
          .select("id")
          .single()
          
        if (newError || !newPatient) throw new Error("Gagal membuat data pasien baru: " + newError?.message)
        patientId = newPatient.id
      }
      
      // 3. Create Walk-in Registration (Appointment + Check-in)
      const result = await postWalkinRegistration({
        patientId,
        poliServiceId: selectedService,
        paymentMethod
      })
      
      if (result) {
        toast({ title: "Berhasil", description: "Pasien berhasil didaftarkan ke antrian" })
        // Reset form
        setNik("")
        setName("")
        setBpjsNo("")
        setBpjsVerified(false)
        if (onSuccess) onSuccess()
      } else {
        setError("Gagal mendaftarkan pasien")
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

      {/* Patient Section */}
      <div className="space-y-4">
        <h3 className="font-semibold flex items-center gap-2 border-b pb-2">
          <UserPlus className="w-5 h-5 text-blue-500" /> Identitas Pasien
        </h3>
        
        <div className="space-y-2">
          <Label>NIK / Kartu Identitas</Label>
          <Input 
            value={nik} 
            onChange={(e) => setNik(e.target.value)} 
            placeholder="Ketik NIK..." 
          />
          <p className="text-xs text-foreground/60">Isi NIK untuk mengecek data pasien lama. Kosongkan untuk pasien baru tanpa NIK.</p>
        </div>

        <div className="space-y-2">
          <Label>Nama Pasien *</Label>
          <Input 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            placeholder="Nama Lengkap Pasien" 
            required 
          />
        </div>
      </div>

      {/* Service Selection */}
      <div className="space-y-4 pt-2">
        <h3 className="font-semibold flex items-center gap-2 border-b pb-2">
          <Stethoscope className="w-5 h-5 text-green-500" /> Layanan Tujuan
        </h3>
        
        <div className="space-y-2">
          <Label>Poli / Klinik *</Label>
          <Select value={selectedService} onValueChange={setSelectedService}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih Poli Tujuan" />
            </SelectTrigger>
            <SelectContent>
              {services.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Payment Section */}
      <div className="space-y-4 pt-2">
        <h3 className="font-semibold flex items-center gap-2 border-b pb-2">
          <CreditCard className="w-5 h-5 text-purple-500" /> Metode Pembayaran
        </h3>
        
        <div className="space-y-2">
          <Label>Jenis Pembayaran *</Label>
          <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); setBpjsVerified(false); }}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="umum">Umum Pribadi</SelectItem>
              <SelectItem value="bpjs">BPJS Kesehatan</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {paymentMethod === "bpjs" && (
          <div className="space-y-2 pt-2 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900/30">
            <Label>Nomor Kartu BPJS *</Label>
            <div className="flex gap-2">
              <Input 
                value={bpjsNo} 
                onChange={(e) => { setBpjsNo(e.target.value); setBpjsVerified(false); }} 
                placeholder="Mis: 000123456789" 
              />
              <Button 
                type="button" 
                variant="secondary" 
                onClick={handleVerifyBpjs}
                disabled={verifyingBpjs || bpjsVerified || !bpjsNo}
              >
                {verifyingBpjs ? <Loader2 className="w-4 h-4 animate-spin" /> : bpjsVerified ? "Terverifikasi" : "Verifikasi"}
              </Button>
            </div>
            {bpjsVerified && <p className="text-xs text-green-600 font-medium">BPJS aktif dan dapat digunakan.</p>}
          </div>
        )}
      </div>

      <div className="pt-6">
        <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memproses...</> : "Daftarkan Pasien & Masukkan Antrian"}
        </Button>
      </div>
    </form>
  )
}
