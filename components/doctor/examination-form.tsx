/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { HospitalStorage } from "@/lib/storage"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Appointment, type CareStatus } from "@/lib/types"

interface ExaminationFormProps {
  appointment: any
  onSave: () => void
  onCancel: () => void
}

export default function ExaminationForm({ appointment, onSave, onCancel }: ExaminationFormProps) {
  const [formData, setFormData] = useState({
    // Vital Signs
    bloodPressure: "",
    heartRate: "",
    temperature: "",
    respiration: "",
    weight: "",
    height: "",

    // Examination
    physicalExamination: "",
    diagnosis: "",
    treatment: "",
    notes: "",
    recommendations: "",

    // Follow up
    followUpDate: "",
    followUpNotes: "",

    // Care Status
    careStatus: "rawat_jalan" as CareStatus,

    // Rawat Inap Details
    roomType: "",
    inpatientNotes: "",

    // Rujukan Details
    referralHospital: "",
    referralAddress: "",
    referralPhone: "",
    referralType: "",
    referralReason: "",
    referralUrgency: "Biasa",
    referralNotes: "",
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const storage = HospitalStorage.getInstance()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      // Validate required fields
      if (!formData.diagnosis || !formData.treatment) {
        throw new Error("Diagnosis dan tindakan wajib diisi")
      }

      // Validate care status specific fields
      if (formData.careStatus === "rawat_inap" && !formData.roomType) {
        throw new Error("Tipe kamar wajib diisi untuk rawat inap")
      }

      if (formData.careStatus === "rujukan") {
        if (!formData.referralHospital || !formData.referralReason) {
          throw new Error("Rumah sakit tujuan dan alasan rujukan wajib diisi")
        }
      }

      // Get current doctor info
      const currentUser = storage.getCurrentUser()
      if (!currentUser || currentUser.role !== "doctor") {
        throw new Error("Anda tidak memiliki akses untuk melakukan tindakan ini")
      }

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Create medical record
      const medicalRecord = {
        id: "MR" + storage.generateId(),
        patientId: appointment.patientId,
        patientName: appointment.patientName,
        appointmentId: appointment.id,
        date: new Date().toISOString().split("T")[0],
        time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        complaint: appointment.complaint,
        vitalSigns: {
          bloodPressure: formData.bloodPressure,
          heartRate: formData.heartRate ? Number.parseInt(formData.heartRate) : null,
          temperature: formData.temperature ? Number.parseFloat(formData.temperature) : null,
          respiration: formData.respiration ? Number.parseInt(formData.respiration) : null,
          weight: formData.weight ? Number.parseFloat(formData.weight) : null,
          height: formData.height ? Number.parseFloat(formData.height) : null,
        },
        examination: formData.physicalExamination,
        diagnosis: formData.diagnosis,
        treatment: formData.treatment,
        notes: formData.notes,
        recommendations: formData.recommendations,
        followUp: {
          date: formData.followUpDate,
          notes: formData.followUpNotes,
        },
        doctorId: currentUser.id,
        doctorName: currentUser.name,
        status: "completed",
        careStatus: formData.careStatus,
        careDetails: {
          roomType: formData.roomType,
          referralHospital: formData.referralHospital,
          referralReason: formData.referralReason,
        },
      }

      // Save medical record
      storage.create("medicalRecords", medicalRecord)

      // Handle specific care status actions
      if (formData.careStatus === "rawat_inap") {
        // Create inpatient record
        const inpatientRecord = {
          id: "INP" + storage.generateId(),
          patientId: appointment.patientId,
          patientName: appointment.patientName,
          appointmentId: appointment.id,
          admissionDate: new Date().toISOString().split("T")[0],
          admissionTime: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          roomNumber: `${Math.floor(Math.random() * 300) + 100}${String.fromCharCode(65 + Math.floor(Math.random() * 3))}`,
          roomType: formData.roomType,
          diagnosis: formData.diagnosis,
          doctorId: currentUser.id,
          doctorName: currentUser.name,
          status: "active",
          notes: formData.inpatientNotes || formData.notes,
        }
        storage.create("inpatients", inpatientRecord)
      } else if (formData.careStatus === "rujukan") {
        // Create referral record
        const referralRecord = {
          id: "REF" + storage.generateId(),
          patientId: appointment.patientId,
          patientName: appointment.patientName,
          appointmentId: appointment.id,
          referralDate: new Date().toISOString().split("T")[0],
          referralTime: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          fromHospital: "PUSKESMAS MKP KELOMPOK 6",
          toHospital: formData.referralHospital,
          toHospitalAddress: formData.referralAddress,
          toHospitalPhone: formData.referralPhone,
          referralType: formData.referralType,
          diagnosis: formData.diagnosis,
          reason: formData.referralReason,
          urgency: formData.referralUrgency,
          doctorId: currentUser.id,
          doctorName: currentUser.name,
          status: "pending",
          notes: formData.referralNotes || formData.notes,
        }
        storage.create("referrals", referralRecord)
      }

      // Update appointment status
      let appointmentStatus: "completed" | "waiting" | "in-progress" | "cancelled" = "completed"
      if (formData.careStatus === "rawat_inap") {
        appointmentStatus = "completed"
      } else if (formData.careStatus === "rujukan") {
        appointmentStatus = "completed"
      }

      storage.update<Appointment>("appointments", appointment.id, {
        status: appointmentStatus,
        completedAt: new Date().toISOString(),
      })

      // Create medical note as well
      const medicalNote = {
        id: "MN" + storage.generateId(),
        patientId: appointment.patientId,
        patientName: appointment.patientName,
        date: new Date().toISOString().split("T")[0],
        diagnosis: formData.diagnosis,
        notes: `${formData.physicalExamination}\n\nCatatan: ${formData.notes}\n\nStatus Perawatan: ${formData.careStatus === "rawat_jalan" ? "Rawat Jalan" : formData.careStatus === "rawat_inap" ? "Rawat Inap" : "Rujukan"}`,
        recommendations: formData.recommendations,
        doctorId: currentUser.id,
        doctorName: currentUser.name,
      }

      storage.create("medicalNotes", medicalNote)

      onSave()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Card className="w-full max-w-5xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Hasil Pemeriksaan Pasien</span>
          <Badge variant="outline">#{appointment.queueNumber}</Badge>
        </CardTitle>
        <div className="text-sm text-foreground/60">
          <p>
            <strong>Pasien:</strong> {appointment.patientName}
          </p>
          <p>
            <strong>Keluhan:</strong> {appointment.complaint}
          </p>
          <p>
            <strong>Tanggal:</strong> {new Date().toLocaleDateString("id-ID")}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Vital Signs Section */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Tanda Vital</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bloodPressure">Tekanan Darah</Label>
                <Input
                  id="bloodPressure"
                  value={formData.bloodPressure}
                  onChange={(e) => handleChange("bloodPressure", e.target.value)}
                  placeholder="120/80"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="heartRate">Detak Jantung (bpm)</Label>
                <Input
                  id="heartRate"
                  type="number"
                  value={formData.heartRate}
                  onChange={(e) => handleChange("heartRate", e.target.value)}
                  placeholder="80"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="temperature">Suhu (°C)</Label>
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => handleChange("temperature", e.target.value)}
                  placeholder="36.5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="respiration">Pernapasan (/menit)</Label>
                <Input
                  id="respiration"
                  type="number"
                  value={formData.respiration}
                  onChange={(e) => handleChange("respiration", e.target.value)}
                  placeholder="20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">Berat Badan (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.1"
                  value={formData.weight}
                  onChange={(e) => handleChange("weight", e.target.value)}
                  placeholder="65"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="height">Tinggi Badan (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  value={formData.height}
                  onChange={(e) => handleChange("height", e.target.value)}
                  placeholder="170"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Physical Examination */}
          <div className="space-y-2">
            <Label htmlFor="physicalExamination">Pemeriksaan Fisik</Label>
            <Textarea
              id="physicalExamination"
              value={formData.physicalExamination}
              onChange={(e) => handleChange("physicalExamination", e.target.value)}
              placeholder="Hasil pemeriksaan fisik pasien..."
              rows={4}
            />
          </div>

          {/* Diagnosis */}
          <div className="space-y-2">
            <Label htmlFor="diagnosis">Diagnosis *</Label>
            <Input
              id="diagnosis"
              value={formData.diagnosis}
              onChange={(e) => handleChange("diagnosis", e.target.value)}
              placeholder="Diagnosis penyakit"
              required
            />
          </div>

          {/* Treatment */}
          <div className="space-y-2">
            <Label htmlFor="treatment">Tindakan/Terapi *</Label>
            <Textarea
              id="treatment"
              value={formData.treatment}
              onChange={(e) => handleChange("treatment", e.target.value)}
              placeholder="Tindakan yang diberikan kepada pasien..."
              rows={3}
              required
            />
          </div>

          <Separator />

          {/* Care Status Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Status Perawatan</h3>
            <RadioGroup
              value={formData.careStatus}
              onValueChange={(value: any) => handleChange("careStatus", value)}
              className="flex flex-col space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="rawat_jalan" id="rawat_jalan" />
                <Label htmlFor="rawat_jalan">Rawat Jalan</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="rawat_inap" id="rawat_inap" />
                <Label htmlFor="rawat_inap">Rawat Inap</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="rujukan" id="rujukan" />
                <Label htmlFor="rujukan">Rujukan</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Rawat Inap Details */}
          {formData.careStatus === "rawat_inap" && (
            <Card className="p-4 bg-muted/40">
              <h4 className="font-semibold mb-3">Detail Rawat Inap</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="roomType">Tipe Kamar *</Label>
                  <Select value={formData.roomType} onValueChange={(value) => handleChange("roomType", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih tipe kamar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VIP">VIP</SelectItem>
                      <SelectItem value="Kelas 1">Kelas 1</SelectItem>
                      <SelectItem value="Kelas 2">Kelas 2</SelectItem>
                      <SelectItem value="Kelas 3">Kelas 3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inpatientNotes">Catatan Rawat Inap</Label>
                  <Textarea
                    id="inpatientNotes"
                    value={formData.inpatientNotes}
                    onChange={(e) => handleChange("inpatientNotes", e.target.value)}
                    placeholder="Catatan khusus untuk rawat inap..."
                    rows={2}
                  />
                </div>
              </div>
            </Card>
          )}

          {/* Rujukan Details */}
          {formData.careStatus === "rujukan" && (
            <Card className="p-4 bg-muted/40">
              <h4 className="font-semibold mb-3">Detail Rujukan</h4>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="referralHospital">Rumah Sakit Tujuan *</Label>
                    <Input
                      id="referralHospital"
                      value={formData.referralHospital}
                      onChange={(e) => handleChange("referralHospital", e.target.value)}
                      placeholder="Nama rumah sakit tujuan"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="referralType">Jenis Rujukan</Label>
                    <Select
                      value={formData.referralType}
                      onValueChange={(value) => handleChange("referralType", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih jenis rujukan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Konsultasi">Konsultasi</SelectItem>
                        <SelectItem value="Rawat Inap">Rawat Inap</SelectItem>
                        <SelectItem value="Tindakan Khusus">Tindakan Khusus</SelectItem>
                        <SelectItem value="Pemeriksaan Lanjutan">Pemeriksaan Lanjutan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="referralAddress">Alamat Rumah Sakit</Label>
                    <Input
                      id="referralAddress"
                      value={formData.referralAddress}
                      onChange={(e) => handleChange("referralAddress", e.target.value)}
                      placeholder="Alamat lengkap rumah sakit"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="referralPhone">Telepon Rumah Sakit</Label>
                    <Input
                      id="referralPhone"
                      value={formData.referralPhone}
                      onChange={(e) => handleChange("referralPhone", e.target.value)}
                      placeholder="Nomor telepon rumah sakit"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="referralReason">Alasan Rujukan *</Label>
                  <Textarea
                    id="referralReason"
                    value={formData.referralReason}
                    onChange={(e) => handleChange("referralReason", e.target.value)}
                    placeholder="Alasan mengapa pasien perlu dirujuk..."
                    rows={3}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="referralUrgency">Tingkat Urgensi</Label>
                    <Select
                      value={formData.referralUrgency}
                      onValueChange={(value) => handleChange("referralUrgency", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih tingkat urgensi" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Biasa">Biasa</SelectItem>
                        <SelectItem value="Segera">Segera</SelectItem>
                        <SelectItem value="Darurat">Darurat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="referralNotes">Catatan Rujukan</Label>
                    <Textarea
                      id="referralNotes"
                      value={formData.referralNotes}
                      onChange={(e) => handleChange("referralNotes", e.target.value)}
                      placeholder="Catatan tambahan untuk rujukan..."
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan Tambahan</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder="Catatan tambahan untuk pasien..."
              rows={3}
            />
          </div>

          {/* Recommendations */}
          <div className="space-y-2">
            <Label htmlFor="recommendations">Rekomendasi</Label>
            <Textarea
              id="recommendations"
              value={formData.recommendations}
              onChange={(e) => handleChange("recommendations", e.target.value)}
              placeholder="Rekomendasi untuk pasien (obat, kontrol, dll)..."
              rows={3}
            />
          </div>

          <Separator />

          {/* Follow Up */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Tindak Lanjut</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="followUpDate">Tanggal Kontrol</Label>
                <Input
                  id="followUpDate"
                  type="date"
                  value={formData.followUpDate}
                  onChange={(e) => handleChange("followUpDate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="followUpNotes">Catatan Kontrol</Label>
                <Textarea
                  id="followUpNotes"
                  value={formData.followUpNotes}
                  onChange={(e) => handleChange("followUpNotes", e.target.value)}
                  placeholder="Catatan untuk kontrol berikutnya..."
                  rows={2}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
              Batal
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-[#2E8B57] hover:bg-[#2E8B57]/90">
              {loading ? "Menyimpan..." : "Simpan Hasil Pemeriksaan"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
