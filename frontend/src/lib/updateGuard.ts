import { useEffect } from 'react'

/* Screens where a reload would cost the user something that can't be
   put back — a test in progress, a live game being played or hosted —
   hold this guard while that's going on, and the automatic update
   (components/AutoUpdate) waits until they let go. */
let holders = 0

export function useUpdateGuard(active = true) {
  useEffect(() => {
    if (!active) return
    holders++
    return () => {
      holders--
    }
  }, [active])
}

export function isUpdateGuarded() {
  return holders > 0
}
