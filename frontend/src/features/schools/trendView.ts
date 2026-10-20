import { useState } from 'react'

export type TrendPeriod = 'week' | 'month' | 'quarter' | 'year'
export type ChartKind = 'bar' | 'line' | 'pie'

const PERIOD_KEY = 'af-trend-period'
const KIND_KEY = 'af-trend-kind'

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked — the choice just isn't remembered.
  }
}

/** The statistics charts' grouping and chart type, remembered in this
 * browser so every statistics page opens the way the user left it. */
export function useTrendView() {
  const [period, setPeriodState] = useState<TrendPeriod>(() => read(PERIOD_KEY, ['week', 'month', 'quarter', 'year'], 'month'))
  const [kind, setKindState] = useState<ChartKind>(() => read(KIND_KEY, ['bar', 'line', 'pie'], 'bar'))
  return {
    period,
    kind,
    setPeriod: (p: TrendPeriod) => { setPeriodState(p); write(PERIOD_KEY, p) },
    setKind: (k: ChartKind) => { setKindState(k); write(KIND_KEY, k) },
  }
}
