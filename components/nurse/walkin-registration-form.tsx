"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Loader2, CreditCard, ArrowLeft, CheckCircle2, AlertCircle, ShieldAlert
} from "lucide-react"
import { useWalkinRegistration } from "@/hooks/nurse/use-walkin-registration"

export function WalkinRegistrationForm({ onSuccess }: { onSuccess?: () => void }) {
  const {
    step,
    formData,
    services,
    isLoadingServices,
    isCheckingNik,
    verifyingBpjs,
    submitting,
    error,
    setError,
    verifyNik,
    submitProfile,
    submitService,
    verifyBpjs,
    submitPayment,
    registerWalkin,
    goBack,
    reset,
  } = useWalkinRegistration(onSuccess)

  // Step 1 State
  const [nikInput, setNikInput] = useState("")

  // Step 2 State (Profile)
  const [profileName, setProfileName] = useState("")
  const [profileEmail, setProfileEmail] = useState("")
  const [profilePhone, setProfilePhone] = useState("")
  const [profileGender, setProfileGender] = useState("")
  const [profileDob, setProfileDob] = useState("")
  const [profileAddress, setProfileAddress] = useState("")
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({})

  // Step 3 State (Service/Poli)
  const [selectedService, setSelectedService] = useState("")
  const [serviceErrors, setServiceErrors] = useState<Record<string, string>>({})

  // Step 4 State (Payment)
  const [paymentMethod, setPaymentMethod] = useState("umum")
  const [bpjsNo, setBpjsNo] = useState("")

  // Populate state when moving to step 2/3/4 (optional form presets)
  useEffect(() => {
    if (step === 2) {
      setProfileName(formData.name)
      setProfileEmail(formData.email)
      setProfilePhone(formData.phone)
      setProfileGender(formData.gender)
      setProfileDob(formData.dob)
      setProfileAddress(formData.address)
    }
  }, [step, formData])

  // Helper validation for profile
  const handleProfileContinue = () => {
    const errs: Record<string, string> = {}
    if (!profileName.trim()) errs.name = "Nama lengkap wajib diisi"
    if (!profilePhone.trim()) errs.phone = "Nomor telepon wajib diisi"
    if (!profileGender) errs.gender = "Jenis kelamin wajib dipilih"
    if (!profileDob) errs.dob = "Tanggal lahir wajib diisi"
    if (!profileAddress.trim()) errs.address = "Alamat lengkap wajib diisi"

    if (Object.keys(errs).length > 0) {
      setProfileErrors(errs)
      return
    }

    setProfileErrors({})
    submitProfile({
      name: profileName,
      email: profileEmail,
      phone: profilePhone,
      gender: profileGender,
      dob: profileDob,
      address: profileAddress,
    })
  }

  // Helper validation for service
  const handleServiceContinue = () => {
    const errs: Record<string, string> = {}
    if (!selectedService) errs.service = "Poli tujuan wajib dipilih"

    if (Object.keys(errs).length > 0) {
      setServiceErrors(errs)
      return
    }

    setServiceErrors({})
    submitService(selectedService)
  }

  return (
    <div className="w-full max-w-xl mx-auto space-y-4">
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
        </div>
      )}

      {/* STEP 1: NIK VERIFICATION */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nik-input" className="text-sm font-semibold">Nomor Induk Kependudukan (NIK)</Label>
            <Input
              id="nik-input"
              placeholder="Masukkan 16 digit NIK"
              value={nikInput}
              onChange={(e) => {
                setNikInput(e.target.value.replace(/\D/g, "").slice(0, 16))
                setError("")
              }}
              disabled={isCheckingNik}
              maxLength={16}
              className="text-base font-mono h-11"
            />
            <div className="flex justify-between items-center text-xs text-foreground/50 mt-1">
              <span>Cek NIK untuk memeriksa database</span>
              <span>{nikInput.length}/16 digit</span>
            </div>
          </div>

          <Button
            onClick={() => verifyNik(nikInput)}
            disabled={isCheckingNik || nikInput.length !== 16}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium h-11"
          >
            {isCheckingNik ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Memeriksa...</>
            ) : (
              "Verifikasi NIK & Lanjutkan"
            )}
          </Button>
        </div>
      )}

      {/* STEP 2: PROFILE FORM */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Nama Lengkap *</Label>
              <Input
                placeholder="Nama sesuai KTP"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
              />
              {profileErrors.name && <p className="text-xs text-red-500 font-medium">{profileErrors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Email (Opsional)</Label>
              <Input
                type="email"
                placeholder="alamat@email.com"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Nomor Telepon *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground/50 font-medium">+62</span>
                <Input
                  placeholder="812xxxxxxxx"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value.replace(/\D/g, ""))}
                  className="pl-12"
                />
              </div>
              {profileErrors.phone && <p className="text-xs text-red-500 font-medium">{profileErrors.phone}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Jenis Kelamin *</Label>
              <Select value={profileGender} onValueChange={setProfileGender}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih jenis kelamin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Laki-laki</SelectItem>
                  <SelectItem value="female">Perempuan</SelectItem>
                  <SelectItem value="other">Lainnya</SelectItem>
                </SelectContent>
              </Select>
              {profileErrors.gender && <p className="text-xs text-red-500 font-medium">{profileErrors.gender}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Tanggal Lahir *</Label>
              <Input
                type="date"
                value={profileDob}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => setProfileDob(e.target.value)}
              />
              {profileErrors.dob && <p className="text-xs text-red-500 font-medium">{profileErrors.dob}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Alamat Lengkap *</Label>
              <textarea
                placeholder="Alamat domisili saat ini"
                value={profileAddress}
                onChange={(e) => setProfileAddress(e.target.value)}
                className="w-full min-h-[70px] p-3 rounded-md border border-input bg-background text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {profileErrors.address && <p className="text-xs text-red-500 font-medium">{profileErrors.address}</p>}
            </div>
          </div>

          <Button
            onClick={handleProfileContinue}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium h-11"
          >
            Lanjutkan ke Pilihan Poli
          </Button>
        </div>
      )}

      {/* STEP 3: SERVICE SELECTION */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Spesialisasi / Poli Klinik *</Label>
            <Select
              value={selectedService}
              onValueChange={setSelectedService}
              disabled={isLoadingServices}
            >
              <SelectTrigger className="w-full h-11">
                <SelectValue placeholder={isLoadingServices ? "Memuat layanan..." : "Pilih Poli Tujuan"} />
              </SelectTrigger>
              <SelectContent>
                {services.map((svc) => (
                  <SelectItem key={svc.id} value={svc.id}>
                    {svc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {serviceErrors.service && <p className="text-xs text-red-500 font-medium">{serviceErrors.service}</p>}
          </div>

          <Button
            onClick={handleServiceContinue}
            disabled={!selectedService}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium h-11"
          >
            Lanjutkan ke Pembayaran
          </Button>
        </div>
      )}

      {/* STEP 4: PAYMENT SELECTION */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={() => {
                setPaymentMethod("umum")
                setError("")
              }}
              className={`p-4 rounded-lg border-2 cursor-pointer flex flex-col justify-between transition-all select-none ${paymentMethod === "umum"
                  ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/10 text-blue-600 dark:text-blue-400 font-semibold"
                  : "border-border bg-background hover:border-slate-400"
                }`}
            >
              <div className="flex justify-between items-start">
                <span className="text-sm font-bold text-foreground">Umum</span>
                <CreditCard className={`w-4 h-4 ${paymentMethod === "umum" ? "text-blue-600" : "text-foreground/40"}`} />
              </div>
              <span className="text-xs text-foreground/50 font-normal mt-2 leading-relaxed">
                Pembayaran mandiri (Tunai/Non-Tunai).
              </span>
            </div>

            <div
              onClick={() => {
                setPaymentMethod("bpjs")
                setError("")
              }}
              className={`p-4 rounded-lg border-2 cursor-pointer flex flex-col justify-between transition-all select-none ${paymentMethod === "bpjs"
                  ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/10 text-blue-600 dark:text-blue-400 font-semibold"
                  : "border-border bg-background hover:border-slate-400"
                }`}
            >
              <div className="flex justify-between items-start">
                <span className="text-sm font-bold text-foreground">BPJS</span>
                <ShieldAlert className={`w-4 h-4 ${paymentMethod === "bpjs" ? "text-blue-600" : "text-foreground/40"}`} />
              </div>
              <span className="text-xs text-foreground/50 font-normal mt-2 leading-relaxed">
                Penjaminan BPJS Kesehatan (JKN-KIS).
              </span>
            </div>
          </div>

          {paymentMethod === "bpjs" && (
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 space-y-2">
              <Label className="text-xs font-semibold text-foreground/70 uppercase block">No. Kartu BPJS *</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Masukkan 13 digit nomor kartu"
                  value={bpjsNo}
                  onChange={(e) => {
                    setBpjsNo(e.target.value.replace(/\D/g, "").slice(0, 13))
                    setError("")
                  }}
                  maxLength={13}
                  className="font-mono h-10 text-sm"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => verifyBpjs(bpjsNo)}
                  disabled={verifyingBpjs || formData.bpjsVerified || bpjsNo.length < 10}
                  className="h-10 px-4 text-xs"
                >
                  {verifyingBpjs ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : formData.bpjsVerified ? (
                    "Terverifikasi"
                  ) : (
                    "Cek Kartu"
                  )}
                </Button>
              </div>
              {formData.bpjsVerified && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                  ✓ Kepesertaan aktif dan valid.
                </p>
              )}
            </div>
          )}

          <Button
            onClick={() => submitPayment(paymentMethod, bpjsNo)}
            disabled={paymentMethod === "bpjs" && !formData.bpjsVerified}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium h-11"
          >
            Lanjutkan ke Konfirmasi
          </Button>
        </div>
      )}

      {/* STEP 5: CONFIRMATION */}
      {step === 5 && (
        <div className="space-y-4">
          <div className="p-4 border border-border/40 rounded-lg bg-slate-50/50 dark:bg-slate-900/10 space-y-4">
            <div className="space-y-2 text-xs">
              <p className="font-bold uppercase tracking-wider text-foreground/50 mb-1">Identitas Pasien</p>
              <div className="grid grid-cols-2 gap-y-1 gap-x-2">
                <span className="text-foreground/60">NIK:</span>
                <span className="font-mono text-foreground">{formData.nik}</span>
                <span className="text-foreground/60">Nama:</span>
                <span className="font-semibold text-foreground">{formData.name}</span>
                <span className="text-foreground/60">Lahir:</span>
                <span className="text-foreground">{formData.dob}</span>
                <span className="text-foreground/60">Gender:</span>
                <span className="text-foreground capitalize">{formData.gender === "male" ? "Laki-laki" : formData.gender === "female" ? "Perempuan" : formData.gender}</span>
              </div>
            </div>

            <div className="border-t border-border/40 pt-3 space-y-2 text-xs">
              <p className="font-bold uppercase tracking-wider text-foreground/50 mb-1">Detail Kunjungan & Bayar</p>
              <div className="grid grid-cols-2 gap-y-1 gap-x-2">
                <span className="text-foreground/60">Poli Tujuan:</span>
                <span className="font-semibold text-foreground">{formData.serviceName}</span>
                <span className="text-foreground/60">Tanggal:</span>
                <span className="font-semibold text-foreground">{formData.date}</span>
                <span className="text-foreground/60">Penjamin:</span>
                <span className="font-semibold text-foreground uppercase">{formData.paymentMethod}</span>
                {formData.paymentMethod === "bpjs" && (
                  <>
                    <span className="text-foreground/60">No. BPJS:</span>
                    <span className="font-mono text-foreground">{formData.bpjsNo}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <Button
            onClick={registerWalkin}
            disabled={submitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium h-11"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Memproses...</>
            ) : (
              "Konfirmasi & Cetak Antrian"
            )}
          </Button>
        </div>
      )}

      {/* STEP 6: REGISTRATION SUCCESS */}
      {step === 6 && (
        <div className="text-center py-4 space-y-4">
          <div className="inline-block p-3 rounded-full bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-12 h-12" />
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">Pendaftaran Berhasil</h2>
            <p className="text-xs text-foreground/60">
              Antrian untuk <span className="font-semibold text-foreground">{formData.name}</span> berhasil dibuat.
            </p>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50 space-y-3">
            <div>
              <p className="text-[10px] font-bold text-foreground/50 uppercase tracking-wider">Nomor Antrian</p>
              <p className="text-4xl font-black text-blue-600 dark:text-blue-400 font-mono tracking-tight my-1">
                {formData.queueNumber}
              </p>
            </div>

            <div className="border-t border-dashed border-slate-200 dark:border-slate-800 pt-3 grid grid-cols-2 gap-2 text-left text-xs">
              <div>
                <span className="text-[10px] text-foreground/50 block">Kode Booking</span>
                <span className="font-bold text-foreground font-mono">{formData.bookingCode}</span>
              </div>
              <div>
                <span className="text-[10px] text-foreground/50 block">Poli</span>
                <span className="font-semibold text-foreground truncate block">{formData.serviceName}</span>
              </div>
            </div>
          </div>

          <Button
            onClick={reset}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium h-11"
          >
            Daftarkan Pasien Lain
          </Button>
        </div>
      )}

      {/* Footer Navigation Back Button */}
      {step !== 1 && step !== 6 && (
        <div className="pt-2 flex justify-start">
          <Button
            variant="ghost"
            onClick={goBack}
            className="flex items-center gap-1.5 text-xs text-foreground/60 hover:text-foreground p-0 h-auto"
            disabled={submitting}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali
          </Button>
        </div>
      )}
    </div>
  )
}
