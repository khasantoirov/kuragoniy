import { useState } from 'react'

export type Measurement = { at: number; vals: Record<string, number>; read: { label: string; val: string }[] }

const key = (simId: string) => `af-lab-notes:${simId}`

/** Measurements of one experiment, kept in this browser (a per-viewer
 * lab notebook — nothing to share or grade, so no server state). */
export function useNotebook(simId: string) {
  const [rows, setRows] = useState<Measurement[]>(() => {
    try {
      const raw = localStorage.getItem(key(simId))
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const save = (next: Measurement[]) => {
    setRows(next)
    try {
      if (next.length) localStorage.setItem(key(simId), JSON.stringify(next.slice(-200)))
      else localStorage.removeItem(key(simId))
    } catch {
      // storage full or blocked — the table still works for this visit
    }
  }
  return {
    rows,
    add: (m: Measurement) => save([...rows, m]),
    removeLast: () => save(rows.slice(0, -1)),
    clear: () => save([]),
  }
}
