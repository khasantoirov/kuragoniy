import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Modal } from '@/components/Modal'
import { IC } from '@/icons'
import { useUIStore, type Lang } from '@/store/uiStore'

import { mediaSrc } from './cover'
import { pdfSource } from './reader/source'
import { KIND_LABELS, KINDS, type LibraryItem, type LibraryKind } from './types'

// Decorative cover colours (not a data encoding) — fixed per item id.
const COVERS = [
  'linear-gradient(160deg, #4f46e5 0%, #1e1b4b 100%)',
  'linear-gradient(160deg, #e11d48 0%, #7f1d1d 100%)',
  'linear-gradient(160deg, #0f766e 0%, #134e4a 100%)',
  'linear-gradient(160deg, #7c3aed 0%, #3b0764 100%)',
  'linear-gradient(160deg, #ea580c 0%, #7c2d12 100%)',
  'linear-gradient(160deg, #0369a1 0%, #0c4a6e 100%)',
  'linear-gradient(160deg, #b45309 0%, #451a03 100%)',
]

const SHELF_TITLES: Record<LibraryKind, string> = {
  kitob: 'Kitoblar', qollanma: "Qo'llanmalar", video: 'Videolar', havola: 'Havolalar',
}

// A library item is tagged with one class number (not the lessons' grade bands).
function libraryGradeLabel(n: number, lang: Lang) {
  if (lang === 'ru') return `${n} класс`
  if (lang === 'en') return `Grade ${n}`
  return `${n}-sinf`
}

function formatSize(bytes?: number | null): string {
  if (!bytes) return ''
  const kb = bytes / 1024
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

function fileExt(name?: string | null): string {
  return (name ?? '').toUpperCase().split('.').pop() ?? ''
}

function downloadFilename(item: LibraryItem): string {
  const ext = item.file?.split(/[?#]/)[0].split('.').pop()
  return ext ? `${item.title}.${ext}` : item.title
}

/** One volume standing on the shelf: its cover, spine and page edges.
 * With an uploaded cover picture that is the face; otherwise a coloured
 * cover with the grade (or kind icon) and the title. */
function Volume({ item, big, onClick }: { item: LibraryItem; big?: boolean; onClick?: () => void }) {
  const { t } = useTranslation()
  const ext = fileExt(item.file_name)
  const tag = ext || t(KIND_LABELS[item.kind])
  const cover = mediaSrc(item.cover)
  const body = (
    <>
      {cover && <img className="vbook__img" src={cover} alt="" loading="lazy" draggable={false} />}
      <span className="vbook__tag">{tag}</span>
      {pdfSource(item) && <span className="vbook__ribbon" aria-hidden="true" />}
      {!cover && (
        <>
          {item.grade ? <span className="vbook__num">{item.grade}</span> : <span className="vbook__ic">{item.kind === 'video' ? IC.play : item.kind === 'havola' ? IC.external : IC.book}</span>}
          <span className="vbook__title">{item.title}</span>
        </>
      )}
    </>
  )
  const style = { background: COVERS[item.id % COVERS.length] }
  const cls = `vbook ${big ? 'vbook--big' : ''} ${cover ? 'vbook--cover' : ''}`
  return onClick ? (
    <button type="button" className={cls} style={style} onClick={onClick} title={item.title} aria-label={item.title}>
      {body}
    </button>
  ) : (
    <span className={cls} style={style} aria-hidden="true">{body}</span>
  )
}

// Must match the .vcase sizes in styles/portal.css (wide / ≤560px).
const SIZES = {
  wide: { bw: 112, bh: 160, gap: 18, pad: 26, border: 12, frameY: 12 + 14 + 4 + 16 },
  narrow: { bw: 86, bh: 124, gap: 12, pad: 12, border: 8, frameY: 8 + 12 + 4 + 12 },
}
const PLANK = 14
const TOP_GAP = 30
const PLATE = 24

type Fit = { perRow: number; rowh: number; capacity: number; height: number }

/** How many volumes stand in a row and how many rows a bookcase that
 * reaches the bottom of the screen holds. Measured in the page's CSS px:
 * body has CSS zoom, so viewport rects are divided by it. */
function useBookcaseFit(ref: React.RefObject<HTMLDivElement | null>) {
  const [fit, setFit] = useState<Fit | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const sz = window.innerWidth <= 560 ? SIZES.narrow : SIZES.wide
      const zoom = parseFloat(getComputedStyle(document.body).zoom || '1') || 1
      const rowh = sz.bh + TOP_GAP + PLANK
      const booksW = el.clientWidth - 2 * sz.border - 2 * sz.pad
      const perRow = Math.max(1, Math.floor((booksW + sz.gap) / (sz.bw + sz.gap)))
      const bottomBar = window.innerWidth <= 760 ? 84 : 24
      const room = (window.innerHeight - el.getBoundingClientRect().top) / zoom - bottomBar
      const height = Math.max(sz.frameY + PLATE + rowh, Math.floor(room))
      setFit({ perRow, rowh, capacity: height - sz.frameY, height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ref])
  return fit
}

type ShelfPart = { kind: LibraryKind; total: number; rows: LibraryItem[][]; cont: boolean }
type CasePlan = { parts: ShelfPart[]; used: number }

/** Fills bookcases shelf by shelf; when a case is full the rest goes on
 * the next one ("2-javon"), each case as tall as the screen. */
function planCases(shelves: { kind: LibraryKind; items: LibraryItem[] }[], fit: Fit): CasePlan[] {
  const cases: CasePlan[] = [{ parts: [], used: 0 }]
  for (const s of shelves) {
    const rows: LibraryItem[][] = []
    for (let i = 0; i < s.items.length; i += fit.perRow) rows.push(s.items.slice(i, i + fit.perRow))
    let i = 0
    while (i < rows.length) {
      let cur = cases[cases.length - 1]
      if (cur.used > 0 && cur.used + PLATE + fit.rowh > fit.capacity) {
        cur = { parts: [], used: 0 }
        cases.push(cur)
      }
      const take = Math.max(1, Math.floor((fit.capacity - cur.used - PLATE) / fit.rowh))
      cur.parts.push({ kind: s.kind, total: s.items.length, rows: rows.slice(i, i + take), cont: i > 0 })
      cur.used += PLATE + Math.min(take, rows.length - i) * fit.rowh
      i += take
    }
  }
  return cases
}

/** The library as bookcases: one shelf per kind (books, guides, videos,
 * links), volumes standing cover-out on wooden planks. A case reaches the
 * bottom of the screen — empty planks fill what's left — and when it's
 * full the next case ("2-javon") starts below. Picking a volume opens its
 * card with the actions. */
export function Bookcase({ items, admin, onEdit, onDelete }: {
  items: LibraryItem[]
  admin: boolean
  onEdit: (item: LibraryItem) => void
  onDelete: (item: LibraryItem) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<LibraryItem | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const fit = useBookcaseFit(wrap)
  const shelves = KINDS.map((kind) => ({
    kind,
    items: items.filter((x) => x.kind === kind).sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || a.title.localeCompare(b.title)),
  })).filter((s) => s.items.length)
  const cases = fit ? planCases(shelves, fit) : []

  return (
    <>
      <div ref={wrap} className="vcases">
        {fit && cases.map((c, ci) => (
          <div key={ci}>
            {cases.length > 1 && <p className="vcase__no">{ci + 1}-{t('javon')}</p>}
            <div className="vcase" style={{ minHeight: fit.height }}>
              {c.parts.map((part) => (
                <section key={`${part.kind}-${part.cont}`} className="vshelf" aria-label={t(SHELF_TITLES[part.kind])}>
                  <span className="vshelf__plate">
                    {t(SHELF_TITLES[part.kind])} · {part.total}{part.cont ? ` (${t('davomi')})` : ''}
                  </span>
                  <div className="vshelf__books">
                    {part.rows.flat().map((item) => (
                      <div key={item.id} className="vslot">
                        <Volume item={item} onClick={() => setOpen(item)} />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {fit.capacity - c.used >= fit.rowh && (
                <div className="vshelf__books vshelf__fill" style={{ height: Math.floor((fit.capacity - c.used) / fit.rowh) * fit.rowh }} aria-hidden="true" />
              )}
            </div>
          </div>
        ))}
      </div>
      {open && (
        <BookCard item={open} admin={admin} onClose={() => setOpen(null)}
          onEdit={() => { setOpen(null); onEdit(open) }} onDelete={() => { setOpen(null); onDelete(open) }} />
      )}
    </>
  )
}

function BookCard({ item, admin, onClose, onEdit, onDelete }: {
  item: LibraryItem
  admin: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const navigate = useNavigate()
  const readable = !!pdfSource(item)
  const href = item.file || item.url
  const size = formatSize(item.file_size)
  const ext = fileExt(item.file_name)

  return (
    <Modal
      title={item.title}
      onClose={onClose}
      footer={
        <>
          {admin && <button type="button" className="btn btn--ghost" onClick={onDelete}>{IC.trash} {t("O'chirish")}</button>}
          {admin && <button type="button" className="btn" onClick={onEdit}>{IC.edit} {t('Tahrirlash')}</button>}
          {item.file && <a className="btn" href={item.file} download={downloadFilename(item)}>{IC.download} {t('Yuklab olish')}</a>}
          {readable ? (
            <button type="button" className="btn btn--primary" onClick={() => navigate(`/library/${item.id}/read`)}>{IC.book} {t('Varaqlash')}</button>
          ) : href ? (
            <a className="btn btn--primary" href={href} target="_blank" rel="noopener noreferrer">{IC.external} {t('Ochish')}</a>
          ) : null}
        </>
      }
    >
      <div className="vcard">
        <Volume item={item} big />
        <dl className="vcard__meta">
          <dt>{t('Turi')}</dt><dd>{t(KIND_LABELS[item.kind])}</dd>
          {item.grade ? <><dt>{t('Sinf')}</dt><dd>{libraryGradeLabel(item.grade, lang)}</dd></> : null}
          {ext && <><dt>{t('Format')}</dt><dd>{ext}</dd></>}
          {size && <><dt>{t('Hajmi')}</dt><dd>{size}</dd></>}
          <dt>{t('Yangilangan')}</dt><dd>{new Date(item.updated_at).toLocaleDateString('ru-RU')}</dd>
          {item.note && <><dt>{t('Izoh')}</dt><dd>{item.note}</dd></>}
        </dl>
      </div>
    </Modal>
  )
}
