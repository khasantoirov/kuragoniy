import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { SUBJECTS, subjectLabel } from '@/features/lessons/labels'
import { IC } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { record } from '@/lib/history'
import { useUIStore, type Lang } from '@/store/uiStore'

import {
  useDeleteLibraryItem, useLibraryItems, useRemoveLibraryCover, useRemoveLibraryFile, useSaveLibraryItem, useUploadLibraryCover,
  useUploadLibraryFile,
} from './api'
import { Bookcase } from './Bookcase'
import { fileToDataUrl, mediaSrc, shrinkImage } from './cover'
import { CoverField } from './CoverField'
import { pdfSource } from './reader/source'
import {
  KIND_ICONS, KIND_LABELS, KINDS, LANG_LABELS, type GuideSection, type LibraryItem, type LibraryKind, type LibraryLang,
  SECTION_LABELS, UPLOADABLE_KINDS,
} from './types'
import './library-extra.css'

const LIBRARY_FILE_ACCEPT = '.pdf,.doc,.docx,.epub,.jpg,.jpeg,.png,.webp'
const LIBRARY_GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9]

// LibraryItem.grade is a single free-standing class number (unlike
// Lesson.grade's 5-band scheme) — a book/resource is tagged for one
// specific class, so it doesn't share lessons/labels.ts's `gradeLabel`.
function libraryGradeLabel(n: number, lang: Lang) {
  if (lang === 'ru') return `${n} класс`
  if (lang === 'en') return `Grade ${n}`
  return `${n}-sinf`
}

function emptyItem(): Partial<LibraryItem> {
  // a new book belongs to the fan window it is added in
  return { title: '', url: '', kind: 'havola', grade: null, subject: useUIStore.getState().subject, note: '' }
}

function LibraryEditor({ item, onClose }: { item: LibraryItem | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const [draft, setDraft] = useState<Partial<LibraryItem>>(item ?? emptyItem())
  const [fileMode, setFileMode] = useState<'url' | 'file'>(item?.file ? 'file' : 'url')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const save = useSaveLibraryItem()
  const del = useDeleteLibraryItem()
  const upload = useUploadLibraryFile()
  const removeFile = useRemoveLibraryFile()
  const uploadCover = useUploadLibraryCover()
  const removeCover = useRemoveLibraryCover()
  const toast = useToast()
  // Cover: a picked/generated file waiting for Save, or the current one removed.
  const [cover, setCover] = useState<{ file: File | null; preview: string | null; removed: boolean }>({ file: null, preview: null, removed: false })
  const [coverBusy, setCoverBusy] = useState(false)
  const applyCover = async (file: File) => setCover({ file, preview: await fileToDataUrl(file), removed: false })

  const canUpload = UPLOADABLE_KINDS.includes(draft.kind as LibraryKind)
  const effectiveMode = canUpload ? fileMode : 'url'
  const coverPreview = cover.preview ?? (cover.removed ? null : mediaSrc(item?.cover))
  // Where a first-page cover can come from: the PDF being uploaded, the
  // uploaded one, or a PDF link on this site.
  const pdfFrom: string | File | null = (() => {
    if (effectiveMode === 'url') return pdfSource({ file: null, url: (draft.url ?? '').trim() })
    if (pendingFile) return /\.pdf$/i.test(pendingFile.name) ? pendingFile : null
    return item ? pdfSource({ file: item.file, url: '' }) : null
  })()

  const coverFromPdf = async (src: string | File, quiet = false) => {
    setCoverBusy(true)
    try {
      const { pdfCover } = await import('./reader/cover')
      await applyCover(await pdfCover(src))
    } catch {
      if (!quiet) toast(t("PDF'dan muqova olib bo'lmadi"), 'error')
    } finally {
      setCoverBusy(false)
    }
  }

  const coverFromImage = async (f: File) => {
    setCoverBusy(true)
    try {
      await applyCover(await shrinkImage(f))
    } catch {
      toast(t("Rasmni o'qib bo'lmadi"), 'error')
    } finally {
      setCoverBusy(false)
    }
  }

  // A new PDF with no cover yet gets its first page as one (shown before
  // saving, so it can still be replaced or removed).
  const pickFile = (f: File | null) => {
    setPendingFile(f)
    if (f && /\.pdf$/i.test(f.name) && !cover.file && (cover.removed || !item?.cover)) void coverFromPdf(f, true)
  }

  const submit = async () => {
    const title = (draft.title ?? '').trim()
    if (!title) return toast(t('Nomini kiriting'), 'error')

    let url = (draft.url ?? '').trim()
    if (effectiveMode === 'url') {
      if (!url) return toast(t('Havolani kiriting'), 'error')
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    } else {
      if (!item?.file && !pendingFile) return toast(t('Faylni tanlang'), 'error')
      url = ''
    }

    const payload = { ...draft, id: item?.id, title, url, note: (draft.note ?? '').trim() }
    try {
      const saved = await save.mutateAsync(payload)
      if (effectiveMode === 'file' && pendingFile) {
        await upload.mutateAsync({ id: saved.id, file: pendingFile })
      }
      if (cover.file) await uploadCover.mutateAsync({ id: saved.id, cover: cover.file })
      else if (cover.removed && item?.cover) await removeCover.mutateAsync(item.id)
      if (item) {
        record(
          t('Material tahrirlandi'),
          async () => { await save.mutateAsync(item) },
          async () => { await save.mutateAsync(payload) },
        )
      } else {
        // A redo after undo recreates the item under a fresh id, so the
        // NEXT undo must target that new id, not the original — tracked
        // via this mutable closure variable rather than the fixed saved.id.
        let currentId = saved.id
        record(
          t("Material qo'shildi"),
          async () => { await del.mutateAsync(currentId) },
          async () => { const r = await save.mutateAsync({ ...payload, id: undefined }); currentId = r.id },
        )
      }
      toast(item ? t('Saqlandi') : t("Material qo'shildi"))
      onClose()
    } catch (err) {
      const detail = isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined
      toast(t(detail ?? 'Saqlashda xatolik'), 'error')
    }
  }

  return (
    <Modal
      title={item ? t('Materialni tahrirlash') : t('Yangi material')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={submit} disabled={save.isPending || upload.isPending || uploadCover.isPending || coverBusy}>{t('Saqlash')}</button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('Nomi')}</span>
        <input className="input" value={draft.title ?? ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={t('Fizika 7-sinf darsligi')} />
      </label>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Turi')}</span>
          <select
            className="input"
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as LibraryKind })}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>{KIND_ICONS[k]} {t(KIND_LABELS[k])}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('Sinf')}</span>
          <select className="input" value={draft.grade ?? ''} onChange={(e) => setDraft({ ...draft, grade: e.target.value ? Number(e.target.value) : null })}>
            <option value="">{t('Sinfsiz')}</option>
            {LIBRARY_GRADES.map((g) => (
              <option key={g} value={g}>{libraryGradeLabel(g, lang)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Til')}</span>
          <select className="input" value={draft.lang ?? 'uz'} onChange={(e) => setDraft({ ...draft, lang: e.target.value as LibraryLang })}>
            {(Object.keys(LANG_LABELS) as LibraryLang[]).map((l) => <option key={l} value={l}>{t(LANG_LABELS[l])}</option>)}
          </select>
        </label>
        {(draft.kind === 'qollanma' || draft.kind === 'video') && (
          <label className="field">
            <span className="field__label">{t("Qo'llanmalar markazida")}</span>
            <select className="input" value={draft.section ?? ''} onChange={(e) => setDraft({ ...draft, section: e.target.value as '' | GuideSection })}>
              <option value="">{t("Ko'rsatilmasin")}</option>
              {(Object.keys(SECTION_LABELS) as GuideSection[]).map((k) => <option key={k} value={k}>{t(SECTION_LABELS[k])}</option>)}
            </select>
          </label>
        )}
      </div>
      <label className="field">
        <span className="field__label">{t('Fan')}</span>
        <select className="input" value={draft.subject ?? ''} onChange={(e) => setDraft({ ...draft, subject: e.target.value as LibraryItem['subject'] })}>
          <option value="">{t('Ikkala fan uchun')}</option>
          {SUBJECTS.map((s) => <option key={s} value={s}>{subjectLabel(s, lang)}</option>)}
        </select>
      </label>

      <div className="field">
        <span className="field__label">{canUpload ? t("Havola yoki fayl") : t('Havola')}</span>
        {canUpload ? (
          <>
            <p className="prose prose--note">{t("Kitob yoki qo'llanma fayli — PDF, DOC, DOCX, EPUB yoki rasm, 150MB gacha")}</p>
            <div className="chips" style={{ marginBottom: 8 }}>
              <button type="button" className={`chip ${fileMode === 'url' ? 'is-on' : ''}`} onClick={() => setFileMode('url')}>
                {t('Havola')}
              </button>
              <button type="button" className={`chip ${fileMode === 'file' ? 'is-on' : ''}`} onClick={() => setFileMode('file')}>
                {t('Fayl yuklash')}
              </button>
            </div>
          </>
        ) : (
          <p className="prose prose--note">
            {t("Faylni Google Drive, Telegram kanal yoki YouTube'ga joylang, keyin shu yerga havolasini kiriting.")}
          </p>
        )}
        {effectiveMode === 'url' ? (
          <input className="input" value={draft.url ?? ''} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://drive.google.com/..." />
        ) : item?.file && !pendingFile ? (
          <div className="row row--2">
            <a className="btn btn--sm" href={item.file} target="_blank" rel="noreferrer">
              {IC.file} {t('Joriy faylni ochish')}
            </a>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              disabled={removeFile.isPending}
              onClick={async () => {
                await removeFile.mutateAsync(item.id)
                toast(t("Fayl o'chirildi"))
              }}
            >
              {t("O'chirish")}
            </button>
          </div>
        ) : (
          <>
            <input
              className="input"
              type="file"
              accept={LIBRARY_FILE_ACCEPT}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            {pendingFile && <span className="field__opt">{pendingFile.name}</span>}
          </>
        )}
      </div>

      <CoverField
        preview={coverPreview}
        busy={coverBusy}
        canFromPdf={!!pdfFrom}
        onImage={coverFromImage}
        onPdf={() => pdfFrom && coverFromPdf(pdfFrom)}
        onRemove={() => setCover({ file: null, preview: null, removed: true })}
      />

      <label className="field">
        <span className="field__label">{t('Izoh')} <span className="field__opt">({t('ixtiyoriy')})</span></span>
        <input className="input" value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder={t('Qisqacha tavsif')} />
      </label>
    </Modal>
  )
}

export function LibraryPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const admin = isAdminInView(user, viewMode)
  const { data, isLoading } = useLibraryItems()
  const [editing, setEditing] = useState<LibraryItem | null | 'new'>(null)
  const [q, setQ] = useState('')
  // Sinf / Turi / Til filters (owner's mock-ups, 2026-11-26)
  const [fGrade, setFGrade] = useState<number | ''>('')
  const [fKind, setFKind] = useState<LibraryKind | ''>('')
  const [fLang, setFLang] = useState<LibraryLang | ''>('')
  const { lang: uiLang } = useUIStore()
  const del = useDeleteLibraryItem()
  const save = useSaveLibraryItem()
  const confirm = useConfirm()
  const toast = useToast()

  const onDelete = async (item: LibraryItem) => {
    if (!(await confirm({ title: t("O'chirish"), text: `"${item.title}" ${t("kutubxonadan o'chiriladi.")}`, danger: true }))) return
    try {
      await del.mutateAsync(item.id)
      // Undo recreates the item under a fresh id (REST create can't reuse
      // the deleted one), so redo must delete THAT new id, not the
      // original — tracked via this mutable closure variable.
      let currentId = item.id
      record(
        t("Material o'chirildi"),
        async () => { const r = await save.mutateAsync({ ...item, id: undefined }); currentId = r.id },
        async () => { await del.mutateAsync(currentId) },
      )
      toast(t("O'chirildi"))
    } catch {
      toast(t("O'chirishda xatolik"), 'error')
    }
  }

  if (isLoading) return <Skeleton lines={3} />

  if (!data?.length) {
    return (
      <div>
        <EmptyState
          title={t("Kutubxona bo'sh")}
          hint={admin ? t("Kitob yoki qo'llanma havolasini qo'shing.") : t("Administrator material qo'shgach shu yerda ko'rinadi.")}
          action={admin ? <button className="btn btn--primary" onClick={() => setEditing('new')}>{t("Material qo'shish")}</button> : undefined}
        />
        {editing && <LibraryEditor item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      </div>
    )
  }

  const term = q.trim().toLowerCase()
  const rows = data.filter((x) => (!term || x.title.toLowerCase().includes(term) || (x.note ?? '').toLowerCase().includes(term))
    && (fGrade === '' || x.grade === fGrade)
    && (!fKind || x.kind === fKind)
    && (!fLang || (x.lang ?? 'uz') === fLang))
  const grades = [...new Set(data.map((x) => x.grade).filter((g): g is number => g != null))].sort((a, b) => a - b)
  const langs = [...new Set(data.map((x) => x.lang ?? 'uz'))] as LibraryLang[]
  const popular = [...data].filter((x) => (x.opens ?? 0) > 0).sort((a, b) => (b.opens ?? 0) - (a.opens ?? 0)).slice(0, 5)
  const totalOpens = data.reduce((n, x) => n + (x.opens ?? 0), 0)

  return (
    <div>
      <div className="toolbar">
        <div className="search">
          <span className="search__ic" aria-hidden="true">{IC.search}</span>
          <input className="search__input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Kutubxonadan qidirish…')} autoComplete="off" />
        </div>
        {admin && <button className="btn btn--sm btn--primary" onClick={() => setEditing('new')}>+ {t('Material')}</button>}
      </div>
      <div className="libf" role="group" aria-label={t('Saralash')}>
        {grades.length > 0 && (
          <select className="input libf__s" value={fGrade} onChange={(e) => setFGrade(e.target.value ? Number(e.target.value) : '')} aria-label={t('Sinf')}>
            <option value="">{t('Barcha sinflar')}</option>
            {grades.map((g) => <option key={g} value={g}>{libraryGradeLabel(g, uiLang)}</option>)}
          </select>
        )}
        <select className="input libf__s" value={fKind} onChange={(e) => setFKind(e.target.value as LibraryKind | '')} aria-label={t('Turi')}>
          <option value="">{t('Barcha turlar')}</option>
          {KINDS.filter((k) => data.some((x) => x.kind === k)).map((k) => <option key={k} value={k}>{t(KIND_LABELS[k])}</option>)}
        </select>
        {langs.length > 1 && (
          <select className="input libf__s" value={fLang} onChange={(e) => setFLang(e.target.value as LibraryLang | '')} aria-label={t('Til')}>
            <option value="">{t('Barcha tillar')}</option>
            {langs.map((l) => <option key={l} value={l}>{t(LANG_LABELS[l])}</option>)}
          </select>
        )}
      </div>

      {rows.length ? (
        <Bookcase items={rows} admin={admin} onEdit={setEditing} onDelete={onDelete} />
      ) : (
        <p className="prose">{t('Hech narsa topilmadi')}.</p>
      )}

      <div className="libstats">
        <section className="libstats__card">
          <h3>{t("Eng ko'p ochilganlar")}</h3>
          {popular.length ? (
            <ol className="libstats__top">
              {popular.map((x) => <li key={x.id}><span>{x.title}</span><b>{x.opens}</b></li>)}
            </ol>
          ) : <p className="libstats__empty">{t("Hali hech narsa ochilmagan.")}</p>}
        </section>
        <section className="libstats__card">
          <h3>{t('Kutubxona statistikasi')}</h3>
          <p><span>{t('Jami materiallar')}</span><b>{data.length}</b></p>
          {KINDS.filter((k) => data.some((x) => x.kind === k)).map((k) => (
            <p key={k}><span>{t(KIND_LABELS[k])}</span><b>{data.filter((x) => x.kind === k).length}</b></p>
          ))}
          <p><span>{t('Jami ochilishlar')}</span><b>{totalOpens}</b></p>
        </section>
      </div>

      {editing && <LibraryEditor item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
