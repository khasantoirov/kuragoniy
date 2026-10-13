/**
 * JPG snapshot + Excel/Word "fake" exports for tables — complements
 * lib/pdf.ts's tablePdf() (real jsPDF text table) with a visual capture
 * (JPG, via html2canvas) and lightweight Office-openable files (XLS/DOC),
 * built as HTML disguised with the right extension/mime — Excel and Word
 * both happily open an HTML table saved this way, no heavy spreadsheet/doc
 * library needed for what is essentially a read-only export.
 */

function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function tableJpg(title: string, el: HTMLElement) {
  const html2canvas = (await import('html2canvas')).default
  const canvas = await html2canvas(el, {
    backgroundColor: '#ffffff',
    scale: 2,
    onclone: (doc, cloned) => {
      // html2canvas doesn't understand writing-mode: vertical-rl (used for the
      // "Barcha o'qituvchilar" table's sticky day-name column) — it renders
      // that text upside down. Swap it for a plain rotation in the captured
      // clone only, which it handles correctly; the live page keeps the
      // writing-mode version untouched.
      doc.querySelectorAll<HTMLElement>('.tt__dayv span').forEach((span) => {
        span.style.writingMode = 'horizontal-tb'
        span.style.transform = 'translate(-50%, -50%) rotate(90deg)'
      })
      // On a narrow screen the table renders inside ScaleToFit's zoom
      // wrapper (see components/ScaleToFit.tsx) — html2canvas doesn't
      // understand the non-standard `zoom` property and mis-measures text
      // inside it, overlapping every cell's lines on top of each other.
      // Capture the table at its natural, unscaled size instead: the
      // export doesn't need to match whatever size the phone screen
      // happens to be showing.
      const scaledAncestor = cloned.closest<HTMLElement>('.scale-to-fit__inner')
      if (scaledAncestor) scaledAncestor.style.zoom = '1'
    },
  })
  triggerDownload(canvas.toDataURL('image/jpeg', 0.92), `${title}.jpg`)
}

function escapeHtml(s: string | number) {
  // \n -> <br> after escaping (never before — would double-escape the tag
  // itself) so a multi-line description still breaks onto separate lines
  // even though the base cell style is white-space:nowrap (an explicit
  // <br> still forces a break; nowrap only suppresses automatic wrapping).
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
}

export type OfficeCell = string | number | { image: string }

function isImageCell(cell: OfficeCell): cell is { image: string } {
  return typeof cell === 'object' && cell !== null && 'image' in cell
}

function officeCellHtml(c: OfficeCell, imageMaxPx: number) {
  return isImageCell(c)
    ? `<img src="${c.image}" style="max-width:${imageMaxPx}px;max-height:${imageMaxPx}px;object-fit:contain">`
    : escapeHtml(c)
}

export function tableOffice(
  title: string,
  head: string[],
  rows: OfficeCell[][],
  kind: 'xls' | 'doc',
  // columnWidths: fractions of the table width per column, e.g. [0.3, 0.7]
  // — fixed proportions with wrapping text instead of one long line per cell.
  opts: { imageMaxPx?: number; columnWidths?: number[] } = {},
) {
  const imageMaxPx = opts.imageMaxPx ?? 60
  const fixed = opts.columnWidths
  const TABLE_PX = 700 // ~A4 portrait text width; Excel only honours absolute widths
  const colgroup = fixed
    ? '<colgroup>' + fixed.map((f) => `<col width="${Math.round(TABLE_PX * f)}" style="width:${Math.round(f * 100)}%">`).join('') + '</colgroup>'
    : ''
  const tableHtml =
    `<h2>${escapeHtml(title)}</h2><table${fixed ? ` width="${TABLE_PX}" class="fixed"` : ''}>${colgroup}<thead><tr>` +
    head.map((h) => `<th>${escapeHtml(h)}</th>`).join('') +
    '</tr></thead><tbody>' +
    rows.map((r) => '<tr>' + r.map((c) => `<td${isImageCell(c) ? ' align="center"' : ''}>${officeCellHtml(c, imageMaxPx)}</td>`).join('') + '</tr>').join('') +
    '</tbody></table>'

  const mime = kind === 'xls' ? 'application/vnd.ms-excel' : 'application/msword'
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><style>
    h2 { font-family: sans-serif; text-align: center; }
    table { border-collapse: collapse; font-family: sans-serif; font-size: 12px; }
    th, td { border: 1px solid #999; padding: 4px 8px; text-align: left; white-space: nowrap; }
    th { background: #1F6FEB; color: #fff; }
    table.fixed { width: ${TABLE_PX}px; table-layout: fixed; }
    table.fixed td { white-space: pre-wrap; vertical-align: middle; word-wrap: break-word; }
  </style></head><body>${tableHtml}</body></html>`

  const blob = new Blob(['﻿', doc], { type: mime })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, `${title}.${kind}`)
  URL.revokeObjectURL(url)
}
