/**
 * Client-side PDF export, porting js/download.js's tablePdf() — same
 * jsPDF/jspdf-autotable stack, but as real npm dependencies (bundled and
 * code-split by Vite) instead of the old esm.sh CDN dynamic import.
 */

export type PdfCell = string | number | { image: string; aspect?: number }

const IMAGE_CELL_PAD_MM = 1.5

function isImageCell(cell: PdfCell): cell is { image: string; aspect?: number } {
  return typeof cell === 'object' && cell !== null && 'image' in cell
}

export async function tablePdf(
  title: string,
  head: string[],
  rows: PdfCell[][],
  opts: { orientation?: 'portrait' | 'landscape'; imageSizeMm?: number } = {},
) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const imageSize = opts.imageSizeMm ?? 16
  const doc = new jsPDF({ orientation: opts.orientation ?? 'portrait' })
  doc.setFontSize(14)
  doc.text(title, 14, 16)

  // Image cells carry their real content in didDrawCell (jsPDF can't put an
  // <img> in a text cell) — the body only gets a blank placeholder so
  // autoTable still reserves the right-sized box for it.
  const body = rows.map((r) => r.map((c) => (isImageCell(c) ? '' : c)))
  const hasImageCol = rows.some((r) => r.some(isImageCell))

  autoTable(doc, {
    head: [head],
    body,
    startY: 22,
    styles: { fontSize: 9, minCellHeight: hasImageCol ? imageSize + IMAGE_CELL_PAD_MM * 2 : undefined },
    headStyles: { fillColor: [31, 111, 235] },
    didDrawCell: (data) => {
      if (data.section !== 'body') return
      const cell = rows[data.row.index]?.[data.column.index]
      if (cell && isImageCell(cell)) {
        // Fit within the cell's box without distorting non-square photos
        // (equipment photos are rarely square) — "contain" sizing from the
        // natural aspect ratio measured when the file was loaded.
        const aspect = cell.aspect ?? 1
        const w = aspect >= 1 ? imageSize : imageSize * aspect
        const h = aspect >= 1 ? imageSize / aspect : imageSize
        try {
          doc.addImage(
            cell.image,
            data.cell.x + IMAGE_CELL_PAD_MM + (imageSize - w) / 2,
            data.cell.y + IMAGE_CELL_PAD_MM + (imageSize - h) / 2,
            w,
            h,
          )
        } catch {
          // A malformed/unsupported data URL shouldn't abort the whole
          // export — the row's other columns still matter.
        }
      }
    },
  })

  const stamp = new Date().toLocaleDateString('uz-UZ')
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.text(`KO'RAGONIY EDU · ${stamp}`, 14, doc.internal.pageSize.getHeight() - 8)
  }

  doc.save(`${title}.pdf`)
}
