import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Modal } from '@/components/Modal'
import { IC } from '@/icons'
import { useUIStore, type Lang } from '@/store/uiStore'

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

/** One volume standing on the shelf: its cover, spine and page edges. */
function Volume({ item, big, onClick }: { item: LibraryItem; big?: boolean; onClick?: () => void }) {
  const { t } = useTranslation()
  const ext = fileExt(item.file_name)
  const tag = ext || t(KIND_LABELS[item.kind])
  const body = (
    <>
      <span className="vbook__tag">{tag}</span>
      {pdfSource(item) && <span className="vbook__ribbon" aria-hidden="true" />}
      {item.grade ? <span className="vbook__num">{item.grade}</span> : <span className="vbook__ic">{item.kind === 'video' ? IC.play : item.kind === 'havola' ? IC.external : IC.book}</span>}
      <span className="vbook__title">{item.title}</span>
    </>
  )
  const style = { background: COVERS[item.id % COVERS.length] }
  return onClick ? (
    <button type="button" className={`vbook ${big ? 'vbook--big' : ''}`} style={style} onClick={onClick} title={item.title} aria-label={item.title}>
      {body}
    </button>
  ) : (
    <span className={`vbook ${big ? 'vbook--big' : ''}`} style={style} aria-hidden="true">{body}</span>
  )
}

/** The library as a bookcase: one shelf per kind (books, guides, videos,
 * links), volumes standing cover-out on wooden planks. Picking a volume
 * opens its card with the actions. */
export function Bookcase({ items, admin, onEdit, onDelete }: {
  items: LibraryItem[]
  admin: boolean
  onEdit: (item: LibraryItem) => void
  onDelete: (item: LibraryItem) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<LibraryItem | null>(null)
  const shelves = KINDS.map((kind) => ({
    kind,
    items: items.filter((x) => x.kind === kind).sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || a.title.localeCompare(b.title)),
  })).filter((s) => s.items.length)

  return (
    <>
      <div className="vcase">
        {shelves.map((s) => (
          <section key={s.kind} className="vshelf" aria-label={t(SHELF_TITLES[s.kind])}>
            <span className="vshelf__plate">{t(SHELF_TITLES[s.kind])} · {s.items.length}</span>
            <div className="vshelf__books">
              {s.items.map((item) => (
                <div key={item.id} className="vslot">
                  <Volume item={item} onClick={() => setOpen(item)} />
                </div>
              ))}
            </div>
          </section>
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
