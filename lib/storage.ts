/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import type { User, Hospital } from "./types"

// Local Storage Management for Hospital System
export class HospitalStorage {
  private static instance: HospitalStorage

  static getInstance(): HospitalStorage {
    if (!HospitalStorage.instance) {
      HospitalStorage.instance = new HospitalStorage()
    }
    return HospitalStorage.instance
  }

  // Initialize default data
  initializeData() {
    if (typeof window === "undefined") return

    // Initialize patients if not exists
    if (!localStorage.getItem("patients")) {
      localStorage.setItem("patients", JSON.stringify(this.getDefaultPatients()))
    }

    // Initialize medicines if not exists
    if (!localStorage.getItem("medicines")) {
      localStorage.setItem("medicines", JSON.stringify(this.getDefaultMedicines()))
    }

    // Initialize users if not exists
    if (!localStorage.getItem("users")) {
      localStorage.setItem("users", JSON.stringify(this.getDefaultUsers()))
    }

    // Initialize appointments if not exists
    if (!localStorage.getItem("appointments")) {
      localStorage.setItem("appointments", JSON.stringify(this.getDefaultAppointments()))
    }

    // Initialize prescriptions if not exists
    if (!localStorage.getItem("prescriptions")) {
      localStorage.setItem("prescriptions", JSON.stringify(this.getDefaultPrescriptions()))
    }

    // Initialize medical records if not exists
    if (!localStorage.getItem("medicalRecords")) {
      localStorage.setItem("medicalRecords", JSON.stringify(this.getDefaultMedicalRecords()))
    }

    // Initialize vital signs if not exists
    if (!localStorage.getItem("vitalSigns")) {
      localStorage.setItem("vitalSigns", JSON.stringify(this.getDefaultVitalSigns()))
    }

    // Initialize nursing actions if not exists
    if (!localStorage.getItem("nursingActions")) {
      localStorage.setItem("nursingActions", JSON.stringify(this.getDefaultNursingActions()))
    }

    // Initialize medical notes if not exists
    if (!localStorage.getItem("medicalNotes")) {
      localStorage.setItem("medicalNotes", JSON.stringify(this.getDefaultMedicalNotes()))
    }

    // Initialize hospital info if not exists
    if (!localStorage.getItem("hospital")) {
      localStorage.setItem("hospital", JSON.stringify(this.getDefaultHospital()))
    }

    // Initialize poli if not exists
    if (!localStorage.getItem("polis")) {
      localStorage.setItem("polis", JSON.stringify(this.getDefaultPolis()))
    }

    // Initialize medical actions if not exists
    if (!localStorage.getItem("medicalActions")) {
      localStorage.setItem("medicalActions", JSON.stringify(this.getDefaultMedicalActions()))
    }

    // Initialize medicine categories if not exists
    if (!localStorage.getItem("medicineCategories")) {
      localStorage.setItem("medicineCategories", JSON.stringify(this.getDefaultMedicineCategories()))
    }

    // Tambahkan inisialisasi data rawat inap dan rujukan di initializeData()
    // Initialize inpatients if not exists
    if (!localStorage.getItem("inpatients")) {
      localStorage.setItem("inpatients", JSON.stringify(this.getDefaultInpatients()))
    }

    // Initialize referrals if not exists
    if (!localStorage.getItem("referrals")) {
      localStorage.setItem("referrals", JSON.stringify(this.getDefaultReferrals()))
    }
  }

  // Generic CRUD operations
  create<T extends { id: string }>(key: string, item: T): T {
    const items = this.getAll<T>(key)
    items.push(item)
    localStorage.setItem(key, JSON.stringify(items))
    return item
  }

  getAll<T>(key: string): T[] {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : []
  }

  getById<T extends { id: string }>(key: string, id: string): T | null {
    const items = this.getAll<T>(key)
    return items.find((item) => item.id === id) || null
  }

  update<T extends { id: string }>(key: string, id: string, updates: Partial<T>): T | null {
    const items = this.getAll<T>(key)
    const index = items.findIndex((item) => item.id === id)
    if (index !== -1) {
      items[index] = { ...items[index], ...updates }
      localStorage.setItem(key, JSON.stringify(items))
      return items[index]
    }
    return null
  }

  delete(key: string, id: string): boolean {
    const items = this.getAll(key)
    const filteredItems = items.filter((item: any) => item.id !== id)
    if (filteredItems.length !== items.length) {
      localStorage.setItem(key, JSON.stringify(filteredItems))
      return true
    }
    return false
  }

  // Generate unique ID
  generateId(): string {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9)
  }

  // Get current user session
  getCurrentUser(): User | null {
    const userSession = localStorage.getItem("userSession")
    if (!userSession) return null

    const session = JSON.parse(userSession)
    const users = this.getAll<User>("users")
    return users.find((user) => user.username === session.username) || null
  }

  // Update hospital info
  updateHospitalInfo(updates: Partial<Hospital>): Hospital {
    const hospital = this.getHospitalInfo()
    const updatedHospital = { ...hospital, ...updates }
    localStorage.setItem("hospital", JSON.stringify(updatedHospital))
    return updatedHospital
  }

  // Get hospital info
  getHospitalInfo(): Hospital {
    const data = localStorage.getItem("hospital")
    return data ? JSON.parse(data) : this.getDefaultHospital()
  }

  // Default data
  private getDefaultPatients() {
    return [
      {
        id: "001234",
        name: "Budi Santoso",
        age: 45,
        gender: "Laki-laki",
        address: "Jl. Merdeka No. 123",
        phone: "081234567890",
        email: "budi@email.com",
        nik: "3201234567890123",
        registrationDate: "2024-01-15",
        bloodType: "O",
        allergies: "Tidak ada",
        emergencyContact: "Siti Santoso - 081234567891",
      },
      {
        id: "001235",
        name: "Siti Aminah",
        age: 32,
        gender: "Perempuan",
        address: "Jl. Sudirman No. 456",
        phone: "081234567891",
        email: "siti@email.com",
        nik: "3201234567890124",
        registrationDate: "2024-01-15",
        bloodType: "A",
        allergies: "Penisilin",
        emergencyContact: "Ahmad Aminah - 081234567892",
      },
      {
        id: "001236",
        name: "Ahmad Fauzi",
        age: 28,
        gender: "Laki-laki",
        address: "Jl. Thamrin No. 789",
        phone: "081234567892",
        email: "ahmad@email.com",
        nik: "3201234567890125",
        registrationDate: "2024-01-15",
        bloodType: "B",
        allergies: "Tidak ada",
        emergencyContact: "Dewi Fauzi - 081234567893",
      },
      {
        id: "001237",
        name: "Dewi Lestari",
        age: 37,
        gender: "Perempuan",
        address: "Jl. Gatot Subroto No. 101",
        phone: "081234567893",
        email: "dewi@email.com",
        nik: "3201234567890126",
        registrationDate: "2024-01-16",
        bloodType: "AB",
        allergies: "Debu",
        emergencyContact: "Rian Lestari - 081234567894",
      },
      {
        id: "001238",
        name: "Rian Nugroho",
        age: 50,
        gender: "Laki-laki",
        address: "Jl. Ahmad Yani No. 202",
        phone: "081234567894",
        email: "rian@email.com",
        nik: "3201234567890127",
        registrationDate: "2024-01-17",
        bloodType: "O",
        allergies: "Tidak ada",
        emergencyContact: "Tina Nugroho - 081234567895",
      },
      {
        id: "001239",
        name: "Tina Mariani",
        age: 29,
        gender: "Perempuan",
        address: "Jl. Pemuda No. 303",
        phone: "081234567895",
        email: "tina@email.com",
        nik: "3201234567890128",
        registrationDate: "2024-01-18",
        bloodType: "A",
        allergies: "Kacang",
        emergencyContact: "Dedi Mariani - 081234567896",
      },
      {
        id: "001240",
        name: "Dedi Gunawan",
        age: 41,
        gender: "Laki-laki",
        address: "Jl. Kebon Jeruk No. 404",
        phone: "081234567896",
        email: "dedi@email.com",
        nik: "3201234567890129",
        registrationDate: "2024-01-19",
        bloodType: "B",
        allergies: "Tidak ada",
        emergencyContact: "Mira Gunawan - 081234567897",
      },
      {
        id: "001241",
        name: "Mira Sari",
        age: 35,
        gender: "Perempuan",
        address: "Jl. Cikini Raya No. 505",
        phone: "081234567897",
        email: "mira@email.com",
        nik: "3201234567890130",
        registrationDate: "2024-01-20",
        bloodType: "AB",
        allergies: "Seafood",
        emergencyContact: "Bayu Sari - 081234567898",
      },
      {
        id: "001242",
        name: "Bayu Pratama",
        age: 26,
        gender: "Laki-laki",
        address: "Jl. Kalimalang No. 606",
        phone: "081234567898",
        email: "bayu@email.com",
        nik: "3201234567890131",
        registrationDate: "2024-01-21",
        bloodType: "O",
        allergies: "Tidak ada",
        emergencyContact: "Maya Pratama - 081234567899",
      },
      {
        id: "001243",
        name: "Maya Fitriani",
        age: 39,
        gender: "Perempuan",
        address: "Jl. Antasari No. 707",
        phone: "081234567899",
        email: "maya@email.com",
        nik: "3201234567890132",
        registrationDate: "2024-01-22",
        bloodType: "A",
        allergies: "Laktosa",
        emergencyContact: "Bayu Fitriani - 081234567800",
      }      
    ]
  }

  private getDefaultMedicines() {
    return [
      {
        id: "MED001",
        name: "Paracetamol 500mg",
        stock: 150,
        minStock: 50,
        price: 5000,
        unit: "strip",
        category: "Analgesik",
        description: "Obat pereda nyeri dan penurun demam",
        expiry: "2025-12-31",
      },
      {
        id: "MED002",
        name: "Amoxicillin 500mg",
        stock: 75,
        minStock: 30,
        price: 15000,
        unit: "strip",
        category: "Antibiotik",
        description: "Antibiotik untuk infeksi bakteri",
        expiry: "2025-06-30",
      },
      {
        id: "MED003",
        name: "OBH Combi",
        stock: 25,
        minStock: 20,
        price: 12000,
        unit: "botol",
        category: "Batuk & Flu",
        description: "Obat batuk kombinasi",
        expiry: "2025-03-31",
      },
      {
        id: "MED004",
        name: "Antasida",
        stock: 200,
        minStock: 40,
        price: 8000,
        unit: "tablet",
        category: "Pencernaan",
        description: "Obat maag dan asam lambung",
        expiry: "2025-09-30",
      },
    ]
  }

  private getDefaultUsers() {
    return [
      {
        id: "USR001",
        username: "admin123",
        password: "admin123",
        name: "Administrator",
        role: "admin",
        email: "admin@puskesmas.go.id",
        phone: "081234567890",
        status: "active",
      },
      {
        id: "USR002",
        username: "dokter123",
        password: "dokter123",
        name: "dr. Budi Santoso",
        role: "doctor",
        email: "budi@puskesmas.go.id",
        phone: "081234567891",
        poli: "Poli Umum",
        schedule: "Senin - Jumat, 08:00 - 15:00",
        license: "STR123456789",
        status: "active",
      },
      {
        id: "USR003",
        username: "perawat123",
        password: "perawat123",
        name: "Sari Perawat",
        role: "nurse",
        email: "sari@puskesmas.go.id",
        phone: "081234567892",
        shift: "Pagi",
        license: "SIKP123456789",
        status: "active",
      },
      {
        id: "USR004",
        username: "apoteker123",
        password: "apoteker123",
        name: "Dewi Apoteker",
        role: "pharmacist",
        email: "dewi@puskesmas.go.id",
        phone: "081234567893",
        license: "SIPA123456789",
        status: "active",
      },
    ]
  }

  private getDefaultAppointments() {
    return [
      {
        id: "APT001",
        patientId: "001234",
        patientName: "Budi Santoso",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        poli: "Poli Umum",
        date: "2024-01-15",
        time: "08:30",
        complaint: "Demam dan batuk",
        status: "completed",
        queueNumber: 1,
      },
      {
        id: "APT002",
        patientId: "001235",
        patientName: "Siti Aminah",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        poli: "Poli Umum",
        date: "2024-01-15",
        time: "09:00",
        complaint: "Sakit kepala",
        status: "in-progress",
        queueNumber: 2,
      },
    ]
  }

  private getDefaultPrescriptions() {
    return [
      {
        id: "RX001",
        appointmentId: "APT001",
        patientId: "001234",
        patientName: "Budi Santoso",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        date: "2024-01-15",
        medicines: [
          { medicineId: "MED001", medicineName: "Paracetamol 500mg", quantity: 10, dosage: "3x1 setelah makan" },
          { medicineId: "MED003", medicineName: "OBH Combi", quantity: 1, dosage: "3x1 sendok makan" },
        ],
        status: "dispensed",
        notes: "Minum obat sesuai dosis",
      },
    ]
  }

  private getDefaultMedicalRecords() {
    return [
      {
        id: "MR001",
        patientId: "001234",
        appointmentId: "APT001",
        date: "2024-01-15",
        complaint: "Demam dan batuk",
        examination: "TD: 120/80, Suhu: 38.5°C, Nadi: 88x/menit",
        diagnosis: "ISPA (Infeksi Saluran Pernapasan Atas)",
        treatment: "Istirahat, minum obat teratur",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
      },
    ]
  }

  // Default data untuk fitur baru
  private getDefaultVitalSigns() {
    return [
      {
        id: "VS001",
        patientId: "001234",
        patientName: "Budi Santoso",
        date: "2024-01-15",
        bloodPressure: "120/80",
        heartRate: 88,
        temperature: 38.5,
        respiration: 20,
        weight: 65,
        height: 170,
        complaint: "Demam dan batuk",
        notes: "Pasien terlihat lemas",
        nurseId: "USR003",
        nurseName: "Sari Perawat",
      },
      {
        id: "VS002",
        patientId: "001235",
        patientName: "Siti Aminah",
        date: "2024-01-15",
        bloodPressure: "130/90",
        heartRate: 76,
        temperature: 36.8,
        respiration: 18,
        weight: 55,
        height: 160,
        complaint: "Sakit kepala",
        notes: "Pasien mengeluh sakit kepala sejak kemarin",
        nurseId: "USR003",
        nurseName: "Sari Perawat",
      },
    ]
  }

  private getDefaultNursingActions() {
    return [
      {
        id: "NA001",
        patientId: "001234",
        patientName: "Budi Santoso",
        date: "2024-01-15",
        actionType: "Perawatan Luka",
        description: "Membersihkan dan mengganti perban luka di kaki kanan",
        nurseId: "USR003",
        nurseName: "Sari Perawat",
        status: "completed",
      },
      {
        id: "NA002",
        patientId: "001235",
        patientName: "Siti Aminah",
        date: "2024-01-15",
        actionType: "Injeksi Obat",
        description: "Injeksi antibiotik intramuskular",
        nurseId: "USR003",
        nurseName: "Sari Perawat",
        status: "completed",
      },
      {
        id: "NA003",
        patientId: "001236",
        patientName: "Ahmad Fauzi",
        date: "2024-01-15",
        actionType: "Pengukuran Vital Sign",
        description: "Pengukuran tekanan darah, suhu, dan detak jantung",
        nurseId: "USR003",
        nurseName: "Sari Perawat",
        status: "pending",
      },
    ]
  }

  private getDefaultMedicalNotes() {
    return [
      {
        id: "MN001",
        patientId: "001234",
        patientName: "Budi Santoso",
        date: "2024-01-15",
        diagnosis: "ISPA (Infeksi Saluran Pernapasan Atas)",
        notes:
          "Pasien datang dengan keluhan demam dan batuk sejak 3 hari yang lalu. Pemeriksaan fisik menunjukkan faring hiperemis.",
        recommendations: "Istirahat yang cukup, minum banyak air, dan minum obat sesuai resep.",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
      },
    ]
  }

  private getDefaultHospital() {
    return {
      id: "HOSP001",
      name: "PUSKESMAS MKP KELOMPOK 6",
      address: "Jl. Kesehatan No. 123, Kecamatan Sehat, Kabupaten Sejahtera",
      phone: "(021) 1234-5678",
      email: "info@puskesmasmkp6.go.id",
      head: "dr. Ahmad Sehat, M.Kes",
      operationalHours: {
        weekdays: { start: "08:00", end: "15:00" },
        saturday: { start: "08:00", end: "12:00" },
        sunday: { start: "", end: "" },
        emergency: "24 Jam",
      },
    }
  }

  private getDefaultPolis() {
    return [
      {
        id: "POL001",
        name: "Poli Umum",
        doctor: "dr. Budi Santoso",
        schedule: "Senin-Jumat",
        time: "08:00-15:00",
        status: "active",
      },
      {
        id: "POL002",
        name: "Poli KIA",
        doctor: "bidan Sari Dewi",
        schedule: "Senin, Rabu, Jumat",
        time: "08:00-12:00",
        status: "active",
      },
      {
        id: "POL003",
        name: "Poli Gigi",
        doctor: "drg. Dewi Lestari",
        schedule: "Selasa & Kamis",
        time: "08:00-12:00",
        status: "active",
      },
      {
        id: "POL004",
        name: "Poli Lansia",
        doctor: "dr. Ahmad Sehat",
        schedule: "Senin & Kamis",
        time: "08:00-11:00",
        status: "active",
      },
    ]
  }

  private getDefaultMedicalActions() {
    return [
      { code: "T001", name: "Pemeriksaan Umum", fee: 50000 },
      { code: "T002", name: "Perawatan Luka", fee: 75000 },
      { code: "T003", name: "Injeksi", fee: 25000 },
      { code: "T004", name: "Cabut Gigi", fee: 100000 },
      { code: "T005", name: "Imunisasi", fee: 0 },
    ]
  }

  private getDefaultMedicineCategories() {
    return [
      { id: "CAT001", name: "Analgesik" },
      { id: "CAT002", name: "Antibiotik" },
      { id: "CAT003", name: "Batuk & Flu" },
      { id: "CAT004", name: "Pencernaan" },
      { id: "CAT005", name: "Vitamin" },
      { id: "CAT006", name: "Kardiovaskular" },
      { id: "CAT007", name: "Diabetes" },
      { id: "CAT008", name: "Hipertensi" },
    ]
  }

  // Tambahkan method untuk default data rawat inap dan rujukan di akhir class

  private getDefaultInpatients() {
    return [
      {
        id: "INP001",
        patientId: "001234",
        patientName: "Budi Santoso",
        appointmentId: "APT001",
        admissionDate: "2024-01-15",
        admissionTime: "10:30",
        roomNumber: "201A",
        roomType: "Kelas 2",
        diagnosis: "Pneumonia",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "active",
        totalDays: 3,
        notes: "Pasien memerlukan observasi ketat, kondisi stabil",
      },
      {
        id: "INP002",
        patientId: "001235",
        patientName: "Siti Aminah",
        appointmentId: "APT002",
        admissionDate: "2024-01-14",
        admissionTime: "14:15",
        roomNumber: "102B",
        roomType: "Kelas 1",
        diagnosis: "Hipertensi Berat",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "discharged",
        dischargeDate: "2024-01-16",
        dischargeTime: "09:00",
        totalDays: 2,
        notes: "Pasien sudah stabil, dapat rawat jalan",
      },
      {
        id: "INP003",
        patientId: "001237",
        patientName: "Dewi Lestari",
        appointmentId: "APT003",
        admissionDate: "2024-01-17",
        admissionTime: "09:00",
        roomNumber: "401D",
        roomType: "VIP",
        diagnosis: "Asma Akut",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "active",
        totalDays: 2,
        notes: "Perlu terapi nebulizer secara rutin",
      },
      {
        id: "INP004",
        patientId: "001238",
        patientName: "Rian Nugroho",
        appointmentId: "APT004",
        admissionDate: "2024-01-18",
        admissionTime: "13:20",
        roomNumber: "202B",
        roomType: "Kelas 2",
        diagnosis: "Infeksi Saluran Kemih",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "discharged",
        dischargeDate: "2024-01-21",
        dischargeTime: "10:00",
        totalDays: 3,
        notes: "Respon baik terhadap antibiotik",
      },
      {
        id: "INP005",
        patientId: "001239",
        patientName: "Tina Mariani",
        appointmentId: "APT005",
        admissionDate: "2024-01-19",
        admissionTime: "15:10",
        roomNumber: "104A",
        roomType: "Kelas 1",
        diagnosis: "Migrain Kronis",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "active",
        totalDays: 1,
        notes: "Masih dalam observasi awal",
      },
      {
        id: "INP006",
        patientId: "001240",
        patientName: "Dedi Gunawan",
        appointmentId: "APT006",
        admissionDate: "2024-01-20",
        admissionTime: "16:45",
        roomNumber: "305B",
        roomType: "Kelas 3",
        diagnosis: "Tonsilitis",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "discharged",
        dischargeDate: "2024-01-22",
        dischargeTime: "11:15",
        totalDays: 2,
        notes: "Kondisi pulih, tidak perlu rawat ulang",
      },
      {
        id: "INP007",
        patientId: "001241",
        patientName: "Mira Sari",
        appointmentId: "APT007",
        admissionDate: "2024-01-21",
        admissionTime: "08:00",
        roomNumber: "502VIP",
        roomType: "VIP",
        diagnosis: "Diabetes Melitus",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "active",
        totalDays: 1,
        notes: "Perlu pengaturan diet dan insulin rutin",
      },
      {
        id: "INP008",
        patientId: "001242",
        patientName: "Bayu Pratama",
        appointmentId: "APT008",
        admissionDate: "2024-01-21",
        admissionTime: "10:30",
        roomNumber: "106C",
        roomType: "Kelas 2",
        diagnosis: "Gastritis Akut",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "discharged",
        dischargeDate: "2024-01-22",
        dischargeTime: "14:00",
        totalDays: 1,
        notes: "Perlu pengaturan pola makan",
      },
      {
        id: "INP009",
        patientId: "001243",
        patientName: "Maya Fitriani",
        appointmentId: "APT009",
        admissionDate: "2024-01-22",
        admissionTime: "17:20",
        roomNumber: "205A",
        roomType: "Kelas 1",
        diagnosis: "Vertigo",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "active",
        totalDays: 1,
        notes: "Sedang ditangani dengan terapi vertibular",
      },
      {
        id: "INP010",
        patientId: "001244",
        patientName: "Slamet Riyadi",
        appointmentId: "APT010",
        admissionDate: "2024-01-23",
        admissionTime: "12:40",
        roomNumber: "107B",
        roomType: "Kelas 3",
        diagnosis: "Tipes",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "active",
        totalDays: 1,
        notes: "Masih dalam pemantauan ketat",
      }      
    ]
  }

  private getDefaultReferrals() {
    return [
      {
        id: "REF001",
        patientId: "001236",
        patientName: "Ahmad Fauzi",
        appointmentId: "APT003",
        referralDate: "2024-01-15",
        referralTime: "11:45",
        fromHospital: "PUSKESMAS MKP KELOMPOK 6",
        toHospital: "RSUD Jakarta Pusat",
        toHospitalAddress: "Jl. Diponegoro No. 71, Jakarta Pusat",
        toHospitalPhone: "(021) 3190-7703",
        referralType: "Pemeriksaan Lanjutan",
        diagnosis: "Suspek Appendisitis Akut",
        reason: "Memerlukan pemeriksaan CT-Scan dan konsultasi bedah",
        urgency: "Segera",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "pending",
        notes: "Pasien mengeluh nyeri perut kanan bawah, perlu evaluasi lebih lanjut",
      },
      {
        id: "REF002",
        patientId: "001237",
        patientName: "Dewi Lestari",
        appointmentId: "APT004",
        referralDate: "2024-01-14",
        referralTime: "16:20",
        fromHospital: "PUSKESMAS MKP KELOMPOK 6",
        toHospital: "RS Jantung Harapan Kita",
        toHospitalAddress: "Jl. Letjen S. Parman Kav. 87, Jakarta Barat",
        toHospitalPhone: "(021) 568-4093",
        referralType: "Konsultasi",
        diagnosis: "Aritmia Jantung",
        reason: "Memerlukan konsultasi kardiologi dan pemeriksaan EKG lanjutan",
        urgency: "Biasa",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "accepted",
        notes: "Pasien sudah terjadwal konsultasi tanggal 18 Januari 2024",
      },
      {
        id: "REF003",
        patientId: "001238",
        patientName: "Rian Nugroho",
        appointmentId: "APT005",
        referralDate: "2024-01-18",
        referralTime: "10:15",
        fromHospital: "PUSKESMAS MKP KELOMPOK 6",
        toHospital: "RS Hermina Depok",
        toHospitalAddress: "Jl. Raya Siliwangi No.50, Depok",
        toHospitalPhone: "(021) 7721-1919",
        referralType: "Pemeriksaan Penunjang",
        diagnosis: "Infeksi Saluran Kemih",
        reason: "Perlu kultur urin dan USG abdomen",
        urgency: "Biasa",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "pending",
        notes: "Pasien mengalami nyeri saat buang air kecil",
      },
      {
        id: "REF004",
        patientId: "001239",
        patientName: "Tina Mariani",
        appointmentId: "APT006",
        referralDate: "2024-01-19",
        referralTime: "14:00",
        fromHospital: "PUSKESMAS MKP KELOMPOK 6",
        toHospital: "RS Mitra Keluarga Bekasi",
        toHospitalAddress: "Jl. Jend. Ahmad Yani No.1, Bekasi",
        toHospitalPhone: "(021) 885-8888",
        referralType: "Konsultasi Spesialis",
        diagnosis: "Migrain Kronis",
        reason: "Butuh evaluasi neurologis lanjutan",
        urgency: "Biasa",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "accepted",
        notes: "Pasien merespons kurang terhadap terapi awal",
      },
      {
        id: "REF005",
        patientId: "001240",
        patientName: "Dedi Gunawan",
        appointmentId: "APT007",
        referralDate: "2024-01-20",
        referralTime: "09:30",
        fromHospital: "PUSKESMAS MKP KELOMPOK 6",
        toHospital: "RSUP Fatmawati",
        toHospitalAddress: "Jl. RS Fatmawati Raya No.4, Jakarta Selatan",
        toHospitalPhone: "(021) 766-0552",
        referralType: "Rawat Inap",
        diagnosis: "Tonsilitis Berat",
        reason: "Memerlukan penanganan THT dan kemungkinan operasi",
        urgency: "Segera",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "pending",
        notes: "Pasien demam tinggi dan kesulitan menelan",
      },
      {
        id: "REF006",
        patientId: "001241",
        patientName: "Mira Sari",
        appointmentId: "APT008",
        referralDate: "2024-01-21",
        referralTime: "11:45",
        fromHospital: "PUSKESMAS MKP KELOMPOK 6",
        toHospital: "RS Premier Bintaro",
        toHospitalAddress: "Jl. MH Thamrin No.1, Bintaro, Tangerang Selatan",
        toHospitalPhone: "(021) 745-1555",
        referralType: "Kontrol Lanjutan",
        diagnosis: "Diabetes Melitus",
        reason: "Perlu pengaturan insulin lanjutan oleh internis",
        urgency: "Biasa",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "accepted",
        notes: "Kondisi gula darah belum stabil",
      },
      {
        id: "REF007",
        patientId: "001242",
        patientName: "Bayu Pratama",
        appointmentId: "APT009",
        referralDate: "2024-01-21",
        referralTime: "16:00",
        fromHospital: "PUSKESMAS MKP KELOMPOK 6",
        toHospital: "RS Islam Jakarta Cempaka Putih",
        toHospitalAddress: "Jl. Cempaka Putih Tengah I No.1, Jakarta Pusat",
        toHospitalPhone: "(021) 424-5345",
        referralType: "Pemeriksaan Penunjang",
        diagnosis: "Gastritis Akut",
        reason: "Butuh endoskopi saluran cerna atas",
        urgency: "Biasa",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "pending",
        notes: "Pasien sering mual dan nyeri ulu hati",
      },
      {
        id: "REF008",
        patientId: "001243",
        patientName: "Maya Fitriani",
        appointmentId: "APT010",
        referralDate: "2024-01-22",
        referralTime: "10:10",
        fromHospital: "PUSKESMAS MKP KELOMPOK 6",
        toHospital: "RSUD Pasar Rebo",
        toHospitalAddress: "Jl. TB Simatupang No.30, Jakarta Timur",
        toHospitalPhone: "(021) 840-1127",
        referralType: "Konsultasi",
        diagnosis: "Vertigo Berat",
        reason: "Perlu penanganan lebih lanjut oleh spesialis THT",
        urgency: "Segera",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "pending",
        notes: "Pasien sering pusing hebat disertai mual",
      },
      {
        id: "REF009",
        patientId: "001244",
        patientName: "Slamet Riyadi",
        appointmentId: "APT011",
        referralDate: "2024-01-23",
        referralTime: "09:00",
        fromHospital: "PUSKESMAS MKP KELOMPOK 6",
        toHospital: "RSUD Cengkareng",
        toHospitalAddress: "Jl. Kamal Raya No.1, Cengkareng, Jakarta Barat",
        toHospitalPhone: "(021) 5437-4444",
        referralType: "Rawat Inap",
        diagnosis: "Demam Tifoid",
        reason: "Perlu pemantauan laboratorium dan rawat inap",
        urgency: "Segera",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "pending",
        notes: "Demam lebih dari 7 hari, kondisi lemah",
      },
      {
        id: "REF010",
        patientId: "001245",
        patientName: "Ratna Ayu",
        appointmentId: "APT012",
        referralDate: "2024-01-24",
        referralTime: "13:30",
        fromHospital: "PUSKESMAS MKP KELOMPOK 6",
        toHospital: "RS Siloam Hospitals Kebon Jeruk",
        toHospitalAddress: "Jl. Perjuangan No.8, Jakarta Barat",
        toHospitalPhone: "(021) 2567-7788",
        referralType: "Konsultasi Spesialis",
        diagnosis: "Hipertiroidisme",
        reason: "Perlu konsultasi dengan endokrinolog",
        urgency: "Biasa",
        doctorId: "USR002",
        doctorName: "dr. Budi Santoso",
        status: "accepted",
        notes: "Pasien mengalami tremor dan penurunan berat badan",
      }      
    ]
  }
}

// Initialize storage when module loads
if (typeof window !== "undefined") {
  HospitalStorage.getInstance().initializeData()
}
