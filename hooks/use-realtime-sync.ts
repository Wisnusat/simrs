import { useEffect } from 'react'
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
 * Channel is recreated whenever table, filter, or enabled changes.
 */
export function useRealtimeSync({ table, filter, onchange, enabled = true }: UseRealtimeSyncOptions) {
  useEffect(() => {
    if (!enabled) return

    const supabase = createClient()
    const channelId = filter ? `${table}:${filter}` : table

    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        onchange,
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [table, filter, onchange, enabled])
}
