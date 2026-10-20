/** A cover from a PDF's first page — loaded on demand (pulls in pdf.js). */
import { canvasToFile, fitToCanvas } from '../cover'

import { openPdf } from './pdf'

export async function pdfCover(src: string | File): Promise<File> {
  const book = openPdf(typeof src === 'string' ? src : new Uint8Array(await src.arrayBuffer()), () => {})
  try {
    const doc = await book.promise
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: 900 / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('no 2d context')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    return await canvasToFile(fitToCanvas(canvas, canvas.width, canvas.height), 'cover.jpg')
  } finally {
    book.close()
  }
}
