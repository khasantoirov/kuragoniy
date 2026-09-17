import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { quarterLabel } from '@/features/journal/labels'
import { type Grade, gradeLabel } from '@/features/lessons/labels'
import { useUIStore } from '@/store/uiStore'

import { type BulkImportResult, runLessonsImport } from './api'
import { lessonsByGrade, parseLessonsImport, type ParseLessonsResult, totalExperiments } from './importLessons'

function formatRowErrors(errors: unknown): string {
  if (!errors || typeof errors !== 'object') return String(errors)
  return Object.entries(errors as Record<string, unknown>)
    .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : String(msgs)}`)
    .join('; ')
}

export function ImportLessonsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const [parsed, setParsed] = useState<ParseLessonsResult | null>(null)
  const [mode, setMode] = useState<'add' | 'replace'>('add')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BulkImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const onCheck = () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return toast(t('Faylni tanlang'), 'error')
    file.text().then((text) => {
      try {
        const p = parseLessonsImport(text)
        if (!p.rows.length) return toast(t('Faylda dars topilmadi'), 'error')
        setParsed(p)
      } catch (e) {
        toast(t(e instanceof Error ? e.message : 'Fayl JSON emas yoki buzilgan'), 'error')
      }
    })
  }

  const onImport = async () => {
    if (!parsed) return
    const grades = Object.keys(lessonsByGrade(parsed.rows)) as Grade[]
    if (mode === 'replace') {
      const list = grades.map((g) => gradeLabel(g, lang)).join(', ')
      if (!(await confirm({
        title: t('Diqqat'),
        text: `${list} ${t("sinflardagi mavjud barcha darslar o'chiriladi va fayldagilar yoziladi. Davom etamizmi?")}`,
        danger: true,
      }))) return
    }
    setBusy(true)
    try {
      const res = await runLessonsImport(parsed.rows, mode)
      queryClient.invalidateQueries({ queryKey: ['lessons'] })
      setResult(res)
    } catch (e) {
      toast(`${t('Import xatosi: ')}${e instanceof Error ? e.message : ''}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!parsed) {
    return (
      <Modal
        title={t('Darslarni import qilish')}
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
            <button className="btn btn--primary" onClick={onCheck}>{t('Tekshirish')}</button>
          </>
        }
      >
        <p className="prose prose--note">{t("JSON faylni tanlang. Import qilishdan oldin nima yozilishini ko'rasiz.")}</p>
        <label className="field">
          <span className="field__label">{t('Fayl')}</span>
          <input ref={fileRef} className="input" type="file" accept="application/json,.json" />
        </label>
      </Modal>
    )
  }

  if (result) {
    return (
      <Modal
        title={t('Import — natija')}
        onClose={onClose}
        footer={<button className="btn btn--primary" onClick={onClose}>{t('Yopish')}</button>}
      >
        <div className="imstat">
          <div className="imstat__row"><span>{t('Qo\'shildi')}</span><b>{result.created}</b></div>
          {result.deleted > 0 && (
            <div className="imstat__row"><span>{t("O'chirildi")}</span><b>{result.deleted}</b></div>
          )}
          {result.skipped.length > 0 && (
            <div className="imstat__row"><span>{t("O'tkazib yuborildi (dublikat)")}</span><b>{result.skipped.length}</b></div>
          )}
          {result.errors.length > 0 && (
            <div className="imstat__row"><span>{t('Xato')}</span><b>{result.errors.length}</b></div>
          )}
        </div>
        {result.errors.length > 0 && (
          <>
            <p className="prose">{t('Xato qatorlar:')}</p>
            <ul className="implist implist--danger">
              {result.errors.map((e, i) => (
                <li key={i}>
                  <b>{e.title || `#${e.row + 1}`}</b>
                  <span>{formatRowErrors(e.errors)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {result.skipped.length > 0 && (
          <>
            <p className="prose">{t("O'tkazib yuborilgan qatorlar:")}</p>
            <ul className="implist">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  <b>{s.title || `#${s.row + 1}`}</b>
                  <span>{gradeLabel(s.grade as Grade, lang)} · {t('hafta')} {s.hafta}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>
    )
  }

  const byGrade = lessonsByGrade(parsed.rows)
  const droppedCount = parsed.warnings.filter((w) => w.reasons.includes('no_title')).length
  const defaultedWarnings = parsed.warnings.filter((w) => !w.reasons.includes('no_title'))

  return (
    <Modal
      title={t('Import — tasdiqlash')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={onImport} disabled={busy}>
            {busy ? t('Yozilmoqda…') : t('Import qilish')}
          </button>
        </>
      }
    >
      <div className="imstat">
        <div className="imstat__row"><span>{t('Darslar')}</span><b>{parsed.rows.length}</b></div>
        <div className="imstat__row"><span>{t('Tajribalar')}</span><b>{totalExperiments(parsed.rows)}</b></div>
        {Object.keys(byGrade).sort().map((g) => (
          <div key={g} className="imstat__row"><span>{gradeLabel(g as Grade, lang)}</span><b>{byGrade[g]}</b></div>
        ))}
      </div>
      {(droppedCount > 0 || defaultedWarnings.length > 0) && (
        <p className="prose prose--note">
          {droppedCount > 0 && `${droppedCount} ${t("ta qator nomi yo'qligi sabab tashlab yuborildi")}. `}
          {defaultedWarnings.length > 0 &&
            `${defaultedWarnings.length} ${t("ta qatorda sinf/chorak/hafta noto'g'ri bo'lgani uchun standart qiymatga o'rnatildi")}.`}
        </p>
      )}
      <p className="prose">{t('Dastlabki 5 ta dars:')}</p>
      <ul className="implist">
        {parsed.rows.slice(0, 5).map((l, i) => (
          <li key={i}>
            <b>{l.title}</b>
            <span>{gradeLabel(l.grade, lang)} · {quarterLabel(l.chorak, lang)} · {l.experiments.length} {t('ta tajriba')}</span>
          </li>
        ))}
      </ul>
      <label className="field" style={{ marginTop: 14 }}>
        <span className="field__label">{t('Mavjud darslar bilan nima qilamiz?')}</span>
        <select className="input" value={mode} onChange={(e) => setMode(e.target.value as 'add' | 'replace')}>
          <option value="add">{t("Qo'shib qo'yish (mavjudlari qoladi)")}</option>
          <option value="replace">{t("Shu sinflardagi eski darslarni o'chirib, yangisini yozish")}</option>
        </select>
      </label>
    </Modal>
  )
}
