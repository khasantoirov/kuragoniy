const MAX = 128 // avatar side, px

/** Center-crops to a square and downsizes to a small JPEG File, mirroring
 * the old js/profile.js's shrink() — but returns a File (for multipart
 * upload to the real ImageField) instead of a base64 data-URL. */
export function shrinkToAvatar(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(new Error("Rasm o'qilmadi"))
    fr.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Rasm ochilmadi'))
      img.onload = () => {
        const side = Math.min(img.width, img.height)
        const sx = (img.width - side) / 2
        const sy = (img.height - side) / 2
        const canvas = document.createElement('canvas')
        canvas.width = MAX
        canvas.height = MAX
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, sx, sy, side, side, 0, 0, MAX, MAX)
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Rasm ochilmadi'))
            resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
          },
          'image/jpeg',
          0.82,
        )
      }
      img.src = fr.result as string
    }
    fr.readAsDataURL(file)
  })
}
