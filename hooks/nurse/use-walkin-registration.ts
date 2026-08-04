import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { postWalkinRegistration, verifyPatientNik } from "@/lib/api/client"
import { toast } from "sonner"

export interface PoliService {
  id: string
  name: string
  code: string
}

export interface WalkinFormData {
  nik: string
  name: string
  email: string
  phone: string
  address: string
  gender: string
  dob: string
  serviceId: string
  serviceName: string
  date: string
  time: string
  paymentMethod: string
  bpjsNo: string
  bpjsVerified: boolean
  bookingCode: string
  queueNumber: string
}

const getTodayDateString = () => {
  return new Date().toISOString().split("T")[0]
}

const initialFormData: WalkinFormData = {
  nik: "",
  name: "",
  email: "",
  phone: "",
  address: "",
  gender: "",
  dob: "",
  serviceId: "",
  serviceName: "",
  date: getTodayDateString(),
  time: "Sekarang",
  paymentMethod: "umum",
  bpjsNo: "",
  bpjsVerified: false,
  bookingCode: "",
  queueNumber: "",
}

export function useWalkinRegistration(onSuccess?: () => void) {
  const [step, setStep] = useState(1)
  const [isNewPatient, setIsNewPatient] = useState(false)
  const [formData, setFormData] = useState<WalkinFormData>(initialFormData)
  
  const [services, setServices] = useState<PoliService[]>([])
  const [isLoadingServices, setIsLoadingServices] = useState(false)
  
  const [existingPatientId, setExistingPatientId] = useState<string | null>(null)
  const [isCheckingNik, setIsCheckingNik] = useState(false)
  const [verifyingBpjs, setVerifyingBpjs] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const supabase = createClient()

  // Fetch Poli Services
  const fetchServices = useCallback(async () => {
    setIsLoadingServices(true)
    try {
      const { data, error } = await supabase
        .from("poli_services")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name", { ascending: true })
      
      if (error) throw error
      setServices(data || [])
    } catch (err: any) {
      console.error("Failed to fetch services:", err)
      toast.error("Gagal memuat daftar poli")
    } finally {
      setIsLoadingServices(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchServices()
  }, [fetchServices])

  // Step 1: Verify NIK
  const verifyNik = async (nikToCheck: string) => {
    if (!nikToCheck.trim()) {
      setError("NIK wajib diisi")
      return
    }
    if (nikToCheck.length !== 16 || !/^\d+$/.test(nikToCheck)) {
      setError("NIK harus berisi 16 digit angka")
      return
    }

    setIsCheckingNik(true)
    setError("")

    try {
      const result = await verifyPatientNik(nikToCheck)

      if (result.status !== 'not_found' && result.patient) {
        const p = result.patient
        setExistingPatientId(p.id)
        setFormData(prev => ({
          ...prev,
          nik: nikToCheck,
          name: p.full_name || "",
          email: (p as any).email || "",
          phone: p.phone || "",
          address: p.address || "",
          gender: p.gender || "",
          dob: p.date_of_birth || "",
          bpjsNo: p.bpjs_no || "",
          bpjsVerified: !!p.bpjs_no,
        }))
        setIsNewPatient(false)
        setStep(3) // Skip to service selection
        toast.success(
          result.status === 'found_ihs' ? "Pasien Ditemukan di SATUSEHAT" : "Pasien Ditemukan",
          { description: result.status === 'found_ihs'
            ? `${p.full_name} diverifikasi dari SATUSEHAT dan telah didaftarkan.`
            : `Pasien atas nama ${p.full_name} terdaftar.` }
        )
      } else {
        setExistingPatientId(null)
        setFormData(prev => ({
          ...prev,
          nik: nikToCheck,
          name: "",
          email: "",
          phone: "",
          address: "",
          gender: "",
          dob: "",
          bpjsNo: "",
          bpjsVerified: false,
        }))
        setIsNewPatient(true)
        setStep(2) // Go to profile completion
        toast("Pasien Baru", {
          description: "NIK belum terdaftar di sistem maupun SATUSEHAT. Silakan lengkapi profil pasien.",
        })
      }
    } catch (err: any) {
      console.error("NIK verify error:", err)
      setError(err.message || "Gagal memverifikasi NIK")
    } finally {
      setIsCheckingNik(false)
    }
  }

  // Step 2: Submit Profile Data
  const submitProfile = (profileData: {
    name: string
    email: string
    phone: string
    address: string
    gender: string
    dob: string
  }) => {
    setFormData(prev => ({ ...prev, ...profileData }))
    setStep(3)
  }

  // Step 3: Submit Service selection
  const submitService = (serviceId: string) => {
    const selectedSvc = services.find(s => s.id === serviceId)
    setFormData(prev => ({
      ...prev,
      serviceId,
      serviceName: selectedSvc?.name || "",
      date: getTodayDateString(),
      time: "Sekarang",
    }))
    setStep(4)
  }

  // Verify BPJS
  const verifyBpjs = async (bpjsNoToCheck: string) => {
    if (!bpjsNoToCheck || bpjsNoToCheck.length < 10) {
      toast.error("Nomor BPJS tidak valid")
      return
    }
    setVerifyingBpjs(true)
    // Mock BPJS verification
    setTimeout(() => {
      setVerifyingBpjs(false)
      setFormData(prev => ({ ...prev, bpjsNo: bpjsNoToCheck, bpjsVerified: true }))
      toast.success("BPJS Terverifikasi", { description: "Nomor BPJS aktif dan dapat digunakan (Mock)" })
    }, 1000)
  }

  // Step 4: Submit Payment
  const submitPayment = (paymentMethod: string, bpjsNo: string) => {
    if (paymentMethod === "bpjs" && !formData.bpjsVerified) {
      toast.warning("Mohon verifikasi nomor BPJS Kesehatan terlebih dahulu")
      return
    }
    setFormData(prev => ({ ...prev, paymentMethod, bpjsNo }))
    setStep(5)
  }

  // Step 5: Confirm and Register
  const registerWalkin = async () => {
    setSubmitting(true)
    setError("")
    try {
      let patientId = ""

      if (isNewPatient) {
        // Create new patient via API
        const response = await fetch("/api/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nik: formData.nik || null,
            full_name: formData.name,
            email: formData.email || null,
            phone: formData.phone || null,
            address: formData.address || null,
            gender: formData.gender,
            date_of_birth: formData.dob,
            bpjs_no: formData.bpjsNo || null,
          }),
        })

        const result = await response.json()
        if (!result.success) {
          throw new Error(result.error || "Gagal mendaftarkan pasien baru")
        }
        patientId = result.data.id
      } else {
        if (!existingPatientId) throw new Error("Data pasien tidak ditemukan")
        patientId = existingPatientId
      }

      // Call walkin registration API
      const result = await postWalkinRegistration({
        patientId,
        poliServiceId: formData.serviceId,
        paymentMethod: formData.paymentMethod,
      })

      if (result && result.booking_code) {
        setFormData(prev => ({
          ...prev,
          bookingCode: result.booking_code,
          queueNumber: result.queue?.queue_number || "---",
        }))
        setStep(6)
        if (onSuccess) onSuccess()
      } else {
        throw new Error("Gagal memproses pendaftaran walk-in")
      }
    } catch (err: any) {
      console.error("Walkin registration error:", err)
      setError(err.message || "Terjadi kesalahan saat pendaftaran")
    } finally {
      setSubmitting(false)
    }
  }

  const goBack = () => {
    if (step === 3 && isNewPatient) {
      setStep(2)
    } else if (step === 3 && !isNewPatient) {
      setStep(1)
    } else if (step > 1) {
      setStep(step - 1)
    }
  }

  const reset = () => {
    setStep(1)
    setIsNewPatient(false)
    setExistingPatientId(null)
    setFormData({
      ...initialFormData,
      date: getTodayDateString(),
    })
    setError("")
  }

  return {
    step,
    isNewPatient,
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
  }
}
