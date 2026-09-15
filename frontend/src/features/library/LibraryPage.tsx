import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { gradeLabel } from '@/features/lessons/labels'
import { IC } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { record } from '@/lib/history'
import { useUIStore } from '@/store/uiStore'

import { useDeleteLibraryItem, useLibraryItems, useRemoveLibraryFile, useSaveLibraryItem, useUploadLibraryFile } from './api'
import { KIND_ICONS, KIND_LABELS, KINDS, type LibraryItem, type LibraryKind, UPLOADABLE_KINDS } from './types'

const LIBRARY_FILE_ACCEPT = '.pdf,.doc,.docx,.epub,.jpg,.jpeg,.png,.webp'

function emptyItem(): Partial<LibraryItem> {
  return { title: '', url: '', kind: 'havola', grade: null, note: '' }
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
  const toast = useToast()

  const canUpload = UPLOADABLE_KINDS.includes(draft.kind as LibraryKind)
  const effectiveMode = canUpload ? fileMode : 'url'

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
          <button className="btn btn--primary" onClick={submit} disabled={save.isPending}>{t('Saqlash')}</button>
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
          <span className="field__label">{t('Sinf')} <span className="field__opt">({t('ixtiyoriy')})</span></span>
          <select className="input" value={draft.grade ?? ''} onChange={(e) => setDraft({ ...draft, grade: e.target.value ? Number(e.target.value) : null })}>
            <option value="">—</option>
            {[7, 8, 9].map((g) => (
              <option key={g} value={g}>{gradeLabel(g, lang)}</option>
            ))}
          </select>
        </label>
      </div>

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
              onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
            />
            {pendingFile && <span className="field__opt">{pendingFile.name}</span>}
          </>
        )}
      </div>

      <label className="field">
        <span className="field__label">{t('Izoh')} <span className="field__opt">({t('ixtiyoriy')})</span></span>
        <input className="input" value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder={t('Qisqacha tavsif')} />
      </label>
    </Modal>
  )
}

function downloadFilename(item: LibraryItem): string {
  const ext = item.file?.split(/[?#]/)[0].split('.').pop()
  return ext ? `${item.title}.${ext}` : item.title
}

function LibraryCard({ item, admin, onEdit, onDelete }: { item: LibraryItem; admin: boolean; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  return (
    <article className="lbcard">
      <a className="lbcard__main" href={item.file || item.url} target="_blank" rel="noopener noreferrer">
        <span className="lbcard__ic">{KIND_ICONS[item.kind]}</span>
        <span className="lbcard__body">
          <span className="lbcard__title">{item.title}</span>
          <span className="lbcard__meta">{t(KIND_LABELS[item.kind])}{item.grade ? ' · ' + gradeLabel(item.grade, lang) : ''}</span>
          {item.note && <span className="lbcard__note">{item.note}</span>}
        </span>
        <span className="lbcard__go" aria-hidden="true">{IC.external}</span>
      </a>
      {(item.file || admin) && (
        <div className="lbcard__tools">
          {item.file && (
            <a className="icon-btn" title={t('Yuklab olish')} href={item.file} download={downloadFilename(item)}>
              {IC.download}
            </a>
          )}
          {admin && (
            <>
              <button className="icon-btn" title={t('Tahrirlash')} onClick={onEdit}>{IC.edit}</button>
              <button className="icon-btn icon-btn--danger" title={t("O'chirish")} onClick={onDelete}>{IC.trash}</button>
            </>
          )}
        </div>
      )}
    </article>
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
  const rows = term ? data.filter((x) => x.title.toLowerCase().includes(term) || (x.note ?? '').toLowerCase().includes(term)) : data

  return (
    <div>
      <div className="toolbar">
        <div className="search">
          <span className="search__ic" aria-hidden="true">{IC.search}</span>
          <input className="search__input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Kutubxonadan qidirish…')} autoComplete="off" />
        </div>
        {admin && <button className="btn btn--sm btn--primary" onClick={() => setEditing('new')}>+ {t('Material')}</button>}
      </div>

      {rows.length ? (
        <div className="lbgrid">
          {rows.map((item) => (
            <LibraryCard key={item.id} item={item} admin={admin} onEdit={() => setEditing(item)} onDelete={() => onDelete(item)} />
          ))}
        </div>
      ) : (
        <p className="prose">{t('Hech narsa topilmadi')}.</p>
      )}

      {editing && <LibraryEditor item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
