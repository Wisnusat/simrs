import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { usePolling } from "@/hooks/use-polling"
import { useRealtimeSync } from "@/hooks/use-realtime-sync"

export function useAdmissionRequestCount() {
  const [count, setCount] = useState(0)

  const fetchCount = useCallback(async () => {
    const supabase = createClient()
    const { count: c } = await supabase
      .from("episodes_of_care")
      .select("*", { count: "exact", head: true })
      .is("room_location_id", null)
    setCount(c ?? 0)
  }, [])

  useEffect(() => { fetchCount() }, [fetchCount])
  useRealtimeSync({ table: "episodes_of_care", onchange: fetchCount })
  usePolling(fetchCount, 60_000)

  return count
}
