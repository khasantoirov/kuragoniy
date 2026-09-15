import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { useConfirm } from '@/components/ConfirmProvider'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { quarterLabel } from '@/features/journal/labels'
import { gradeLabel } from '@/features/lessons/labels'
import { useUIStore } from '@/store/uiStore'

import { runLessonsImport } from './api'
import { lessonsByGrade, parseLessonsImport, totalExperiments, type ImportLessonRow } from './importLessons'

export function ImportLessonsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const [rows, setRows] = useState<ImportLessonRow[] | null>(null)
  const [mode, setMode] = useState<'add' | 'replace'>('add')
  const [busyMsg, setBusyMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const onCheck = () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return toast(t('Faylni tanlang'), 'error')
    file.text().then((text) => {
      try {
        const parsed = parseLessonsImport(text)
        if (!parsed.length) return toast(t('Faylda dars topilmadi'), 'error')
        setRows(parsed)
      } catch (e) {
        toast(t(e instanceof Error ? e.message : 'Fayl JSON emas yoki buzilgan'), 'error')
      }
    })
  }

  const onImport = async () => {
    if (!rows) return
    const grades = Object.keys(lessonsByGrade(rows)).map(Number)
    if (mode === 'replace') {
      const list = grades.map((g) => gradeLabel(g, lang)).join(', ')
      if (!(await confirm({
        title: t('Diqqat'),
        text: `${list} ${t("sinflardagi mavjud barcha darslar o'chiriladi va fayldagilar yoziladi. Davom etamizmi?")}`,
        danger: true,
      }))) return
    }
    try {
      const n = await runLessonsImport(rows, mode, grades, setBusyMsg)
      setBusyMsg('')
      queryClient.invalidateQueries({ queryKey: ['lessons'] })
      toast(`${n} ${t('ta dars import qilindi')}`)
      onClose()
    } catch (e) {
      setBusyMsg('')
      toast(`${t('Import xatosi: ')}${e instanceof Error ? e.message : ''}`, 'error')
    }
  }

  if (!rows) {
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

  const byGrade = lessonsByGrade(rows)

  return (
    <Modal
      title={t('Import — tasdiqlash')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={!!busyMsg}>{t('Bekor qilish')}</button>
          <button className="btn btn--primary" onClick={onImport} disabled={!!busyMsg}>
            {busyMsg || t('Import qilish')}
          </button>
        </>
      }
    >
      <div className="imstat">
        <div className="imstat__row"><span>{t('Darslar')}</span><b>{rows.length}</b></div>
        <div className="imstat__row"><span>{t('Tajribalar')}</span><b>{totalExperiments(rows)}</b></div>
        {Object.keys(byGrade).sort().map((g) => (
          <div key={g} className="imstat__row"><span>{gradeLabel(Number(g), lang)}</span><b>{byGrade[Number(g)]}</b></div>
        ))}
      </div>
      <p className="prose">{t('Dastlabki 5 ta dars:')}</p>
      <ul className="implist">
        {rows.slice(0, 5).map((l, i) => (
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
