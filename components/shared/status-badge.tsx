/**
 * components/shared/status-badge.tsx
 *
 * Centralised status → Badge mapping for queue, encounter, prescription,
 * lab order, and invoice statuses. Single source of truth for label + variant.
 */
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Clock, AlertCircle, XCircle } from "lucide-react"

type AnyStatus =
  | "waiting" | "called" | "in_service" | "done" | "skipped"          // queue
  | "planned" | "arrived" | "in_progress" | "waiting_lab" | "admitted" | "finished" | "cancelled"   // encounter
  | "admitted" | "in_care" | "discharge_approved" | "discharged" | "bpjs_finalized" // inpatient
  | "active" | "completed"                                               // prescription
  | "lab_ordered" | "sample_taken" | "processing" | "result_uploaded" | "verified" // lab
  | "unpaid" | "paid" | "bpjs_claim_pending"                            // invoice
  | string                                                               // fallback

interface Config {
  label: string
  variant: "default" | "secondary" | "outline" | "destructive"
  Icon?: typeof CheckCircle
}

const STATUS_MAP: Record<string, Config> = {
  // Queue
  waiting:          { label: "Menunggu",          variant: "outline",     Icon: Clock },
  called:           { label: "Dipanggil",          variant: "outline",     Icon: Clock },
  in_service:       { label: "Dilayani",           variant: "secondary",   Icon: Clock },
  done:             { label: "Selesai",            variant: "default",     Icon: CheckCircle },
  skipped:          { label: "Dilewati",           variant: "destructive", Icon: XCircle },

  // Encounter
  planned:          { label: "Direncanakan",       variant: "outline" },
  arrived:          { label: "Tiba",               variant: "secondary" },
  in_progress:      { label: "Berjalan",           variant: "secondary",   Icon: Clock },
  waiting_lab:      { label: "Menunggu Lab",       variant: "secondary",   Icon: Clock },
  admitted:         { label: "Rawat Inap",         variant: "secondary",   Icon: Clock },
  finished:         { label: "Selesai",            variant: "default",     Icon: CheckCircle },
  cancelled:        { label: "Dibatalkan",         variant: "destructive", Icon: XCircle },

  // Inpatient Admission
  in_care:               { label: "Dalam Perawatan",    variant: "secondary",   Icon: Clock },
  discharge_approved:    { label: "Siap Pulang",        variant: "outline",     Icon: CheckCircle },
  discharged:            { label: "Pulang",             variant: "default",     Icon: CheckCircle },
  bpjs_finalized:        { label: "BPJS Selesai",       variant: "default",     Icon: CheckCircle },

  // Prescription
  active:           { label: "Menunggu",           variant: "outline",     Icon: Clock },
  completed:        { label: "Diserahkan",         variant: "default",     Icon: CheckCircle },

  // Lab
  lab_ordered:      { label: "Menunggu Sampel",    variant: "outline",     Icon: Clock },
  sample_taken:     { label: "Sampel Diambil",     variant: "secondary" },
  processing:       { label: "Dianalisa",          variant: "secondary",   Icon: Clock },
  result_uploaded:  { label: "Hasil Diupload",     variant: "default" },
  verified:         { label: "Terverifikasi",      variant: "default",     Icon: CheckCircle },

  // Invoice
  unpaid:           { label: "Menunggu Bayar",     variant: "outline",     Icon: Clock },
  paid:             { label: "Lunas",              variant: "default",     Icon: CheckCircle },
  bpjs_claim_pending: { label: "BPJS Pending",    variant: "secondary",   Icon: AlertCircle },
}

const FALLBACK: Config = { label: "Unknown", variant: "outline" }

interface StatusBadgeProps {
  status: AnyStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, variant, Icon } = STATUS_MAP[status] ?? FALLBACK
  return (
    <Badge variant={variant} className={className}>
      {Icon && <Icon className="w-3 h-3 mr-1" />}
      {label}
    </Badge>
  )
}
