/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { HospitalStorage } from "@/lib/storage"
import { Plus, Trash2 } from "lucide-react"

interface PrescriptionMedicine {
  medicineId: string
  medicineName: string
  quantity: number
  dosage: string
}

interface Prescription {
  id?: string
  appointmentId: string
  patientId: string
  patientName: string
  doctorId: string
  doctorName: string
  date: string
  medicines: PrescriptionMedicine[]
  status: string
  notes: string
}

interface PrescriptionFormProps {
  prescription?: Prescription
  appointmentId?: string
  patientId?: string
  onSave: (prescription: Prescription) => void
  onCancel: () => void
}

export default function PrescriptionForm({
  prescription,
  appointmentId,
  patientId,
  onSave,
  onCancel,
}: PrescriptionFormProps) {
  const [formData, setFormData] = useState<Prescription>({
    appointmentId: prescription?.appointmentId || appointmentId || "",
    patientId: prescription?.patientId || patientId || "",
    patientName: prescription?.patientName || "",
    doctorId: prescription?.doctorId || "",
    doctorName: prescription?.doctorName || "",
    date: prescription?.date || new Date().toISOString().split("T")[0],
    medicines: prescription?.medicines || [],
    status: prescription?.status || "pending",
    notes: prescription?.notes || "",
  })
  const [availableMedicines, setAvailableMedicines] = useState<any[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const storage = HospitalStorage.getInstance()

  useEffect(() => {
    // Load available medicines and patients
    const medicines = storage.getAll("medicines")
    const allPatients = storage.getAll("patients")
    setAvailableMedicines(medicines)
    setPatients(allPatients)

    // If patientId is provided, load patient data
    if (patientId) {
      const patient: any = allPatients.find((p: any) => p.id === patientId)
      if (patient) {
        setFormData((prev) => ({
          ...prev,
          patientName: patient.name,
        }))
      }
    }

    // Load current user session for doctor info
    const userSession = localStorage.getItem("userSession")
    if (userSession) {
      const session = JSON.parse(userSession)
      if (session.role === "doctor") {
        const users = storage.getAll("users")
        const doctor: any = users.find((u: any) => u.username === session.username)
        if (doctor) {
          setFormData((prev) => ({
            ...prev,
            doctorId: doctor.id,
            doctorName: doctor.name,
          }))
        }
      }
    }
  }, [patientId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      // Validate required fields
      if (!formData.patientId || !formData.doctorId || formData.medicines.length === 0) {
        throw new Error("Pasien, dokter, dan minimal satu obat wajib diisi")
      }

      // Validate medicine quantities
      for (const medicine of formData.medicines) {
        if (medicine.quantity <= 0) {
          throw new Error(`Jumlah obat ${medicine.medicineName} harus lebih dari 0`)
        }

        // Check stock availability
        const availableMedicine = availableMedicines.find((m) => m.id === medicine.medicineId)
        if (availableMedicine && availableMedicine.stock < medicine.quantity) {
          throw new Error(`Stok ${medicine.medicineName} tidak mencukupi. Tersedia: ${availableMedicine.stock}`)
        }
      }

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000))

      if (prescription?.id) {
        // Update existing prescription
        storage.update("prescriptions", prescription.id, formData)
      } else {
        // Create new prescription
        const newPrescription = {
          ...formData,
          id: storage.generateId(),
        }
        storage.create("prescriptions", newPrescription)
      }

      onSave(formData)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const addMedicine = () => {
    setFormData((prev) => ({
      ...prev,
      medicines: [...prev.medicines, { medicineId: "", medicineName: "", quantity: 1, dosage: "" }],
    }))
  }

  const removeMedicine = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      medicines: prev.medicines.filter((_, i) => i !== index),
    }))
  }

  const updateMedicine = (index: number, field: keyof PrescriptionMedicine, value: any) => {
    setFormData((prev) => ({
      ...prev,
      medicines: prev.medicines.map((medicine, i) => {
        if (i === index) {
          if (field === "medicineId") {
            const selectedMedicine = availableMedicines.find((m) => m.id === value)
            return {
              ...medicine,
              medicineId: value,
              medicineName: selectedMedicine?.name || "",
            }
          }
          return { ...medicine, [field]: value }
        }
        return medicine
      }),
    }))
  }

  const handlePatientChange = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId)
    if (patient) {
      setFormData((prev) => ({
        ...prev,
        patientId,
        patientName: patient.name,
      }))
    }
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>{prescription ? "Edit Resep" : "Buat Resep Baru"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Patient and Doctor Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="patient">Pasien *</Label>
              <Select value={formData.patientId} onValueChange={handlePatientChange} disabled={!!patientId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih pasien" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.name} - {patient.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="doctor">Dokter</Label>
              <Input value={formData.doctorName} disabled className="bg-muted/40" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Tanggal</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="dispensed">Sudah Diserahkan</SelectItem>
                  <SelectItem value="cancelled">Dibatalkan</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Medicines */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-semibold">Daftar Obat *</Label>
              <Button type="button" onClick={addMedicine} size="sm" variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Tambah Obat
              </Button>
            </div>

            {formData.medicines.length === 0 && (
              <div className="text-center py-8 text-foreground/50">Belum ada obat yang ditambahkan</div>
            )}

            {formData.medicines.map((medicine, index) => (
              <Card key={index} className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className="space-y-2">
                    <Label>Nama Obat</Label>
                    <Select
                      value={medicine.medicineId}
                      onValueChange={(value) => updateMedicine(index, "medicineId", value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pilih obat" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMedicines.map((med) => (
                          <SelectItem key={med.id} value={med.id}>
                            <div className="flex items-center justify-between w-full">
                              <span>{med.name}</span>
                              <Badge variant="outline" className="ml-2">
                                Stok: {med.stock}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Jumlah</Label>
                    <Input
                      type="number"
                      value={medicine.quantity}
                      onChange={(e) => updateMedicine(index, "quantity", Number.parseInt(e.target.value) || 1)}
                      min="1"
                      placeholder="Jumlah"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Dosis & Aturan Pakai</Label>
                    <Input
                      value={medicine.dosage}
                      onChange={(e) => updateMedicine(index, "dosage", e.target.value)}
                      placeholder="3x1 setelah makan"
                    />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeMedicine(index)}
                    className="h-10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Catatan tambahan untuk resep"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
              Batal
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground">
              {loading ? "Menyimpan..." : prescription ? "Update Resep" : "Buat Resep"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
