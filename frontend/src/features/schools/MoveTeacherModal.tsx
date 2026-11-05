import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errText } from '@/features/portal/ui'
import { api } from '@/lib/api/client'
import type { User } from '@/lib/api/types'
import { record } from '@/lib/history'

import { useSchools, useSchoolsMutation } from './api'

interface Preview {
  classes: { id: number; name: string }[]
  slots: number
  assigned: boolean
}

interface MoveResult {
  move: number
  classes: number
  slots_moved: number
  slots_kept: number
}

const today = () => new Date().toISOString().slice(0, 10)

/** O'qituvchini ko'chirish: from this school to another, and/or a successor
 *  taking their classes (rosters, marks, pupils' accounts) and timetable
 *  lessons here — backend schools/moves.py. Opened from a teacher's row
 *  ("Ko'chirish"), or from "Biriktirish" with "o'rniga" (then the newcomer
 *  is the successor). Ctrl+Z puts it all back. */
export function MoveTeacherModal({ school, teachers, staff, initialTeacher = '', initialSuccessor = '', onClose }: {
  school: { id: number; name: string }
  /** this school's teachers, to pick who leaves */
  teachers: { id: string; name: string }[]
  /** everyone who could take over */
  staff: User[]
  initialTeacher?: string
  initialSuccessor?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const schools = useSchools()
  const [teacher, setTeacher] = useState(initialTeacher)
  const [toSchool, setToSchool] = useState('')
  const [successor, setSuccessor] = useState(initialSuccessor)
  const [since, setSince] = useState(today())

  const preview = useQuery({
    queryKey: ['schools', 'move-preview', school.id, teacher],
    enabled: !!teacher,
    queryFn: async () => (await api.get<Preview>(`/schools/${school.id}/move-teacher/`, { params: { teacher } })).data,
  })
  const move = useSchoolsMutation(async (body: Record<string, string>) =>
    (await api.post<MoveResult>(`/schools/${school.id}/move-teacher/`, body)).data)
  const undo = useSchoolsMutation(async (id: number) => api.post(`/schools/teacher-moves/${id}/undo/`))

  const nameOf = (id: string) => staff.find((u) => u.id === id)?.name ?? teachers.find((x) => x.id === id)?.name ?? ''
  const classes = preview.data?.classes ?? []
  const needSuccessor = classes.length > 0
  const targets = (schools.data ?? []).filter((s) => s.id !== school.id && s.is_active)
  const ready = !!teacher && (!!toSchool || !!successor) && (!needSuccessor || !!successor) && successor !== teacher

  const submit = async () => {
    const body = { teacher, ...(toSchool ? { to_school: toSchool } : {}), ...(successor ? { successor } : {}), since }
    try {
      const res = await move.mutateAsync(body)
      const target = targets.find((s) => String(s.id) === toSchool)?.name
      const label = `${t("Ko'chirish")}: ${nameOf(teacher)} — «${school.name}»${target ? ` → «${target}»` : ''}`
      const done = { id: res.move }
      record(label,
        async () => { await undo.mutateAsync(done.id) },
        async () => { done.id = (await move.mutateAsync(body)).move })
      let msg = `${t("Ko'chirildi")}: ${nameOf(teacher)}`
      if (successor) msg += ` · ${res.classes} ${t('ta sinf')} → ${nameOf(successor)}`
      toast(`${msg} · ${t('Ctrl+Z — bekor qilish')}`)
      if (res.slots_kept) {
        toast(`${t("Dars jadvalidagi")} ${res.slots_kept} ${t("ta dars o'tmadi — o'sha soatda yangi o'qituvchining darsi bor. Jadvalni qo'lda to'g'rilang.")}`, 'error')
      }
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <Modal
      title={t("O'qituvchini ko'chirish")}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={!ready || move.isPending} onClick={() => void submit()}>{t("Ko'chirish")}</button>
      </>}
    >
      <p className="prose prose--note">
        {t("Hozirgi maktab")}: <b>{school.name}</b>. {t("O'qituvchi yangi maktabga biriktiriladi; shu maktabdagi sinflari (jurnal, baholar, o'quvchi hisoblari) va dars jadvali o'rniga keladigan o'qituvchiga o'tadi. O'tgan yillar jurnali joyida qoladi.")}
      </p>

      <label className="field">
        <span className="field__label">{t("Ko'chiriladigan o'qituvchi")}</span>
        <select className="input" value={teacher} onChange={(e) => setTeacher(e.target.value)} disabled={!!initialTeacher}>
          <option value="">{t('Tanlang…')}</option>
          {teachers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>

      {teacher && (
        <p className={`mvt__sum ${needSuccessor ? 'is-warn' : ''}`}>
          {preview.isLoading ? t('Yuklanmoqda…') : classes.length
            ? <>{t('Shu maktabda')} <b>{classes.length} {t('ta sinf')}</b> ({classes.map((c) => c.name).join(', ')})
              {preview.data?.slots ? <> {t('va jadvalda')} <b>{preview.data.slots} {t('ta dars')}</b></> : null}
              {' — '}{t("ular o'rniga keladigan o'qituvchiga o'tadi.")}</>
            : t("Shu maktabda sinfi yo'q — faqat biriktirilishi o'zgaradi.")}
        </p>
      )}

      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Yangi maktab')}</span>
          <select className="input" value={toSchool} onChange={(e) => setToSchool(e.target.value)}>
            <option value="">{t('— boshqa maktabga biriktirmasdan —')}</option>
            {targets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t("O'rniga keladigan o'qituvchi")}{needSuccessor && <span className="field__req" aria-hidden="true"> *</span>}</span>
          <select className="input" value={successor} onChange={(e) => setSuccessor(e.target.value)} disabled={!!initialSuccessor}
            aria-invalid={needSuccessor && !successor}>
            <option value="">{needSuccessor ? t('Tanlang…') : t("— hech kim —")}</option>
            {staff.filter((u) => u.id !== teacher).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
      </div>

      <label className="field">
        <span className="field__label">{t('Sana')}</span>
        <input className="input" type="date" value={since} onChange={(e) => setSince(e.target.value)} />
      </label>
    </Modal>
  )
}
