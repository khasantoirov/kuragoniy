import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { fieldErrors, nameParts, ONE_WORD } from '@/features/profile/names'
import { api } from '@/lib/api/client'
import type { User } from '@/lib/api/types'

type Field = 'first_name' | 'last_name' | 'phone' | 'bday' | 'login'

/** The developer corrects anyone's details: first name, surname, phone,
 *  birth date and login (POST /accounts/users/<id>/edit-profile/). Only
 *  what changed is sent; a new login leaves the old one working, as in
 *  "Loginni o'zgartirish". */
export function EditPersonModal({ person, onClose }: { person: User; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [first0, last0] = nameParts(person)
  const start: Record<Field, string> = {
    first_name: first0, last_name: last0, phone: person.phone ?? '', bday: person.bday ?? '', login: person.username ?? '',
  }
  const [v, setV] = useState(start)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  // An account from before the split has no first_name yet: the guessed
  // parts are then sent even unchanged, so saving stores them.
  const unsplit = !person.first_name

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = k === 'login' ? e.target.value.toLowerCase() : e.target.value
    setV((x) => ({ ...x, [k]: value }))
    if (k === 'first_name') setErrors((x) => ({ ...x, first_name: /\s/.test(value.trim()) ? t(ONE_WORD) : undefined }))
  }

  const changed = (Object.keys(v) as Field[]).filter(
    (k) => v[k].trim() !== start[k].trim() || (unsplit && (k === 'first_name' || k === 'last_name')))

  const save = useMutation({
    mutationFn: async () =>
      (await api.post<User>(`/accounts/users/${person.id}/edit-profile/`,
        Object.fromEntries(changed.map((k) => [k, v[k].trim()])))).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast(t("Ma'lumotlar saqlandi"))
      onClose()
    },
    onError: (err: unknown) => {
      const server = fieldErrors(err)
      setErrors(Object.fromEntries(Object.entries(server).map(([k, m]) => [k, t(m)])))
      if (!Object.keys(server).some((k) => k in start)) toast(t(Object.values(server)[0] || "Amalni bajarib bo'lmadi"), 'error')
    },
  })

  const submit = () => {
    if (!v.first_name.trim()) return setErrors({ first_name: t('Ismni kiriting.') })
    if (/\s/.test(v.first_name.trim())) return setErrors({ first_name: t(ONE_WORD) })
    setErrors({})
    save.mutate()
  }

  const err = (k: Field) => errors[k] && <span className="field__err" role="alert">{errors[k]}</span>

  return (
    <Modal
      title={t("Ma'lumotlarni tahrirlash")}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={save.isPending || !changed.length} onClick={submit}>{t('Saqlash')}</button>
      </>}
    >
      <p className="prose prose--note">{person.name || person.email} — {t("parol o'zgarmaydi. Login o'zgarsa, eskisi ham ishlayveradi.")}</p>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Ism')} <span className="field__req" aria-hidden="true">*</span></span>
          <input className="input" autoFocus value={v.first_name} onChange={set('first_name')} aria-invalid={!!errors.first_name} placeholder="Hasan" />
          {err('first_name')}
        </label>
        <label className="field">
          <span className="field__label">{t('Familiya')} <small className="muted">({t('ixtiyoriy')})</small></span>
          <input className="input" value={v.last_name} onChange={set('last_name')} aria-invalid={!!errors.last_name} placeholder="Toirov" />
          {err('last_name')}
        </label>
      </div>
      <div className="row row--2">
        <label className="field">
          <span className="field__label">{t('Telefon raqam')}</span>
          <input className="input" type="tel" value={v.phone} onChange={set('phone')} aria-invalid={!!errors.phone} placeholder="+998 90 123 45 67" />
          {err('phone')}
        </label>
        <label className="field">
          <span className="field__label">{t("Tug'ilgan sana")}</span>
          <input className="input" type="date" value={v.bday} max={new Date().toISOString().slice(0, 10)} onChange={set('bday')} aria-invalid={!!errors.bday} />
          {err('bday')}
        </label>
      </div>
      <label className="field">
        <span className="field__label">{t('Login')}</span>
        <input className="input" value={v.login} autoCapitalize="none" spellCheck={false} onChange={set('login')} aria-invalid={!!errors.login} />
        {err('login')}
      </label>
    </Modal>
  )
}
