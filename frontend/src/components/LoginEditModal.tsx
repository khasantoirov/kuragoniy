import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api/client'

/** Someone's login, changed by whoever manages them — a staff member's in
 * Boshqaruv, a pupil's in O'quvchilar. The password stays; the old login
 * keeps working too and the sign-in says which one is new, so nobody is
 * locked out before they've been told. */
export function LoginEditModal({ name, login, url, field = 'login', onSaved, onClose }: {
  name: string
  login: string
  /** the set-login endpoint */
  url: string
  /** what that endpoint calls the new login */
  field?: 'login' | 'username'
  onSaved: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [value, setValue] = useState(login)
  const [error, setError] = useState('')
  const save = useMutation({
    mutationFn: async () => (await api.post(url, { [field]: value })).data,
    onSuccess: () => {
      onSaved()
      toast(t("Login o'zgartirildi"))
      onClose()
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: Record<string, string[] | string> } }).response?.data
      const first = data && Object.values(data)[0]
      setError(t(Array.isArray(first) ? first[0] : first || "Amalni bajarib bo'lmadi"))
    },
  })

  return (
    <Modal
      title={t("Loginni o'zgartirish")}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="btn btn--primary" disabled={save.isPending || value.trim().length < 3}
          onClick={() => { setError(''); save.mutate() }}>{t('Saqlash')}</button>
      </>}
    >
      <p className="prose prose--note">{name} — {t("parol o'zgarmaydi. Eski login ham ishlayveradi, kirganda yangisi aytiladi.")}</p>
      <label className="field">
        <span className="field__label">{t('Login')}</span>
        <input className="input" autoFocus value={value} autoCapitalize="none" spellCheck={false}
          onChange={(e) => setValue(e.target.value.toLowerCase())} placeholder={t('Login')} />
      </label>
      {error && <p className="form__note form__note--err" role="alert">{error}</p>}
    </Modal>
  )
}
