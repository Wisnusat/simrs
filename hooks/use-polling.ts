import { useEffect } from 'react'

/**
 * Runs fn() on a fixed interval.
 * Skips the tick when the tab is hidden; fires immediately on tab re-focus.
 */
export function usePolling(fn: () => void, intervalMs: number) {
  useEffect(() => {
    if (intervalMs <= 0) return

    const tick = () => { if (!document.hidden) fn() }
    const onVisible = () => { if (!document.hidden) fn() }

    const id = setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fn, intervalMs])
}
