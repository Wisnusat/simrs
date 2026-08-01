import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UseRealtimeSyncOptions {
  table: string
  filter?: string  // Supabase filter string e.g. 'status=eq.active'
  onchange: () => void
  enabled?: boolean
}

/**
 * Subscribes to Supabase Realtime postgres_changes for a table.
 * Calls onchange() on any INSERT / UPDATE / DELETE.
 * Channel is recreated only when table, filter, or enabled changes — NOT on every
 * onchange reference change. onchange is stored in a ref so the latest version is
 * always called without triggering a channel teardown/recreate cycle (which caused
 * "cannot add postgres_changes callbacks after subscribe()" errors).
 */
export function useRealtimeSync({ table, filter, onchange, enabled = true }: UseRealtimeSyncOptions) {
  const onchangeRef = useRef(onchange)
  useEffect(() => { onchangeRef.current = onchange })

  useEffect(() => {
    if (!enabled) return

    const supabase = createClient()
    // Unique suffix prevents reusing an already-subscribed channel when
    // React strict-mode double-mounts or cleanup races with re-subscribe.
    const channelId = `${table}:${filter ?? '*'}:${Math.random().toString(36).slice(2)}`

    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => onchangeRef.current(),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [table, filter, enabled])
}
