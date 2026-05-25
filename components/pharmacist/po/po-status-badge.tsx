import { Badge } from '@/components/ui/badge'
import type { PurchaseOrder } from '@/hooks/pharmacist/use-purchase-orders'

export const PO_STATUS_CONFIG = {
    po_draft:             { label: 'Draft',              className: 'text-amber-600 border-amber-300',        variant: 'outline' as const },
    po_sent:              { label: 'Terkirim',           className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',    variant: 'default' as const },
    po_partially_received:{ label: 'Sebagian Diterima',  className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', variant: 'default' as const },
    po_completed:         { label: 'Selesai',            className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200', variant: 'default' as const },
    po_cancelled:         { label: 'Dibatalkan',         className: '',                                       variant: 'destructive' as const },
} satisfies Record<string, { label: string; className: string; variant: 'outline' | 'default' | 'destructive' }>

interface PoStatusBadgeProps {
    status: PurchaseOrder['status']
}

export function PoStatusBadge({ status }: PoStatusBadgeProps) {
    const config = PO_STATUS_CONFIG[status] ?? { label: status, className: '', variant: 'outline' as const }
    return (
        <Badge variant={config.variant} className={config.className}>
            {config.label}
        </Badge>
    )
}

export function formatRupiah(n: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(n)
}
