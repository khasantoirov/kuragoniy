import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/Avatar'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'

import { fieldErrors, nameParts, ONE_WORD } from './names'
import { shrinkToAvatar } from './shrink'

type Errors = Partial<Record<'first_name' | 'last_name' | 'bday' | 'phone', string>>

/** Profil sozlamalari: ism (bitta so'z, majburiy), familiya (ixtiyoriy),
 *  tug'ilgan sana va telefon (majburiy). O'quvchining ismi sinf
 *  ro'yxatidan keladi — u o'zgartirmaydi. */
export function ProfileCard({ onSaved }: { onSaved?: () => void } = {}) {
  const { t } = useTranslation()
  const { user, refreshMe } = useAuth()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const isStudent = user?.role === 'student'

  const [first0, last0] = nameParts(user)
  const [first, setFirst] = useState(first0)
  const [last, setLast] = useState(last0)
  const [bday, setBday] = useState(user?.bday ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.photo ?? null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoCleared, setPhotoCleared] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Errors>({})

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!/^image\//.test(f.type)) return toast(t('Faqat rasm fayli'), 'error')
    try {
      const shrunk = await shrinkToAvatar(f)
      setPhotoFile(shrunk)
      setPhotoCleared(false)
      setPhotoPreview(URL.createObjectURL(shrunk))
    } catch (err) {
      toast(t(err instanceof Error ? err.message : "Rasm o'qilmadi"), 'error')
    }
  }

  const onClearPhoto = () => {
    setPhotoFile(null)
    setPhotoCleared(true)
    setPhotoPreview(null)
  }

  /** The same rules as the server (accounts/profile.py), said before the round trip. */
  const check = (): Errors => {
    if (isStudent) return {}
    const e: Errors = {}
    const f = first.trim()
    if (!f) e.first_name = t('Ismni kiriting.')
    else if (/\s/.test(f)) e.first_name = t(ONE_WORD)
    if (last.trim().split(/\s+/).length > 2) e.last_name = t("Familiyani to'g'ri yozing: faqat harflar.")
    if (!bday) e.bday = t("Tug'ilgan sanani kiriting.")
    if (!phone.trim()) e.phone = t('Telefon raqamni kiriting.')
    return e
  }

  const submit = async () => {
    const local = check()
    setErrors(local)
    if (Object.keys(local).length) return
    setBusy(true)
    const fields: Record<string, string> = isStudent
      ? { ...(bday ? { bday } : {}), phone: phone.trim() }
      : { first_name: first.trim(), last_name: last.trim(), bday, phone: phone.trim() }
    try {
      if (photoFile) {
        const form = new FormData()
        Object.entries(fields).forEach(([k, v]) => form.append(k, v))
        form.append('photo', photoFile)
        await api.patch('/accounts/me/', form)
      } else {
        await api.patch('/accounts/me/', {
          ...fields,
          ...(isStudent && !bday ? { bday: null } : {}),
          ...(photoCleared ? { photo: null } : {}),
        })
      }
      await refreshMe()
      setPhotoFile(null)
      setPhotoCleared(false)
      toast(t('Profil saqlandi'))
      onSaved?.()
    } catch (err) {
      const server = fieldErrors(err)
      setErrors(Object.fromEntries(Object.entries(server).map(([k, v]) => [k, t(v)])) as Errors)
      toast(t('Saqlashda xatolik'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const err = (k: keyof Errors) => errors[k] && <span className="field__err" role="alert">{errors[k]}</span>
  const req = <span className="field__req" aria-hidden="true">*</span>

  return (
    <div className="panel">
      <h3 className="panel__title">{t("Profil ma'lumotlari")}</h3>
      <div className="pf">
        <div className="pf__avwrap">
          {photoPreview ? (
            <img className="pf__av pf__av--img" src={photoPreview} alt="" />
          ) : (
            <Avatar name={isStudent ? user?.name ?? '' : `${first} ${last}`.trim()} photo={null} className="pf__av" />
          )}
          <div className="pf__avacts">
            <label className="btn btn--sm" htmlFor="pf-file">{t('Surat tanlash')}</label>
            <input ref={fileRef} type="file" id="pf-file" accept="image/*" hidden onChange={onPickPhoto} />
            {photoPreview && (
              <button className="btn btn--sm btn--ghost" type="button" onClick={onClearPhoto}>
                {t('Olib tashlash')}
              </button>
            )}
          </div>
        </div>

        {isStudent ? (
          <label className="field">
            <span className="field__label">{t('Ism familiya')}</span>
            <input className="input" value={user?.name ?? ''} disabled />
          </label>
        ) : (
          <div className="row row--2">
            <label className="field">
              <span className="field__label">{t('Ism')} {req}</span>
              <input className="input" value={first} autoComplete="given-name" aria-invalid={!!errors.first_name}
                onChange={(e) => {
                  const v = e.target.value
                  setFirst(v)
                  setErrors((x) => ({ ...x, first_name: /\s/.test(v.trim()) ? t(ONE_WORD) : undefined }))
                }} placeholder="Hasan" />
              {err('first_name')}
            </label>
            <label className="field">
              <span className="field__label">{t('Familiya')} <small className="muted">({t('ixtiyoriy')})</small></span>
              <input className="input" value={last} autoComplete="family-name" aria-invalid={!!errors.last_name}
                onChange={(e) => setLast(e.target.value)} placeholder="Toirov" />
              {err('last_name')}
            </label>
          </div>
        )}
        <label className="field">
          <span className="field__label">{t("Tug'ilgan kun")} {!isStudent && req}</span>
          <input className="input" type="date" value={bday ?? ''} aria-invalid={!!errors.bday}
            max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBday(e.target.value)} />
          {err('bday')}
        </label>
        <label className="field">
          <span className="field__label">{t('Telefon raqam')} {!isStudent && req}</span>
          <input className="input" type="tel" value={phone} autoComplete="tel" aria-invalid={!!errors.phone}
            onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
          {err('phone')}
        </label>
        <label className="field">
          <span className="field__label">{t('Email')}</span>
          <input className="input" value={user?.email ?? ''} disabled />
        </label>

        <div className="panel__acts">
          <button className="btn btn--primary" onClick={submit} disabled={busy}>{t('Saqlash')}</button>
        </div>
      </div>
    </div>
  )
}
