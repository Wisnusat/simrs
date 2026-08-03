/**
 * hooks/outpatient/use-invoices.ts
 *
 * Invoice list + payment + cancellation for the cashier dashboard.
 */

import { useCallback, useEffect, useState } from "react"
import { getInvoices, payInvoice, cancelInvoice } from "@/lib/api/client"
import { usePolling } from "@/hooks/use-polling"
import { useRealtimeSync } from "@/hooks/use-realtime-sync"
import type { Invoice, InvoiceStatus, PaymentMethod } from "@/lib/types/outpatient"

interface UseInvoicesOptions {
  status?: InvoiceStatus | "all"
  today?: boolean
  fallbackPollMs?: number
}

export function useInvoices(opts: UseInvoicesOptions = {}) {
  const { status, today, fallbackPollMs = 60_000 } = opts

  const [data, setData] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await getInvoices({ status, today })
      setData(Array.isArray(result) ? result : [result])
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat invoice")
    } finally {
      setLoading(false)
    }
  }, [status, today])

  useEffect(() => { refresh() }, [refresh])

  useRealtimeSync({ table: 'invoices', onchange: refresh })

  usePolling(refresh, fallbackPollMs)

  const pay = useCallback(
    async (
      invoiceId: string,
      method: PaymentMethod,
      paidAmount?: number,
    ): Promise<boolean> => {
      setActionLoading(true)
      setError(null)
      try {
        await payInvoice(invoiceId, { payment_method: method, paid_amount: paidAmount })
        await refresh()
        return true
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal memproses pembayaran")
        return false
      } finally {
        setActionLoading(false)
      }
    },
    [refresh],
  )

  const cancel = useCallback(
    async (invoiceId: string): Promise<boolean> => {
      setActionLoading(true)
      setError(null)
      try {
        await cancelInvoice(invoiceId)
        await refresh()
        return true
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal membatalkan invoice")
        return false
      } finally {
        setActionLoading(false)
      }
    },
    [refresh],
  )

  const paid = data.filter((inv) => inv.status === "paid")
  const stats = {
    total: data.length,
    pending: data.filter((inv) => inv.status === "unpaid").length,
    paidToday: paid.length,
    totalRevenue: paid.reduce((sum, inv) => sum + inv.total_amount, 0),
  }

  return { data, loading, error, actionLoading, refresh, pay, cancel, stats }
}
