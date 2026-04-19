/**
 * components/cashier/payment-form.tsx
 * Payment processing form for a single invoice.
 */
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Invoice, PaymentMethod } from "@/lib/types/outpatient"

interface PaymentFormProps {
  invoice: Invoice
  onPay: (method: PaymentMethod, paidAmount?: number) => Promise<boolean>
  onCancel: () => void
  loading: boolean
  error: string | null
}

export function PaymentForm({ invoice, onPay, onCancel, loading, error }: PaymentFormProps) {
  const [method, setMethod] = useState<PaymentMethod>("cash")
  const [cashReceived, setCashReceived] = useState("")
  const [localError, setLocalError] = useState("")

  const change =
    method === "cash" && cashReceived
      ? Math.max(0, Number(cashReceived) - invoice.total_amount)
      : 0

  const handlePay = async () => {
    setLocalError("")
    if (method === "cash" && (!cashReceived || Number(cashReceived) < invoice.total_amount)) {
      setLocalError("Uang yang diterima tidak mencukupi")
      return
    }
    await onPay(method, invoice.total_amount)
  }

  const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`
  const displayError = localError || error

  return (
    <div className="space-y-5">
      {/* Patient + invoice info */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <Label>Nama Pasien</Label>
          <p className="font-semibold mt-0.5">{invoice.patients.full_name}</p>
        </div>
        <div>
          <Label>No. Invoice</Label>
          <p className="font-semibold mt-0.5">{invoice.invoice_number}</p>
        </div>
      </div>

      {/* Line items */}
      <div className="space-y-2">
        <Label>Rincian Tagihan</Label>
        {invoice.invoice_items.map((item, i) => (
          <div key={i} className="flex justify-between text-sm p-2 rounded bg-muted/40">
            <div>
              <span className="font-medium">{item.item_name}</span>
              <span className="text-foreground/50 ml-2">
                {item.quantity}× {fmt(item.unit_price)}
              </span>
            </div>
            <span className="font-medium">{fmt(item.quantity * item.unit_price)}</span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t pt-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-foreground/70">Subtotal</span>
          <span>{fmt(invoice.subtotal)}</span>
        </div>
        {invoice.discount_amount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Diskon</span>
            <span>−{fmt(invoice.discount_amount)}</span>
          </div>
        )}
        {invoice.tax_amount > 0 && (
          <div className="flex justify-between">
            <span>Pajak</span>
            <span>{fmt(invoice.tax_amount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
          <span>Total</span>
          <span>{fmt(invoice.total_amount)}</span>
        </div>
      </div>

      {/* Payment method */}
      <div className="space-y-1.5">
        <Label>Metode Pembayaran</Label>
        <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Tunai</SelectItem>
            <SelectItem value="card">Kartu</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
            <SelectItem value="bpjs">BPJS</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {method === "cash" && (
        <div className="space-y-1.5">
          <Label>Uang Diterima</Label>
          <Input
            type="number"
            value={cashReceived}
            onChange={(e) => setCashReceived(e.target.value)}
            placeholder="Masukkan jumlah uang tunai"
          />
          {change > 0 && (
            <p className="text-green-600 font-semibold text-sm">Kembalian: {fmt(change)}</p>
          )}
        </div>
      )}

      {method === "bpjs" && (
        <Alert>
          <AlertDescription>
            Klaim BPJS akan diproses terpisah. Status akan menjadi &quot;BPJS Pending&quot;.
          </AlertDescription>
        </Alert>
      )}

      {displayError && (
        <Alert variant="destructive">
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
          Batal
        </Button>
        <Button
          className="flex-1 bg-green-600 hover:bg-green-700"
          onClick={handlePay}
          disabled={loading}
        >
          {loading
            ? "Memproses..."
            : method === "bpjs"
            ? "Kirim Klaim BPJS"
            : "Proses Pembayaran"}
        </Button>
      </div>
    </div>
  )
}
