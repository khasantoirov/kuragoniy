/** Minimal CSV export (Excel-friendly: UTF-8 BOM, semicolon separator,
 * which is what Excel expects in uz/ru locales). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    // Neutralise spreadsheet formula injection ("=HYPERLINK(...)" in a name).
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const body = [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 500)
}
