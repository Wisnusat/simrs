/**
 * components/pharmacist/prescription-detail.tsx
 * Detail view + dispense action for a single prescription.
 */
"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { StatusBadge } from "@/components/shared/status-badge"
import type { Prescription } from "@/lib/types/outpatient"

interface PrescriptionDetailProps {
  prescription: Prescription
  onDispense: (prescriptionId: string) => Promise<false | { dispensed: number; errors: string[] } | null>
  onClose: () => void
  loading: boolean
  error: string | null
  disableDispense?: boolean
}

export function PrescriptionDetail({
  prescription,
  onDispense,
  onClose,
  loading,
  error,
  disableDispense = false,
}: PrescriptionDetailProps) {
  const handleDispense = () => onDispense(prescription.id)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Nama Pasien</Label>
          <p className="font-semibold mt-0.5">{prescription.patients.full_name}</p>
        </div>
        <div>
          <Label>Dokter</Label>
          <p className="font-semibold mt-0.5">{prescription.practitioners.full_name ?? "—"}</p>
        </div>
        <div>
          <Label>Tanggal Resep</Label>
          <p className="font-semibold mt-0.5">
            {new Date(prescription.prescription_date).toLocaleDateString("id-ID")}
          </p>
        </div>
        <div>
          <Label>Status</Label>
          <div className="mt-1">
            <StatusBadge status={prescription.status} />
          </div>
        </div>
      </div>

      {/* Items */}
      <div>
        <Label>Daftar Obat</Label>
        <div className="mt-2 space-y-2">
          {prescription.prescription_items.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{item.medications.name}</p>
                  <p className="text-sm text-foreground/60">{item.medications.generic_name ?? ""}</p>
                  <p className="text-sm text-foreground/60">
                    Dosis: {item.dosage} | Jumlah: {item.quantity} {item.medications.unit ?? ""}
                  </p>
                  {item.instructions && (
                    <p className="text-sm text-foreground/60">Instruksi: {item.instructions}</p>
                  )}
                </div>
                <Badge
                  variant={
                    (item.stock_available ?? 0) >= item.quantity ? "outline" : "destructive"
                  }
                >
                  Stok: {item.stock_available ?? "—"}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
          Tutup
        </Button>
        {prescription.status === "active" && (
          <Button
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50"
            onClick={handleDispense}
            disabled={loading || disableDispense}
          >
            {loading ? "Memproses..." : disableDispense ? "Menunggu Pembayaran" : "Konfirmasi Penyerahan Obat"}
          </Button>
        )}
      </div>
    </div>
  )
}
