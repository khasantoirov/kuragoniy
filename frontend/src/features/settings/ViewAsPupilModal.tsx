import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { useClassStudents, useTeacherClasses } from '@/features/learning/api'
import { errText } from '@/features/portal/ui'
import { api } from '@/lib/api/client'
import { useViewAs, type ViewedPupil } from '@/lib/viewAs'

/** Ko'rish rejimi → O'quvchi: pick a class, then a pupil with an account,
 * and the student portal opens as that pupil sees it (read-only). */
export function ViewAsPupilModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const start = useViewAs((s) => s.start)
  const { data: classes, isLoading } = useTeacherClasses()
  const [classId, setClassId] = useState<number | null>(null)
  const { data: roster, isFetching } = useClassStudents(classId)
  const [busy, setBusy] = useState(false)
  const pupils = (roster?.accounts ?? []).filter((a) => a.approved && a.is_active)

  const open = async (id: string) => {
    setBusy(true)
    try {
      const pupil = (await api.post<ViewedPupil>(`/learning/students/${id}/view-as/`)).data
      queryClient.removeQueries({ queryKey: ['student'] })  // nobody else's page left in the cache
      start(pupil)
      navigate('/s')
    } catch (err) {
      toast(t(errText(err)), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal title={t("O'quvchi ko'rinishi")} onClose={onClose}
      footer={<button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>}>
      <p className="prose prose--note">
        {t("Platformani tanlangan o'quvchi qanday ko'rishini ochasiz: uning darslari, vazifalari, natijalari va reytingi. Faqat ko'rish — o'quvchi nomidan hech narsa o'zgartirilmaydi.")}
      </p>
      {isLoading ? <Skeleton lines={2} /> : (
        <label className="field">
          <span className="field__label">{t('Sinf')}</span>
          <select className="input" value={classId ?? ''} onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('Sinfni tanlang')}</option>
            {classes?.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.school || c.teacher_name}</option>)}
          </select>
        </label>
      )}
      {classId != null && (isFetching && !roster ? <Skeleton lines={3} /> : pupils.length ? (
        <ul className="viewas-pick">
          {pupils.map((p) => (
            <li key={p.id}>
              <button type="button" className="viewas-pick__b" disabled={busy} onClick={() => open(p.id)}>
                <b>{p.name}</b> <span className="mono muted">{p.username}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="prose prose--note">{t("Bu sinfda hali platforma hisobi bor o'quvchi yo'q.")}</p>
      ))}
    </Modal>
  )
}
