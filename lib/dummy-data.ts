/* eslint-disable @typescript-eslint/no-explicit-any */
import { HospitalStorage } from "./storage"

export function initializeDummyData() {
  const storage = HospitalStorage.getInstance()

  if (typeof window === "undefined") return

  // Seed only once; do NOT clear localStorage because it contains userSession.
  const seedFlagKey = "dummyDataInitialized"
  if (localStorage.getItem(seedFlagKey) === "true") return
  if (storage.getAll("appointments").length > 0) {
    localStorage.setItem(seedFlagKey, "true")
    return
  }

  const today = new Date().toISOString().split("T")[0]

  // Create dummy patients
  const patients = [
    {
      id: "P001",
      name: "Ahmad Wijaya",
      dateOfBirth: "1985-05-15",
      gender: "Laki-laki",
      phone: "08123456789",
      address: "Jl. Merdeka No. 123, Jakarta",
      bloodType: "A",
      allergies: "Tidak ada",
    },
    {
      id: "P002", 
      name: "Siti Nurhaliza",
      dateOfBirth: "1990-08-22",
      gender: "Perempuan",
      phone: "08234567890",
      address: "Jl. Sudirman No. 456, Jakarta",
      bloodType: "O",
      allergies: "Seafood",
    },
    {
      id: "P003",
      name: "Budi Santoso",
      dateOfBirth: "1978-12-10",
      gender: "Laki-laki", 
      phone: "08345678901",
      address: "Jl. Gatot Subroto No. 789, Jakarta",
      bloodType: "B",
      allergies: "Tidak ada",
    },
    {
      id: "P004",
      name: "Dewi Lestari",
      dateOfBirth: "1995-03-25",
      gender: "Perempuan",
      phone: "08456789012",
      address: "Jl. Thamrin No. 321, Jakarta",
      bloodType: "AB",
      allergies: "Peanuts",
    },
    {
      id: "P005",
      name: "Rudi Hermawan",
      dateOfBirth: "1982-07-18",
      gender: "Laki-laki",
      phone: "08567890123",
      address: "Jl. Rasuna Said No. 654, Jakarta",
      bloodType: "A",
      allergies: "Tidak ada",
    }
  ]

  // Create dummy appointments
  const appointments = [
    {
      id: "APT001",
      patientId: "P001",
      patientName: "Ahmad Wijaya",
      date: today,
      time: "08:00",
      complaint: "Sakit kepala dan demam",
      status: "scheduled",
      queueNumber: 1,
    },
    {
      id: "APT002",
      patientId: "P002",
      patientName: "Siti Nurhaliza", 
      date: today,
      time: "08:30",
      complaint: "Batuk dan pilek",
      status: "scheduled",
      queueNumber: 2,
    },
    {
      id: "APT003",
      patientId: "P003",
      patientName: "Budi Santoso",
      date: today,
      time: "09:00",
      complaint: "Nyeri dada",
      status: "scheduled",
      queueNumber: 3,
    },
    {
      id: "APT004",
      patientId: "P004",
      patientName: "Dewi Lestari",
      date: today,
      time: "09:30",
      complaint: "Sakit perut",
      status: "scheduled",
      queueNumber: 4,
    },
    {
      id: "APT005",
      patientId: "P005",
      patientName: "Rudi Hermawan",
      date: today,
      time: "10:00",
      complaint: "Pusing dan mual",
      status: "scheduled",
      queueNumber: 5,
    }
  ]

  // Create dummy medicines
  const medicines = [
    {
      id: "MED001",
      name: "Paracetamol",
      type: "Obat Bebas",
      stock: 100,
      unit: "tablet",
      price: 5000,
      manufacturer: "PT. Pharma Indonesia",
    },
    {
      id: "MED002", 
      name: "Amoxicillin",
      type: "Obat Keras",
      stock: 50,
      unit: "kapsul",
      price: 8000,
      manufacturer: "PT. Medika Jaya",
    },
    {
      id: "MED003",
      name: "Vitamin C",
      type: "Suplemen",
      stock: 200,
      unit: "tablet",
      price: 3000,
      manufacturer: "PT. Nutrisi Sehat",
    },
    {
      id: "MED004",
      name: "Omeprazole",
      type: "Obat Bebas Terbatas",
      stock: 75,
      unit: "kapsul",
      price: 12000,
      manufacturer: "PT. Farmasi Indonesia",
    },
    {
      id: "MED005",
      name: "Ibuprofen",
      type: "Obat Bebas",
      stock: 80,
      unit: "tablet",
      price: 6000,
      manufacturer: "PT. Obat Sehat",
    }
  ]

  // Create dummy users
  const users = [
    {
      id: "U001",
      username: "admin123",
      password: "admin123",
      name: "Admin System",
      role: "admin",
      email: "admin@carewell.com",
    },
    {
      id: "U002",
      username: "dokter123", 
      password: "dokter123",
      name: "Dr. Hendra Wijaya",
      role: "doctor",
      email: "hendra@carewell.com",
    },
    {
      id: "U003",
      username: "perawat123",
      password: "perawat123", 
      name: "Siti Aminah",
      role: "nurse",
      email: "siti@carewell.com",
    },
    {
      id: "U004",
      username: "apoteker123",
      password: "apoteker123",
      name: "Ahmad Fadli",
      role: "pharmacist", 
      email: "ahmad@carewell.com",
    },
    {
      id: "U005",
      username: "kasir123",
      password: "kasir123",
      name: "Rina Susanti",
      role: "cashier",
      email: "rina@carewell.com",
    }
  ]

  // Save all data to storage
  patients.forEach(patient => storage.create("patients", patient))
  appointments.forEach(appointment => storage.create("appointments", appointment))
  medicines.forEach(medicine => storage.create("medicines", medicine))
  users.forEach(user => storage.create("users", user))

  console.log("Dummy data initialized successfully!")
  localStorage.setItem(seedFlagKey, "true")
}
