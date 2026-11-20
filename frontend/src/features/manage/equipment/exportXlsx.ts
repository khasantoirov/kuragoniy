/* "Jihozlar jadvali" as an .xlsx — the layout of the school's own
   Amaliy_fizika_7_8_9_sinflar workbook: an "Umumiy" summary sheet and one
   sheet per grade. Prices, quantities and totals are real formulas
   (later uses of an equipment take their price from its first-use row,
   totals are SUM/SUMIF), so the file keeps working when edited in Excel.
   ExcelJS is loaded only when the button is pressed. */
import type { Borders, Cell, Fill, Worksheet } from 'exceljs'

import {
  analyse, firstUse, GRADES, isFirstUse, kindOf, KINDS, lessonCost, otherTopics, priceOf, rowCost, topicLabel,
  type Kind, type RegExperiment, type RegItem, type RegLesson, type Registry,
} from './registry'

const BLUE = 'FF4A86E8'
const HEAD = 'FFA4C2F4'
const GREEN = 'FF34A853'
const KIND_STYLE: Record<Kind, { fill: string; font: string }> = {
  birlamchi: { fill: 'FFD9EAD3', font: 'FF38761D' },
  ikkilamchi: { fill: 'FFFFF2CC', font: 'FFB45F06' },
  uchlamchi: { fill: 'FFF4CCCC', font: 'FF990000' },
}
const LINE = { style: 'thin' as const, color: { argb: 'FFB7B7B7' } }
const BORDER: Partial<Borders> = { top: LINE, left: LINE, bottom: LINE, right: LINE }
const MONEY = '#,##0" so\'m"'
const FIRST_ROW = 3
const sheetOf = (grade: number) => `${grade}-sinf`
const at = (sheet: string, cell: string) => `'${sheet}'!${cell}`
const kindLabel = (k: Kind) => KINDS.find((x) => x.id === k)!.label
const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

type Row = { lesson: RegLesson; experiment?: RegExperiment; expNo?: number; item?: RegItem }
type Where = { sheet: string; row: number }

/** Rows of every grade sheet, laid out before writing so formulas can
 * point at cells on other sheets. */
function plan(reg: Registry) {
  const rows = new Map<number, Row[]>()
  const itemAt = new Map<number, Where>()
  const lessonAt = new Map<number, { sheet: string; start: number; end: number }>()
  for (const grade of GRADES) {
    const list: Row[] = []
    for (const lesson of reg.lessons.filter((l) => l.grade === grade)) {
      const start = FIRST_ROW + list.length
      if (!lesson.experiments.length) list.push({ lesson })
      lesson.experiments.forEach((experiment, i) => {
        if (!experiment.items.length) list.push({ lesson, experiment, expNo: i + 1 })
        for (const item of experiment.items) {
          itemAt.set(item.id, { sheet: sheetOf(grade), row: FIRST_ROW + list.length })
          list.push({ lesson, experiment, expNo: i + 1, item })
        }
      })
      lessonAt.set(lesson.id, { sheet: sheetOf(grade), start, end: FIRST_ROW + list.length - 1 })
    }
    rows.set(grade, list)
  }
  return { rows, itemAt, lessonAt }
}

/** Catalogue photos, shrunk to a thumbnail JPEG (ExcelJS takes png/jpeg only). */
async function loadImages(reg: Registry, keys: Set<string>) {
  const out = new Map<string, ArrayBuffer>()
  for (const key of keys) {
    const url = reg.catalog[key]?.image
    if (!url) continue
    try {
      const u = new URL(url, window.location.href)
      const src = u.pathname.startsWith('/media/') ? u.pathname : u.href
      const blob = await (await fetch(src)).blob()
      const bmp = await createImageBitmap(blob)
      const k = Math.min(1, 240 / Math.max(bmp.width, bmp.height))
      const cv = document.createElement('canvas')
      cv.width = Math.max(1, Math.round(bmp.width * k))
      cv.height = Math.max(1, Math.round(bmp.height * k))
      const ctx = cv.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.drawImage(bmp, 0, 0, cv.width, cv.height)
      bmp.close()
      const jpg = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', 0.85))
      if (jpg) out.set(key, await jpg.arrayBuffer())
    } catch {
      // a photo that can't be read is left out of the file
    }
  }
  return out
}

function box(cell: Cell, opts: { bold?: boolean; center?: boolean; wrap?: boolean } = {}) {
  cell.border = BORDER
  cell.alignment = { vertical: 'middle', horizontal: opts.center ? 'center' : 'left', wrapText: opts.wrap ?? true }
  if (opts.bold) cell.font = { ...(cell.font ?? {}), bold: true }
}

function title(ws: Worksheet, range: string, text: string) {
  ws.mergeCells(range)
  const c = ws.getCell(range.split(':')[0])
  c.value = text
  c.font = { name: 'Times New Roman', size: 18, color: { argb: 'FFFFFFFF' } }
  c.fill = solid(BLUE)
  c.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(1).height = 34
}

function header(ws: Worksheet, rowNo: number, labels: string[], fill = HEAD, color = 'FF000000') {
  const row = ws.getRow(rowNo)
  labels.forEach((l, i) => {
    const c = row.getCell(i + 1)
    c.value = l
    c.fill = solid(fill)
    c.font = { name: 'Times New Roman', bold: true, size: 12, color: { argb: color } }
    box(c, { center: true })
  })
  row.height = 36
}

export async function exportRegistryXlsx(reg: Registry) {
  const mod = await import('exceljs')
  const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Amaliy Fizika'
  wb.created = new Date()

  const an = analyse(reg)
  const { rows, itemAt, lessonAt } = plan(reg)
  const usedKeys = new Set(reg.lessons.flatMap((l) => l.experiments.flatMap((e) => e.items.map((i) => i.key))))
  const images = await loadImages(reg, usedKeys)
  const imageIds = new Map<string, number>()
  for (const [key, buf] of images) imageIds.set(key, wb.addImage({ buffer: buf, extension: 'jpeg' }))

  const summary = wb.addWorksheet('Umumiy', { views: [{ state: 'frozen', ySplit: 2 }] })
  const totals = new Map<number, { total: string; kind: Record<Kind, string> }>()

  // ── grade sheets ──────────────────────────────────────────
  for (const grade of GRADES) {
    const name = sheetOf(grade)
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 2 }] })
    ws.columns = [7, 24, 36, 13, 28, 14, 30, 10, 15, 17, 46].map((width) => ({ width }))
    title(ws, 'A1:K1', name)
    header(ws, 2, ['Hafta', 'Mavzular', 'Tajriba nomi va tavsifi', 'Rasmlari', 'Kerakli jihozlar nomlari', 'Jihoz turi',
      'Yasash uchun kerakli jihozlar', 'Miqdori', 'Narxi (1 dona)', 'Jami narxi', 'Yana qaysi mavzuga ishlatiladi?'])
    ws.autoFilter = 'A2:K2'

    const list = rows.get(grade)!
    const last = FIRST_ROW + Math.max(list.length, 1) - 1
    list.forEach((p, idx) => {
      const r = FIRST_ROW + idx
      const row = ws.getRow(r)
      for (let col = 1; col <= 11; col++) box(row.getCell(col))
      const range = lessonAt.get(p.lesson.id)!
      if (range.start === r) {
        row.getCell(1).value = p.lesson.hafta
        row.getCell(2).value = p.lesson.title
        box(row.getCell(1), { center: true, bold: true })
        box(row.getCell(2), { center: true, bold: true })
        if (range.end > r) {
          ws.mergeCells(r, 1, range.end, 1)
          ws.mergeCells(r, 2, range.end, 2)
        }
      }
      const prev = list[idx - 1]
      if (p.experiment && (!prev || prev.experiment?.id !== p.experiment.id)) {
        const n = p.experiment.items.length || 1
        const c = row.getCell(3)
        c.value = `${p.expNo}-tajriba. ${p.experiment.name}${p.experiment.desc ? `\n${p.experiment.desc}` : ''}`
        box(c, { center: true })
        if (n > 1) ws.mergeCells(r, 3, r + n - 1, 3)
      }
      const item = p.item
      if (!item) return
      const kind = kindOf(reg, item.key)
      const cat = reg.catalog[item.key]
      const style = KIND_STYLE[kind]
      const eCell = row.getCell(5)
      eCell.value = item.name
      eCell.fill = solid(style.fill)
      eCell.font = { color: { argb: style.font } }
      box(eCell, { center: true })
      const fCell = row.getCell(6)
      fCell.value = kindLabel(kind)
      fCell.fill = solid(style.fill)
      fCell.font = { bold: true, color: { argb: style.font } }
      fCell.dataValidation = { type: 'list', allowBlank: false, formulae: ['"Birlamchi,Ikkilamchi,Uchlamchi"'] }
      box(fCell, { center: true })
      row.getCell(7).value = cat?.build_materials || null
      box(row.getCell(7), { center: true })
      row.getCell(8).value = item.quantity
      box(row.getCell(8), { center: true })

      const iCell = row.getCell(9)
      const jCell = row.getCell(10)
      iCell.numFmt = MONEY
      jCell.numFmt = MONEY
      const price = priceOf(reg, item.key)
      if (isFirstUse(an, item)) {
        iCell.value = price
        const refs = (an.uses.get(item.key) ?? []).map((u) => {
          const w = itemAt.get(u.item.id)!
          return w.sheet === name ? `H${w.row}` : at(w.sheet, `H${w.row}`)
        })
        const qty = refs.length <= 200 ? `MAX(${refs.join(',')})` : String(an.maxQty.get(item.key) ?? item.quantity)
        const cost = rowCost(reg, an, item)
        jCell.value = { formula: `IF(I${r}="","",I${r}*${qty})`, result: price === null ? '' : cost }
      } else {
        const first = firstUse(an, item.key)!
        const w = itemAt.get(first.item.id)!
        const src = w.sheet === name ? `I${w.row}` : at(w.sheet, `I${w.row}`)
        iCell.value = { formula: `IF(${src}="","",${src})`, result: price ?? '' }
        jCell.value = `↑ ${first.lesson.grade}-sinf, ${first.lesson.hafta}-hafta`
        jCell.font = { italic: true, color: { argb: 'FF808080' } }
      }
      box(iCell, { center: true })
      box(jCell, { center: true })

      const others = otherTopics(an, item, p.lesson)
      if (others.length) {
        const target = lessonAt.get(others[0].id)!
        const kCell = row.getCell(11)
        kCell.value = { text: others.map((l) => `→ ${topicLabel(l)}`).join('\n'), hyperlink: `#${at(target.sheet, `A${target.start}`)}` }
        kCell.font = { color: { argb: 'FF1155CC' }, underline: true, size: 10 }
        box(kCell)
      }
      const imgId = imageIds.get(item.key)
      if (imgId !== undefined) {
        ws.addImage(imgId, { tl: { col: 3.08, row: r - 1 + 0.08 }, ext: { width: 80, height: 56 }, editAs: 'oneCell' })
        row.height = Math.max(row.height ?? 0, 48)
      }
    })

    // the kind colours follow the "Jihoz turi" cell when it's changed in Excel
    KINDS.forEach(({ id, label }) => {
      ws.addConditionalFormatting({
        ref: `E${FIRST_ROW}:F${last}`,
        rules: [{
          type: 'expression', priority: 1, formulae: [`$F${FIRST_ROW}="${label}"`],
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: KIND_STYLE[id].fill } }, font: { color: { argb: KIND_STYLE[id].font } } },
        }],
      })
    })

    // totals under the table
    const t = last + 2
    const sumRow = ws.getRow(t)
    sumRow.getCell(9).value = 'Jami narx:'
    sumRow.getCell(9).font = { bold: true }
    sumRow.getCell(9).alignment = { horizontal: 'right' }
    const gs = list.reduce((s, p) => s + (p.item ? rowCost(reg, an, p.item) : 0), 0)
    sumRow.getCell(10).value = { formula: `SUM(J${FIRST_ROW}:J${last})`, result: gs }
    sumRow.getCell(10).numFmt = MONEY
    sumRow.getCell(10).font = { bold: true }
    box(sumRow.getCell(10), { center: true })
    const kindCells = {} as Record<Kind, string>
    KINDS.forEach(({ id, label }, i) => {
      const row = ws.getRow(t + 1 + i)
      row.getCell(9).value = `${label}:`
      row.getCell(9).alignment = { horizontal: 'right' }
      row.getCell(9).font = { color: { argb: KIND_STYLE[id].font } }
      const res = list.reduce((s, p) => s + (p.item && kindOf(reg, p.item.key) === id ? rowCost(reg, an, p.item) : 0), 0)
      const c = row.getCell(10)
      c.value = { formula: `SUMIF(F${FIRST_ROW}:F${last},"${label}",J${FIRST_ROW}:J${last})`, result: res }
      c.numFmt = MONEY
      c.fill = solid(KIND_STYLE[id].fill)
      box(c, { center: true })
      kindCells[id] = at(name, `J${t + 1 + i}`)
    })
    totals.set(grade, { total: at(name, `J${t}`), kind: kindCells })
  }

  // ── Umumiy ────────────────────────────────────────────────
  const ws = summary
  ws.columns = [10, 11, 62, 18, 14, 16, 16, 16].map((width) => ({ width }))
  title(ws, 'A1:H1', 'Amaliy Fizika — Muhandis_D')
  header(ws, 2, ['Sinf', 'Mavzular soni', 'Tajribalar soni', 'Jami narx', "Listga o'tish", 'Birlamchi narxi', 'Ikkilamchi narxi', 'Uchlamchi narxi'])
  GRADES.forEach((grade, i) => {
    const r = 3 + i
    const row = ws.getRow(r)
    const lessons = reg.lessons.filter((l) => l.grade === grade)
    const sumOf = (pred: (k: Kind) => boolean) =>
      lessons.reduce((s, l) => s + l.experiments.reduce((s2, e) => s2 + e.items.reduce((s3, it) => s3 + (pred(kindOf(reg, it.key)) ? rowCost(reg, an, it) : 0), 0), 0), 0)
    const tot = totals.get(grade)!
    row.getCell(1).value = sheetOf(grade)
    row.getCell(2).value = lessons.length
    row.getCell(3).value = lessons.reduce((s, l) => s + l.experiments.length, 0)
    row.getCell(4).value = { formula: tot.total, result: sumOf(() => true) }
    row.getCell(5).value = { text: `→ ${sheetOf(grade)}`, hyperlink: `#${at(sheetOf(grade), 'A1')}` }
    row.getCell(5).font = { color: { argb: 'FF1155CC' }, underline: true }
    KINDS.forEach(({ id }, k) => {
      const c = row.getCell(6 + k)
      c.value = { formula: tot.kind[id], result: sumOf((x) => x === id) }
      c.fill = solid(KIND_STYLE[id].fill)
    })
    for (let col = 1; col <= 8; col++) {
      box(row.getCell(col), { center: true })
      if (col === 4 || col >= 6) row.getCell(col).numFmt = MONEY
    }
    row.getCell(4).font = { color: { argb: 'FF38761D' } }
  })
  const jr = ws.getRow(6)
  ws.mergeCells('A6:C6')
  jr.getCell(1).value = 'Jami:'
  jr.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' }
  jr.getCell(1).font = { bold: true }
  for (const col of [4, 6, 7, 8]) {
    const letter = String.fromCharCode(64 + col)
    const c = jr.getCell(col)
    c.value = { formula: `SUM(${letter}3:${letter}5)` }
    c.numFmt = MONEY
    c.font = { bold: true }
    box(c, { center: true })
  }
  box(jr.getCell(1))
  box(jr.getCell(5))
  ws.mergeCells('A7:H7')
  const note = ws.getCell('A7')
  note.value = "Har bir jihoz birinchi marta ishlatilgan joyida hisoblanadi: narxi × eng ko'p kerak bo'lgan miqdor. Keyingi mavzularda u qayta sotib olinmaydi (↑ belgisi bilan ko'rsatilgan)."
  note.font = { italic: true, size: 10, color: { argb: 'FF666666' } }
  note.alignment = { wrapText: true, vertical: 'middle' }
  ws.getRow(7).height = 30

  header(ws, 10, ['Sinf', 'Hafta', 'Mavzu', 'Tajribalar soni', 'Mavzu jami narxi'], GREEN, 'FFFFFFFF')
  ws.getRow(10).height = 22
  let r = 11
  for (const lesson of reg.lessons) {
    const row = ws.getRow(r++)
    const range = lessonAt.get(lesson.id)!
    row.getCell(1).value = sheetOf(lesson.grade)
    row.getCell(2).value = lesson.hafta
    row.getCell(3).value = { text: lesson.title, hyperlink: `#${at(range.sheet, `A${range.start}`)}` }
    row.getCell(3).font = { color: { argb: 'FF1155CC' }, underline: true }
    row.getCell(4).value = lesson.experiments.length
    const cost = lessonCost(reg, an, lesson)
    row.getCell(5).value = { formula: `SUM(${at(range.sheet, `J${range.start}:J${range.end}`)})`, result: cost }
    row.getCell(5).numFmt = MONEY
    for (let col = 1; col <= 5; col++) box(row.getCell(col), { center: col !== 3, wrap: col === 3 })
  }

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'Amaliy_fizika_7_8_9_sinflar.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
