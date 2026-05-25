import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

export interface PoItem {
    id: string
    medication_id: string
    quantity_ordered: number
    unit_price: number
    subtotal: number
    quantity_received: number
    received_date: string | null
    expiry_date: string | null
    batch_number: string | null
    is_fully_received: boolean
    medications: {
        id: string
        name: string
        generic_name: string | null
        form: string | null
        strength: string | null
        unit: string | null
    }
}

export interface PurchaseOrder {
    id: string
    po_number: string
    order_date: string
    expected_delivery_date: string | null
    status: 'po_draft' | 'po_sent' | 'po_partially_received' | 'po_completed' | 'po_cancelled'
    total_amount: number
    notes: string | null
    rejection_reason: string | null
    approved_at: string | null
    created_at: string
    vendors: {
        id: string
        name: string
        contact_person: string | null
        phone: string | null
        email: string | null
    }
    purchase_order_items: PoItem[]
}

export interface CreatePoInput {
    vendor_id: string
    order_date: string
    expected_delivery_date?: string | null
    notes?: string | null
    items: { medication_id: string; quantity_ordered: number; unit_price: number }[]
}

export interface ReceiveItemInput {
    item_id: string
    quantity_received: number
    expiry_date?: string | null
    batch_number?: string | null
}

export function usePurchaseOrders(statusFilter: string = '') {
    const [data, setData] = useState<PurchaseOrder[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)

    const fetch_ = useCallback(async () => {
        setLoading(true)
        try {
            const params = statusFilter ? `?status=${statusFilter}` : ''
            const res = await fetch(`/api/pharmacist/po${params}`)
            const json = await res.json()
            if (json.success) setData(json.data ?? [])
        } catch {
            toast.error('Gagal memuat purchase order')
        } finally {
            setLoading(false)
        }
    }, [statusFilter])

    useEffect(() => { fetch_() }, [fetch_])

    const createPo = useCallback(async (input: CreatePoInput): Promise<string | null> => {
        setActionLoading(true)
        try {
            const res = await fetch('/api/pharmacist/po', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            })
            const json = await res.json()
            if (json.success) {
                toast.success(`PO ${json.data.po_number} berhasil dibuat`)
                await fetch_()
                return json.data.id
            }
            toast.error(json.error ?? 'Gagal membuat PO')
            return null
        } catch {
            toast.error('Terjadi kesalahan')
            return null
        } finally {
            setActionLoading(false)
        }
    }, [fetch_])

    const sendPo = useCallback(async (id: string): Promise<boolean> => {
        setActionLoading(true)
        try {
            const res = await fetch(`/api/pharmacist/po/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'send' }),
            })
            const json = await res.json()
            if (json.success) {
                toast.success('PO berhasil dikirim ke owner untuk disetujui')
                await fetch_()
                return true
            }
            toast.error(json.error ?? 'Gagal mengirim PO')
            return false
        } catch {
            toast.error('Terjadi kesalahan')
            return false
        } finally {
            setActionLoading(false)
        }
    }, [fetch_])

    const receiveItems = useCallback(async (
        id: string,
        items: ReceiveItemInput[]
    ): Promise<{ success: boolean; allReceived?: boolean }> => {
        setActionLoading(true)
        try {
            const res = await fetch(`/api/pharmacist/po/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'receive', items }),
            })
            const json = await res.json()
            if (json.success) {
                const allReceived = json.data?.all_received ?? false
                toast.success(allReceived
                    ? 'Semua item diterima — PO selesai!'
                    : 'Penerimaan sebagian berhasil dicatat')
                await fetch_()
                return { success: true, allReceived }
            }
            toast.error(json.error ?? 'Gagal mencatat penerimaan')
            return { success: false }
        } catch {
            toast.error('Terjadi kesalahan')
            return { success: false }
        } finally {
            setActionLoading(false)
        }
    }, [fetch_])

    return { data, loading, actionLoading, refresh: fetch_, createPo, sendPo, receiveItems }
}
