import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { IC } from '@/icons'

export type ExportFormat = 'jpg' | 'pdf-portrait' | 'pdf-landscape' | 'xls' | 'doc'

const FORMAT_LABELS: Record<ExportFormat, string> = {
  jpg: 'JPG rasm',
  'pdf-portrait': 'PDF (vertikal)',
  'pdf-landscape': 'PDF (gorizontal)',
  xls: 'Excel (XLS)',
  doc: 'Word (DOC)',
}

export function ExportMenu({
  formats,
  onExport,
  busy,
}: {
  formats: ExportFormat[]
  onExport: (format: ExportFormat) => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [popStyle, setPopStyle] = useState<CSSProperties>({})

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Positioned via measured coordinates (not CSS right:0 anchoring), same
  // fix as AnnouncementsBell — so the panel never overflows off either
  // edge of a narrow phone screen no matter where this button sits.
  useEffect(() => {
    if (!open) return
    const recompute = () => {
      const btn = btnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const margin = 10
      const width = Math.min(240, window.innerWidth - margin * 2)
      const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin))
      setPopStyle({ position: 'fixed', top: rect.bottom + 8, left, width, minWidth: 0, maxWidth: width })
    }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [open])

  return (
    <div className="acct" ref={wrapRef}>
      <button ref={btnRef} type="button" className="btn btn--sm" onClick={() => setOpen((v) => !v)} disabled={busy}>
        {IC.download} {t('Yuklab olish')}
      </button>
      {open && (
        <div className="acct__pop" style={popStyle}>
          {formats.map((f) => (
            <button
              key={f}
              type="button"
              className="acct__item"
              onClick={() => {
                setOpen(false)
                onExport(f)
              }}
            >
              {t(FORMAT_LABELS[f])}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
