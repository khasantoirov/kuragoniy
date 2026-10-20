/** Covers are stored small: the client shrinks the picture before upload
 * (the VPS disk is tight and a shelf of phone photos would be megabytes). */
const MAX_W = 600
const MAX_H = 860

export function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], name, { type: 'image/jpeg' })) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.86,
    )
  })
}

/** Draws `source` (w×h) onto a white canvas no bigger than the cover size. */
export function fitToCanvas(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const k = Math.min(1, MAX_W / w, MAX_H / h)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * k))
  canvas.height = Math.max(1, Math.round(h * k))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** A picked image, shrunk to cover size as a JPEG. */
export async function shrinkImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    return await canvasToFile(fitToCanvas(bitmap, bitmap.width, bitmap.height), 'cover.jpg')
  } finally {
    bitmap.close()
  }
}

/** Our own uploads may come back with another host name (or http behind
 * the proxy), so any /media/ URL is used by its path. */
export function mediaSrc(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url, window.location.href)
    return u.pathname.startsWith('/media/') ? u.pathname : u.href
  } catch {
    return null
  }
}

/** A small picture as a data: URL, for the editor's preview (no object URL
 * to revoke). */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
