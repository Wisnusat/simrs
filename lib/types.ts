// Tipe data untuk fitur-fitur sistem

// Tipe untuk Pemeriksaan Awal (Perawat)
export interface VitalSign {
    id: string
    patientId: string
    patientName: string
    date: string
    bloodPressure: string
    heartRate: number
    temperature: number
    respiration: number
    weight: number
    height: number
    complaint: string
    notes: string
    nurseId: string
    nurseName: string
  }
  
  // Tipe untuk Tindakan Keperawatan (Perawat)
  export interface NursingAction {
    id: string
    patientId: string
    patientName: string
    date: string
    actionType: string
    description: string
    nurseId: string
    nurseName: string
    status: "pending" | "completed" | "cancelled"
  }
  
  // Tipe untuk Catatan Medis (Dokter)
  export interface MedicalNote {
    id: string
    patientId: string
    patientName: string
    date: string
    diagnosis: string
    notes: string
    recommendations: string
    doctorId: string
    doctorName: string
  }
  
  // Tipe untuk User (Admin)
  export interface User {
    id: string
    username: string
    password: string
    name: string
    role: "admin" | "doctor" | "nurse" | "pharmacist"
    email: string
    phone: string
    poli?: string
    schedule?: string
    license?: string
    shift?: string
    status: "active" | "inactive"
  }
  
  // Tipe untuk Puskesmas (Admin)
  export interface Hospital {
    id: string
    name: string
    address: string
    phone: string
    email: string
    head: string
    operationalHours: {
      weekdays: { start: string; end: string }
      saturday: { start: string; end: string }
      sunday: { start: string; end: string }
      emergency: string
    }
  }
  
  // Tipe untuk Poli (Admin)
  export interface Poli {
    id: string
    name: string
    doctor: string
    schedule: string
    time: string
    status: "active" | "inactive"
  }
  
  // Tipe untuk Tindakan (Admin)
  export interface MedicalAction {
    code: string
    name: string
    fee: number
  }
  
  // Tipe untuk Kategori Obat (Admin)
  export interface MedicineCategory {
    id: string
    name: string
  }
  
  // Tipe untuk Janji Temu
  export interface Appointment {
    id: string
    patientId: string
    patientName: string
    doctorId: string
    doctorName: string
    poli: string
    date: string
    time: string
    complaint: string
    status: "waiting" | "in-progress" | "completed" | "cancelled"
    queueNumber: number
    completedAt?: string
  }

  // Tipe untuk Rawat Inap
export interface Inpatient {
    id: string
    patientId: string
    patientName: string
    appointmentId: string
    admissionDate: string
    admissionTime: string
    roomNumber: string
    roomType: "VIP" | "Kelas 1" | "Kelas 2" | "Kelas 3"
    diagnosis: string
    doctorId: string
    doctorName: string
    status: "active" | "discharged" | "transferred"
    dischargeDate?: string
    dischargeTime?: string
    totalDays?: number
    notes: string
  }
  
  // Tipe untuk Rujukan
  export interface Referral {
    id: string
    patientId: string
    patientName: string
    appointmentId: string
    referralDate: string
    referralTime: string
    fromHospital: string
    toHospital: string
    toHospitalAddress: string
    toHospitalPhone: string
    referralType: "Konsultasi" | "Rawat Inap" | "Tindakan Khusus" | "Pemeriksaan Lanjutan"
    diagnosis: string
    reason: string
    urgency: "Biasa" | "Segera" | "Darurat"
    doctorId: string
    doctorName: string
    status: "pending" | "accepted" | "completed" | "cancelled"
    notes: string
  }
  
  // Tipe untuk Status Perawatan
  export type CareStatus = "rawat_jalan" | "rawat_inap" | "rujukan"
  
  // Extended Medical Record dengan status perawatan
  export interface ExtendedMedicalRecord {
    id: string
    patientId: string
    patientName: string
    appointmentId: string
    date: string
    time: string
    complaint: string
    vitalSigns: {
      bloodPressure?: string
      heartRate?: number
      temperature?: number
      respiration?: number
      weight?: number
      height?: number
    }
    examination: string
    diagnosis: string
    treatment: string
    notes: string
    recommendations: string
    followUp: {
      date?: string
      notes?: string
    }
    doctorId: string
    doctorName: string
    status: string
    careStatus: CareStatus
    careDetails?: {
      roomNumber?: string
      roomType?: string
      referralHospital?: string
      referralReason?: string
    }
  }
  