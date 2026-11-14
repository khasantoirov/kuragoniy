/** Feed pictures are shrunk in the browser before upload (the VPS disk is
 * tight; the server caps them at 3 MB besides). */
const MAX_SIDE = 1600

export async function shrinkPicture(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const k = Math.min(1, MAX_SIDE / bitmap.width, MAX_SIDE / bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * k))
    canvas.height = Math.max(1, Math.round(bitmap.height * k))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve, reject) => canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], 'rasm.jpg', { type: 'image/jpeg' })) : reject(new Error('toBlob failed'))),
      'image/jpeg', 0.85,
    ))
  } finally {
    bitmap.close()
  }
}
