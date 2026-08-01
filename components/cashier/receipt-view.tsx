/**
 * components/cashier/receipt-view.tsx
 * Read-only receipt printout for a paid invoice.
 */
import { Separator } from "@/components/ui/separator"
import type { Invoice } from "@/lib/types/outpatient"

interface ReceiptViewProps {
  invoice: Invoice
}

const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`

export function ReceiptView({ invoice }: ReceiptViewProps) {
  return (
    <div className="bg-white text-black p-6 space-y-4 font-mono text-sm">
      {/* Header */}
      <div className="text-center space-y-1">
        <h2 className="text-base font-bold">BUKTI PEMBAYARAN</h2>
        <p className="text-xs text-gray-500">Klinik Harapan Bunda</p>
      </div>

      <Separator />

      {/* Meta */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-500">No. Invoice</span>
          <span className="font-semibold">{invoice.invoice_number}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Tanggal</span>
          <span>{new Date(invoice.invoice_date).toLocaleDateString("id-ID")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Pasien</span>
          <span>{invoice.patients.full_name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">No. MR</span>
          <span>{invoice.patients.medical_record_no}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Status</span>
          <span className="font-semibold">
            {invoice.status === "paid" ? "Lunas" : "BPJS Pending"}
          </span>
        </div>
      </div>

      <Separator />

      {/* Items */}
      <div className="space-y-1">
        <p className="font-semibold mb-1">Rincian:</p>
        {invoice.invoice_items.map((item, i) => (
          <div key={i} className="flex justify-between">
            <span>
              {item.item_name} ({item.quantity}×)
            </span>
            <span>{fmt(item.quantity * item.unit_price)}</span>
          </div>
        ))}
      </div>

      <Separator />

      {/* Totals */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{fmt(invoice.subtotal)}</span>
        </div>
        {invoice.discount_amount > 0 && (
          <div className="flex justify-between text-green-700">
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
        <div className="flex justify-between font-bold border-t pt-1 mt-1 text-base">
          <span>Total</span>
          <span>{fmt(invoice.total_amount)}</span>
        </div>
      </div>

      <Separator />

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 space-y-0.5">
        <p>Terima kasih atas kepercayaan Anda.</p>
        <p>Semoga lekas sembuh.</p>
        {invoice.paid_at && (
          <p>Dibayar: {new Date(invoice.paid_at).toLocaleString("id-ID")}</p>
        )}
      </div>
    </div>
  )
}
