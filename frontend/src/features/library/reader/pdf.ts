/**
 * pdf.js for the book reader — loaded only with the reader chunk. Pages
 * are rendered once per size into an off-screen canvas and kept in a small
 * cache, so turning back and forth (and the page-turn animation, which
 * shows the same pages twice) doesn't re-render them.
 */
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

export type { PDFDocumentProxy }

/** Opens a PDF with range requests (nginx serves /media with them), so a
 * 70 MB textbook shows its first pages without downloading everything.
 * isEvalSupported:false keeps it inside the site's script-src 'self' CSP.
 *
 * Each book gets its own worker, ended by close(): a shared one would be
 * half-destroyed if the reader closes and reopens quickly. The worker is
 * bundled by Vite as a plain .js asset — nginx may not know the .mjs MIME
 * type, and module workers refuse anything that isn't JavaScript. */
export function openPdf(url: string, onProgress: (fraction: number) => void) {
  const port = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' })
  // pdf.js 4.10's generated typings declare `port` as null-only; a Worker is what it takes.
  const worker = new pdfjs.PDFWorker({ port } as unknown as ConstructorParameters<typeof pdfjs.PDFWorker>[0])
  const task = pdfjs.getDocument({ url, worker, isEvalSupported: false, disableAutoFetch: true, rangeChunkSize: 262144 })
  task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
    if (total) onProgress(Math.min(1, loaded / total))
  }
  const close = () => {
    void task.destroy().catch(() => {}).finally(() => {
      worker.destroy()
      port.terminate()
    })
  }
  return { promise: task.promise, close }
}

const MAX_PAGES = 12
const MAX_PIXELS_WIDE = 2600
const cache = new Map<string, HTMLCanvasElement>()
const inflight = new Map<string, Promise<HTMLCanvasElement>>()

function pixelRatio() {
  return Math.min(2, (window.devicePixelRatio || 1) * 1.1)
}

function keyOf(doc: PDFDocumentProxy, pageNo: number, cssWidth: number) {
  const w = Math.min(MAX_PIXELS_WIDE, Math.round(cssWidth * pixelRatio()))
  return { key: `${doc.fingerprints[0]}:${pageNo}@${w}`, w }
}

/** The rendered page if it's already in the cache (drawn synchronously, so
 * a page doesn't blink white when the turning leaf hands it over). */
export function peekPage(doc: PDFDocumentProxy, pageNo: number, cssWidth: number) {
  return cache.get(keyOf(doc, pageNo, cssWidth).key) ?? null
}

export function renderPage(doc: PDFDocumentProxy, pageNo: number, cssWidth: number): Promise<HTMLCanvasElement> {
  const { key, w } = keyOf(doc, pageNo, cssWidth)
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return Promise.resolve(hit)
  }
  const running = inflight.get(key)
  if (running) return running
  const job = (async () => {
    const page = await doc.getPage(pageNo)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: w / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('no 2d context')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    cache.set(key, canvas)
    while (cache.size > MAX_PAGES) cache.delete(cache.keys().next().value as string)
    return canvas
  })().finally(() => inflight.delete(key))
  inflight.set(key, job)
  return job
}

export function clearPageCache() {
  cache.clear()
}
