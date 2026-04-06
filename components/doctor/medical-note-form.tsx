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
import { HospitalStorage } from "@/lib/storage"
import type { MedicalNote } from "@/lib/types"

interface MedicalNoteFormProps {
  medicalNote?: MedicalNote
  onSave: (medicalNote: MedicalNote) => void
  onCancel: () => void
}

export default function MedicalNoteForm({ medicalNote, onSave, onCancel }: MedicalNoteFormProps) {
  const [formData, setFormData] = useState<Omit<MedicalNote, "id" | "doctorId" | "doctorName">>({
    patientId: medicalNote?.patientId || "",
    patientName: medicalNote?.patientName || "",
    date: medicalNote?.date || new Date().toISOString().split("T")[0],
    diagnosis: medicalNote?.diagnosis || "",
    notes: medicalNote?.notes || "",
    recommendations: medicalNote?.recommendations || "",
  })
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const storage = HospitalStorage.getInstance()

  useEffect(() => {
    // Load patients
    const allPatients = storage.getAll("patients")
    setPatients(allPatients)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      // Validate required fields
      if (!formData.patientId || !formData.diagnosis) {
        throw new Error("Pasien dan diagnosis wajib diisi")
      }

      // Get current doctor info
      const userSession = localStorage.getItem("userSession")
      if (!userSession) {
        throw new Error("Anda tidak memiliki akses untuk melakukan tindakan ini")
      }
      const session = JSON.parse(userSession)
      const users = storage.getAll("users") as Array<{ username: string; role: string; id: string; name: string }>
      const currentUser = users.find(u => u.username === session.username)
      if (!currentUser || currentUser.role !== "doctor") {
        throw new Error("Anda tidak memiliki akses untuk melakukan tindakan ini")
      }

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const medicalNoteData = {
        ...formData,
        doctorId: currentUser.id,
        doctorName: currentUser.name,
      }

      if (medicalNote?.id) {
        // Update existing medical note
        const updated = storage.update<MedicalNote>("medicalNotes", medicalNote.id, medicalNoteData)
        onSave(updated as MedicalNote)
      } else {
        // Create new medical note
        const newMedicalNote = {
          ...medicalNoteData,
          id: storage.generateId(),
        }
        const created = storage.create("medicalNotes", newMedicalNote)
        onSave(created)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = <K extends keyof typeof formData>(field: K, value: (typeof formData)[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
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
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>{medicalNote ? "Edit Catatan Medis" : "Catatan Medis Baru"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="patient">Pasien *</Label>
              <Select value={formData.patientId} onValueChange={handlePatientChange}>
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
              <Label htmlFor="date">Tanggal *</Label>
              <Input
                type="date"
                id="date"
                value={formData.date}
                onChange={(e) => handleChange("date", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="diagnosis">Diagnosis *</Label>
            <Input
              id="diagnosis"
              value={formData.diagnosis}
              onChange={(e) => handleChange("diagnosis", e.target.value)}
              placeholder="Diagnosis pasien"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Catatan Medis</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder="Catatan medis untuk pasien"
              rows={5}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recommendations">Rekomendasi</Label>
            <Textarea
              id="recommendations"
              value={formData.recommendations}
              onChange={(e) => handleChange("recommendations", e.target.value)}
              placeholder="Rekomendasi untuk pasien"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
              Batal
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground">
              {loading ? "Menyimpan..." : medicalNote ? "Update" : "Simpan"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
