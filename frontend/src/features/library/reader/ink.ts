/**
 * Pen notes drawn over book pages. Points are stored relative to the page
 * (0…1), so a drawing stays in place at any zoom, in one- or two-page view
 * and while the page turns. Kept per book in this browser only.
 */
export type Tool = 'pen' | 'marker' | 'eraser'

export interface Stroke {
  t: 'pen' | 'marker'
  c: string
  /** Line width as a fraction of the page width. */
  s: number
  /** Flat x,y pairs, each 0…1. */
  p: number[]
}

export type Ink = Record<string, Stroke[]>

export const PEN_SIZES = [2, 4, 7]
export const MARKER_SIZES = [12, 18, 26]
export const COLORS = ['#1b1f2a', '#e2465a', '#2f7bff', '#14a37f', '#f5b400', '#ffffff']

export function drawStroke(ctx: CanvasRenderingContext2D, st: Stroke, w: number, h: number) {
  if (st.p.length < 2) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = st.c
  ctx.globalAlpha = st.t === 'marker' ? 0.35 : 1
  ctx.lineWidth = Math.max(1, st.s * w)
  ctx.beginPath()
  ctx.moveTo(st.p[0] * w, st.p[1] * h)
  if (st.p.length === 2) ctx.lineTo(st.p[0] * w + 0.5, st.p[1] * h)
  for (let i = 2; i < st.p.length; i += 2) ctx.lineTo(st.p[i] * w, st.p[i + 1] * h)
  ctx.stroke()
  ctx.restore()
}

export function drawAll(canvas: HTMLCanvasElement, strokes: Stroke[], extra?: Stroke | null) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const st of strokes) drawStroke(ctx, st, canvas.width, canvas.height)
  if (extra) drawStroke(ctx, extra, canvas.width, canvas.height)
}

/** Does the eraser at (x, y) — page fractions, radius r of the page
 * width — touch this stroke? `aspect` is height / width. */
export function touches(st: Stroke, x: number, y: number, r: number, aspect: number) {
  const reach = r + st.s / 2
  for (let i = 0; i < st.p.length; i += 2) {
    const dx = st.p[i] - x
    const dy = (st.p[i + 1] - y) * aspect
    if (dx * dx + dy * dy <= reach * reach) return true
  }
  return false
}

export function loadInk(key: string): Ink {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Ink) : {}
  } catch {
    return {}
  }
}

export function saveInk(key: string, ink: Ink) {
  try {
    const pages = Object.fromEntries(Object.entries(ink).filter(([, s]) => s.length))
    if (Object.keys(pages).length) localStorage.setItem(key, JSON.stringify(pages))
    else localStorage.removeItem(key)
  } catch {
    // Storage full or blocked — the notes still last until the reader closes.
  }
}
