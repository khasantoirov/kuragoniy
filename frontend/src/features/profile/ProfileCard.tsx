import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/Avatar'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'

import { shrinkToAvatar } from './shrink'

/** Profil sozlamalari — Sozlamalar sahifasidagi kartochka sifatida.
 *  Ilgari alohida /profile sahifasi edi; bitta forma uchun butun
 *  sahifa ajratish o'rniga qolgan sozlamalar bilan bir joyda turadi. */
export function ProfileCard() {
  const { t } = useTranslation()
  const { user, refreshMe } = useAuth()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(user?.name ?? '')
  const [bday, setBday] = useState(user?.bday ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.photo ?? null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoCleared, setPhotoCleared] = useState(false)
  const [busy, setBusy] = useState(false)

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

  const submit = async () => {
    if (!name.trim()) return toast(t('Ismni kiriting'), 'error')
    setBusy(true)
    try {
      if (photoFile) {
        const form = new FormData()
        form.append('name', name.trim())
        if (bday) form.append('bday', bday)
        form.append('phone', phone.trim())
        form.append('photo', photoFile)
        await api.patch('/accounts/me/', form)
      } else {
        await api.patch('/accounts/me/', {
          name: name.trim(),
          bday: bday || null,
          phone: phone.trim(),
          ...(photoCleared ? { photo: null } : {}),
        })
      }
      await refreshMe()
      setPhotoFile(null)
      setPhotoCleared(false)
      toast(t('Profil saqlandi'))
    } catch {
      toast(t('Saqlashda xatolik'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <h3 className="panel__title">{t("Profil ma'lumotlari")}</h3>
      <div className="pf">
        <div className="pf__avwrap">
          {photoPreview ? (
            <img className="pf__av pf__av--img" src={photoPreview} alt="" />
          ) : (
            <Avatar name={name} photo={null} className="pf__av" />
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

        <label className="field">
          <span className="field__label">{t('Ism familiya')}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Ism familiya')} />
        </label>
        <label className="field">
          <span className="field__label">{t("Tug'ilgan kun")}</span>
          <input className="input" type="date" value={bday ?? ''} onChange={(e) => setBday(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('Telefon raqam')}</span>
          <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
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
