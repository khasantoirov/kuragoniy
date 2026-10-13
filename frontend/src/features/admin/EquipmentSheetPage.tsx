import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ExportMenu, type ExportFormat } from '@/components/ExportMenu'
import { useToast } from '@/components/Toast'
import { IC } from '@/icons'
import { tableJpg, tableOffice } from '@/lib/export/tableExport'
import { tablePdf } from '@/lib/pdf'

interface SheetRow {
  id: string
  imageUrl: string | null
  imageFile: File | null
  imageAspect: number
  description: string
}

const IMAGE_PX = 140 // live preview + doc/xls export size
const IMAGE_PDF_MM = 45
// Rasm / tavsif ustunlari 30/70 — ko'rinishda ham, PDF/Word/Excel'da ham.
const COLUMN_WIDTHS = [0.3, 0.7]

function emptyRow(): SheetRow {
  return { id: crypto.randomUUID(), imageUrl: null, imageFile: null, imageAspect: 1, description: '' }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function imageAspect(file: File): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 1)
    img.onerror = () => resolve(1)
    img.src = URL.createObjectURL(file)
  })
}

async function runExport(
  format: ExportFormat,
  title: string,
  captureEl: HTMLElement | null,
  head: string[],
  rows: SheetRow[],
) {
  if (format === 'jpg') {
    if (captureEl) await tableJpg(title, captureEl)
    return
  }

  // PDF/Word need each photo as a data URL up front — the live preview
  // only ever needed a blob URL (cheap, revocable), but these two
  // exporters work from a detached head/rows array, not the DOM itself.
  const cells = await Promise.all(
    rows.map(async (r) => [
      r.imageFile ? { image: await readAsDataUrl(r.imageFile), aspect: r.imageAspect } : '',
      r.description,
    ]),
  )

  if (format === 'xls' || format === 'doc') {
    tableOffice(title, head, cells, format, { imageMaxPx: IMAGE_PX, columnWidths: COLUMN_WIDTHS })
    return
  }
  await tablePdf(title, head, cells, {
    orientation: format === 'pdf-portrait' ? 'portrait' : 'landscape',
    imageSizeMm: IMAGE_PDF_MM,
    columnWidths: COLUMN_WIDTHS,
  })
}

export function EquipmentSheetPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const captureRef = useRef<HTMLDivElement>(null)
  const [sheetTitle, setSheetTitle] = useState('')
  const [rows, setRows] = useState<SheetRow[]>([emptyRow()])
  const [exporting, setExporting] = useState(false)

  const updateRow = (id: string, patch: Partial<SheetRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const addRow = () => setRows((prev) => [...prev, emptyRow()])

  const removeRow = (id: string) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev
      const row = prev.find((r) => r.id === id)
      if (row?.imageUrl) URL.revokeObjectURL(row.imageUrl)
      return prev.filter((r) => r.id !== id)
    })
  }

  const setImage = async (id: string, file: File | null) => {
    const aspect = file ? await imageAspect(file) : 1
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        if (r.imageUrl) URL.revokeObjectURL(r.imageUrl)
        return { ...r, imageFile: file, imageUrl: file ? URL.createObjectURL(file) : null, imageAspect: aspect }
      }),
    )
  }

  const head = [t('Kerakli jihozlar'), t('Tavsif')]
  const title = sheetTitle.trim() || t('Jihozlar jadvali')

  const onExport = async (format: ExportFormat) => {
    setExporting(true)
    try {
      await runExport(format, title, captureRef.current, head, rows)
    } catch {
      toast(t('Yuklab olishda xatolik'), 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div className="ttbar">
        <div>
          <h3 className="ttbar__title">{t('Jihozlar jadvali')}</h3>
          <p className="ttbar__sub">{t("Darslar uchun kerakli jihozlar ro'yxatini jadval sifatida tayyorlash va yuklab olish.")}</p>
        </div>
        <div className="ttbar__acts">
          <ExportMenu formats={['jpg', 'pdf-portrait', 'pdf-landscape', 'xls', 'doc']} onExport={onExport} busy={exporting} />
        </div>
      </div>

      <section className="panel">
        <label className="field">
          <span className="field__label">{t('Sarlavha')}</span>
          <input className="input" value={sheetTitle} onChange={(e) => setSheetTitle(e.target.value)} placeholder={t('Masalan: 4-hafta. Tezlik. Tekis va notekis harakat')} />
        </label>
      </section>

      <section className="panel">
        <h3 className="panel__title">{t('Qatorlar')}</h3>
        {rows.map((row, i) => (
          <div key={row.id} className="eqsheet__editrow">
            <div className="eqsheet__editrow-head">
              <span className="field__label">{i + 1}-{t('qator')}</span>
              {rows.length > 1 && (
                <button type="button" className="icon-btn icon-btn--danger" onClick={() => removeRow(row.id)} title={t("O'chirish")}>
                  {IC.trash}
                </button>
              )}
            </div>
            <div className="row row--2">
              <div className="field">
                <span className="field__label">{t('Kerakli jihozlar')} <span className="field__opt">({t('rasm')})</span></span>
                {row.imageUrl ? (
                  <div className="eqsheet__editimg">
                    <img src={row.imageUrl} alt="" className="eqsheet__thumb-lg" />
                    <button type="button" className="icon-btn icon-btn--danger" onClick={() => setImage(row.id, null)} title={t("Rasmni o'chirish")}>
                      {IC.trash}
                    </button>
                  </div>
                ) : (
                  <label className="btn btn--sm">
                    {IC.upload} {t('Rasm')}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null
                        if (f) setImage(row.id, f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}
              </div>
              <label className="field">
                <span className="field__label">{t('Tavsif')} <span className="field__opt">({t('har bir band yangi qatorda')})</span></span>
                <textarea
                  className="input"
                  rows={6}
                  value={row.description}
                  onChange={(e) => updateRow(row.id, { description: e.target.value })}
                  placeholder={`- ${t('biri tekis, ikkinchisi...')}\n\n- ${t('2 ta bir xil zoldir')}`}
                />
              </label>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn--sm" onClick={addRow}>+ {t('Qator qo\'shish')}</button>
      </section>

      <section className="panel">
        <h3 className="panel__title">{t("Ko'rinishi")}</h3>
        <div className="table-wrap">
          <div ref={captureRef} className="eqsheet__preview">
            <h2 className="eqsheet__preview-title">{title}</h2>
            <table className="table eqsheet__table">
              <colgroup>
                {COLUMN_WIDTHS.map((f, i) => <col key={i} style={{ width: `${f * 100}%` }} />)}
              </colgroup>
              <thead>
                <tr>
                  {head.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="eqsheet__imgcell">
                      {row.imageUrl ? <img src={row.imageUrl} alt="" className="eqsheet__cellimg" /> : '—'}
                    </td>
                    <td className="eqsheet__desccell">{row.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
