import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { useInvalidateLearning, type Award } from '@/features/learning/api'
import { errText } from '@/features/portal/ui'
import { api } from '@/lib/api/client'
import type { Paginated, User } from '@/lib/api/types'

export const AWARD_KINDS: { value: Award['kind']; label: string }[] = [
  { value: 'student_of_month', label: "Oyning eng yaxshi o'quvchisi" },
  { value: 'best_lesson', label: 'Eng yaxshi dars' },
  { value: 'top_teacher', label: "Eng faol o'qituvchi" },
  { value: 'custom', label: "Boshqa rag'bat" },
]

const monthName = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function AwardModal({ target, onClose }: {
  target?: { id: string; name: string; kind: Award['kind'] } | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const invalidate = useInvalidateLearning()
  const [kind, setKind] = useState<Award['kind']>(target?.kind ?? 'student_of_month')
  const [recipient, setRecipient] = useState<{ id: string; name: string } | null>(target ? { id: target.id, name: target.name } : null)
  const [search, setSearch] = useState('')
  const [who, setWho] = useState<'student' | 'staff'>(target?.kind === 'student_of_month' || !target ? 'student' : 'staff')
  const [title, setTitle] = useState(AWARD_KINDS.find((k) => k.value === (target?.kind ?? 'student_of_month'))!.label)
  const [reason, setReason] = useState('')
  const [period, setPeriod] = useState(monthName())
  const [busy, setBusy] = useState(false)

  const { data: found } = useQuery({
    queryKey: ['award-search', who, search],
    enabled: !recipient && search.trim().length >= 2,
    queryFn: async () =>
      (await api.get<Paginated<User>>('/accounts/users/', { params: { q: search.trim(), ...(who === 'student' ? { role: 'student' } : {}) } })).data.results,
  })

  const save = async () => {
    if (!recipient) return toast(t('Kimga berilishini tanlang'), 'error')
    setBusy(true)
    try {
      await api.post('/learning/awards/', { recipient: recipient.id, kind, title, reason, period })
      invalidate()
      toast(t("Rag'bat berildi"))
      onClose()
    } catch (err) {
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t("Rag'batlantirish")} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Bekor qilish')}</button><button className="btn btn--primary" disabled={busy} onClick={save}>🏆 {t('Berish')}</button></>}>
      <div className="field">
        <span className="field__label">{t('Kimga')}</span>
        {recipient ? (
          <div className="row row--2"><b>{recipient.name}</b><button type="button" className="btn btn--sm btn--ghost" onClick={() => setRecipient(null)}>{t("O'zgartirish")}</button></div>
        ) : (
          <>
            <div className="chips">
              <button type="button" className={`chip ${who === 'student' ? 'is-on' : ''}`} onClick={() => setWho('student')}>{t("O'quvchi")}</button>
              <button type="button" className={`chip ${who === 'staff' ? 'is-on' : ''}`} onClick={() => setWho('staff')}>{t("O'qituvchi")}</button>
            </div>
            <input className="input" placeholder={t('Ism bo\'yicha qidirish…')} value={search} onChange={(e) => setSearch(e.target.value)} />
            {found && (
              <ul className="pick">
                {found.slice(0, 8).map((u) => (
                  <li key={u.id}><button type="button" className="linklike" onClick={() => setRecipient({ id: u.id, name: u.name })}>{u.name}</button></li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <label className="field">
        <span className="field__label">{t("Rag'bat turi")}</span>
        <select className="input" value={kind} onChange={(e) => { const k = e.target.value as Award['kind']; setKind(k); setTitle(t(AWARD_KINDS.find((x) => x.value === k)!.label)) }}>
          {AWARD_KINDS.map((k) => <option key={k.value} value={k.value}>{t(k.label)}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field__label">{t('Sarlavha')}</span>
        <input className="input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('Sabab / tabrik matni')}</span>
        <textarea className="input" rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={t("Masalan: oktyabr oyida barcha uy vazifalarini 90%+ natija bilan bajargani uchun")} />
      </label>
      <label className="field">
        <span className="field__label">{t('Davr')}</span>
        <input className="input" maxLength={32} value={period} onChange={(e) => setPeriod(e.target.value)} />
      </label>
      <p className="form__note">{t("Telegram ulangan bo'lsa, tabrik xabari avtomatik yuboriladi.")}</p>
    </Modal>
  )
}
