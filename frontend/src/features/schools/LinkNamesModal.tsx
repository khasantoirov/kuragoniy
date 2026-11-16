import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errText } from '@/features/portal/ui'
import { api } from '@/lib/api/client'

import { useSchools, useSchoolsMutation, type UnlinkedName } from './api'

/** Map free-text spellings (from journals/timetables) onto partner schools. */
export function LinkNamesModal({ rows, onClose }: { rows: UnlinkedName[]; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { data: schools } = useSchools()
  const [choice, setChoice] = useState<Record<string, string>>({})
  const link = useSchoolsMutation(async (body: { variants: string[]; school?: number; new_name?: string }) =>
    (await api.post<{ classes: number; slots?: number; teachers_added: number }>('/schools/link/', body)).data)

  const apply = async (row: UnlinkedName) => {
    const pick = choice[row.text] ?? ''
    if (!pick) return toast(t('Maktabni tanlang'), 'error')
    try {
      const res = await link.mutateAsync(pick === 'new' ? { variants: row.variants } : { variants: row.variants, school: Number(pick) })
      toast(`${t('Biriktirildi')}: ${res.classes} ${t('ta sinf')}, ${res.slots ?? 0} ${t('ta jadval katagi')}, ${res.teachers_added} ${t("ta o'qituvchi")}`)
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <Modal title={t('Maktab nomlarini moslashtirish')} onClose={onClose}
      footer={<button className="btn btn--primary" onClick={onClose}>{t('Tayyor')}</button>}>
      <p className="prose prose--note">
        {t("O'qituvchilar jurnal va jadvalda maktab nomini turlicha yozgan. Har bir nomni to'g'ri hamkor maktabga biriktiring — jurnal va jadvaldagi bu yozuvlar maktabning rasmiy nomiga almashtiriladi, xato yozilishi saqlanmaydi.")}
      </p>
      {!rows.length && <p className="prose">✓ {t('Hamma nomlar biriktirilgan.')}</p>}
      <ul className="linklist">
        {rows.map((r) => (
          <li key={r.text} className="linklist__row">
            <div className="linklist__info">
              <b>{r.text}</b>
              {r.variants.length > 1 && <small>{t('yana')}: {r.variants.slice(1).join(' · ')}</small>}
              <small>{r.classes} {t('ta sinf')} · {r.slots} {t('ta jadval katagi')} · {r.teachers.join(', ')}</small>
            </div>
            <div className="linklist__acts">
              <select className="input input--sm" value={choice[r.text] ?? ''} onChange={(e) => setChoice({ ...choice, [r.text]: e.target.value })}>
                <option value="">{t('Maktabni tanlang…')}</option>
                {schools?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="new">+ {t('Shu nom bilan yangi maktab')}</option>
              </select>
              <button className="btn btn--sm btn--primary" disabled={link.isPending} onClick={() => apply(r)}>{t('Biriktirish')}</button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
