import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { usePolling } from "@/hooks/use-polling"
import { useRealtimeSync } from "@/hooks/use-realtime-sync"

/**
 * Lightweight hook — only fetches a COUNT from surgery_requests.
 * No row data fetched. Used for sidebar badge notifications.
 */
export function useSurgeryCount(status = "surgery_requested") {
  const [count, setCount] = useState(0)

  const fetchCount = useCallback(async () => {
    const supabase = createClient()
    const { count: c } = await supabase
      .from("surgery_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", status)
    setCount(c ?? 0)
  }, [status])

  useEffect(() => { fetchCount() }, [fetchCount])
  useRealtimeSync({ table: "surgery_requests", onchange: fetchCount })
  usePolling(fetchCount, 60_000)

  return count
}
