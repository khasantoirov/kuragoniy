/**
 * Client-side PDF export, porting js/download.js's tablePdf() — same
 * jsPDF/jspdf-autotable stack, but as real npm dependencies (bundled and
 * code-split by Vite) instead of the old esm.sh CDN dynamic import.
 */
export async function tablePdf(
  title: string,
  head: string[],
  rows: (string | number)[][],
  opts: { orientation?: 'portrait' | 'landscape' } = {},
) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: opts.orientation ?? 'portrait' })
  doc.setFontSize(14)
  doc.text(title, 14, 16)

  autoTable(doc, {
    head: [head],
    body: rows,
    startY: 22,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [31, 111, 235] },
  })

  const stamp = new Date().toLocaleDateString('uz-UZ')
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.text(`Amaliy Fizika · ${stamp}`, 14, doc.internal.pageSize.getHeight() - 8)
  }

  doc.save(`${title}.pdf`)
}
