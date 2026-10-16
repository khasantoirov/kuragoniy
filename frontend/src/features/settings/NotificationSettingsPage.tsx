import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useToast } from '@/components/Toast'
import { usePrefs, useSavePrefs, type ChannelKey, type ChannelMap } from '@/features/notifications/api'
import { DEFAULT_SOUNDS, setDeviceSettings, soundFor, useDeviceSettings, type SoundKey } from '@/features/notifications/device'
import { KIND_META } from '@/features/notifications/kinds'
import { popupsAllowed, showPopup } from '@/features/notifications/liveStore'
import { playSound, SOUND_LABELS } from '@/features/notifications/sounds'
import { PageHead } from '@/features/portal/ui'
import { IC } from '@/icons'
import { getPushState, isPushSupported, subscribeToPush, type PushState } from '@/lib/push/subscribe'

const MAX_CUSTOM_BYTES = 300 * 1024
const SOUND_KEYS: SoundKey[] = ['bell', 'short', 'alert', 'signal', 'soft', 'custom', 'none']
const CHANNELS: { key: ChannelKey; label: string }[] = [
  { key: 'app', label: 'Ilova' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'email', label: 'Email' },
]

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className={`qswitch ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)}>
      <span className="qswitch__dot" />
    </button>
  )
}

export function NotificationSettingsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const device = useDeviceSettings()
  const prefs = usePrefs()
  const save = useSavePrefs()
  const [matrix, setMatrix] = useState<ChannelMap | null>(null)
  const [pushState, setPushState] = useState<PushState>('unsubscribed')
  const [pushBusy, setPushBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (prefs.data && !matrix) setMatrix(prefs.data.channels)
  }, [prefs.data, matrix])

  useEffect(() => {
    getPushState().then(setPushState).catch(() => {})
  }, [])

  const togglePopup = async (on: boolean) => {
    if (!on) return setDeviceSettings({ popup: false })
    if (typeof Notification === 'undefined') return toast(t("Bu brauzer bildirishnomalarni qo'llab-quvvatlamaydi"), 'error')
    const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    if (perm !== 'granted') return toast(t('Bildirishnomalar bloklangan — brauzer sozlamalaridan ruxsat bering.'), 'error')
    setDeviceSettings({ popup: true })
  }

  const sendTest = () => {
    if (device.sound) playSound(soundFor('tizim'))
    if (!popupsAllowed()) {
      toast(t("Brauzer ruxsat bermagan — avval «Qalqib chiquvchi bildirishnomalar»ni yoqing."), 'error')
      return
    }
    showPopup(t('Sinov bildirishnomasi'), t('Bildirishnomalar ishlayapti.'))
  }

  const onCustom = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('audio/')) return toast(t('Faqat audio fayl'), 'error')
    if (f.size > MAX_CUSTOM_BYTES) return toast(t('Fayl 300 KB dan katta'), 'error')
    const reader = new FileReader()
    reader.onload = () => {
      const ok = setDeviceSettings({ custom: String(reader.result), customName: f.name })
      if (!ok) return toast(t("Brauzer xotirasiga sig'madi — kichikroq fayl tanlang"), 'error')
      toast(t("Ovoz qo'shildi"))
      playSound('custom')
    }
    reader.readAsDataURL(f)
  }

  const enablePush = async () => {
    setPushBusy(true)
    try {
      await subscribeToPush()
      setPushState('subscribed')
      toast(t('Push bildirishnomalar yoqildi'))
    } catch (err) {
      toast(t(err instanceof Error ? err.message : "Amalni bajarib bo'lmadi"), 'error')
      setPushState(await getPushState())
    } finally {
      setPushBusy(false)
    }
  }

  const setCell = (kind: string, ch: ChannelKey, v: boolean) =>
    setMatrix((m) => (m ? { ...m, [kind]: { ...m[kind], [ch]: v } } : m))

  const onSave = async () => {
    if (!matrix) return
    try {
      const res = await save.mutateAsync({ channels: matrix })
      setMatrix(res.channels)
      toast(t('Saqlandi'))
    } catch {
      toast(t("Saqlab bo'lmadi"), 'error')
    }
  }

  const data = prefs.data
  const dirty = !!(matrix && data && JSON.stringify(matrix) !== JSON.stringify(data.channels))

  return (
    <div className="setpg">
      <PageHead title={t('Bildirishnomalar')} sub={t('Xabarlarni qanday va qayerdan olasiz')} />

      <section className="panel">
        <h3 className="panel__title">{t('Brauzer bildirishnomalari')}</h3>
        <p className="prose prose--note">{t('Qalqib chiquvchi xabarlar va ovoz — faqat shu qurilmada saqlanadi')}</p>

        <div className="setrow">
          <span className="setrow__txt">
            <span className="setrow__t">{t('Qalqib chiquvchi bildirishnomalar')}</span>
            <span className="setrow__s">{t("Tab fonda bo'lganda ham xabar ko'rsatiladi")}</span>
          </span>
          <Switch on={device.popup && popupsAllowed()} onChange={togglePopup} label={t('Qalqib chiquvchi bildirishnomalar')} />
        </div>
        <div className="setrow setrow--tint">
          <span className="setrow__txt">
            <span className="setrow__t">{t('Ishlayotganini tekshirish')}</span>
            <span className="setrow__s">{t("Hozir haqiqiy bildirishnoma yuboradi. Agar oyna chiqmasa — muammo ilovada emas, operatsion tizim yoki brauzer sozlamalarida.")}</span>
          </span>
          <button type="button" className="btn btn--sm" onClick={sendTest}>{t('Sinov yuborish')}</button>
        </div>
        <p className="setnote">
          {t("Telefonda xabar ilova ochiq turganda ko'rsatiladi. Ilova yopiq bo'lganda ham olish uchun pastdagi «Push» xizmatini yoqing (iPhone'da sayt «Bosh ekranga qo'shilgan» bo'lishi kerak).")}
        </p>

        <div className="setrow">
          <span className="setrow__txt">
            <span className="setrow__t">{t('Ovoz')}</span>
            <span className="setrow__s">{t('Har bir bildirishnomada qisqa ohang eshitiladi')}</span>
          </span>
          <Switch on={device.sound} onChange={(v) => setDeviceSettings({ sound: v })} label={t('Ovoz')} />
        </div>
        <div className="setrow">
          <span className="setrow__t">{t('Balandlik')}</span>
          <span className="setvol">
            {IC.volume}
            <input type="range" min={0} max={100} step={5} value={Math.round(device.volume * 100)} disabled={!device.sound}
              onChange={(e) => setDeviceSettings({ volume: Number(e.target.value) / 100 })} aria-label={t('Balandlik')} />
            <b>{Math.round(device.volume * 100)}%</b>
          </span>
        </div>

        <p className="setsub">{t("Bildirishnoma turi bo'yicha ovoz")}</p>
        {(data?.kinds ?? []).map((k) => {
          const meta = KIND_META[k.key]
          const current = device.sounds[k.key] ?? DEFAULT_SOUNDS[k.key]
          return (
            <div className="setrow setrow--sound" key={k.key}>
              <span className="setrow__kind"><span className="kdot" style={{ background: meta.tone }} />{t(meta.label)}</span>
              <span className="setsound">
                <select className="input input--sm" value={current} disabled={!device.sound}
                  onChange={(e) => setDeviceSettings({ sounds: { ...device.sounds, [k.key]: e.target.value as SoundKey } })}>
                  {SOUND_KEYS.filter((s) => s !== 'custom' || device.custom).map((s) => <option key={s} value={s}>{t(SOUND_LABELS[s])}</option>)}
                </select>
                <button type="button" className="icon-btn" disabled={!device.sound || current === 'none'} onClick={() => playSound(current)}
                  aria-label={t('Eshitib ko\'rish')}>{IC.play}</button>
              </span>
            </div>
          )
        })}

        <p className="setsub">{t("O'z ovozingiz")}</p>
        <div className="setrow">
          <span className="setrow__s">
            {device.custom
              ? `${t('Qo\'shilgan')}: ${device.customName ?? ''}`
              : t("Audio fayl qo'shing (300 KB gacha) va istalgan tur uchun tanlang")}
          </span>
          <span className="tgbox__acts">
            {device.custom && <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDeviceSettings({ custom: null, customName: null })}>{t("O'chirish")}</button>}
            <button type="button" className="btn btn--sm" onClick={() => fileRef.current?.click()}>{IC.upload} {t("Fayl qo'shish")}</button>
          </span>
          <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onCustom} />
        </div>
      </section>

      {isPushSupported() && (
        <section className="panel">
          <h3 className="panel__title">{t('Push bildirishnomalar')}</h3>
          <div className="setrow">
            <span className="setrow__s">
              {pushState === 'subscribed'
                ? t("Yoqilgan — ilova yopiq bo'lsa ham e'lonlar shu qurilmaga keladi.")
                : pushState === 'denied'
                  ? t('Bildirishnomalar bloklangan — brauzer sozlamalaridan ruxsat bering.')
                  : t("Ilova yopiq bo'lsa ham bildirishnoma olish uchun push'ni yoqing.")}
            </span>
            {pushState !== 'subscribed' && pushState !== 'denied' && (
              <button type="button" className="btn btn--sm btn--primary" onClick={enablePush} disabled={pushBusy}>{IC.bell} {t('Push yoqish')}</button>
            )}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="thead">
          <span>
            <h3 className="panel__title">{t('Bildirishnoma sozlamalari')}</h3>
            <p className="prose prose--note">{t('Qaysi hodisalar haqida qayerdan xabar olishni boshqaring')}</p>
          </span>
          <button type="button" className="btn btn--primary" onClick={onSave} disabled={!dirty || save.isPending}>{t('Saqlash')}</button>
        </div>
        {data && !data.telegram_linked && (
          <p className="setnote">
            {t('Telegram ulanmagan — Telegram ustuni ishlashi uchun')} <Link to="/settings/integrations">{t('Integratsiyalar')}</Link> {t("bo'limidan ulang.")}
          </p>
        )}
        {data && matrix && (
          <div className="nmatrix" role="table">
            <div className="nmatrix__row nmatrix__head" role="row">
              <span role="columnheader">{t('Hodisa')}</span>
              {CHANNELS.map((c) => <span key={c.key} role="columnheader">{t(c.label)}</span>)}
            </div>
            {data.kinds.map((k) => (
              <div className="nmatrix__row" role="row" key={k.key}>
                <span className="nmatrix__ev" role="cell">
                  <span className="nmatrix__t">{t(k.label)}</span>
                  <span className="nmatrix__s">{t(k.desc)}</span>
                </span>
                {CHANNELS.map((c) => {
                  const unavailable = (c.key === 'email' && !data.email_enabled) || (c.key === 'telegram' && !data.telegram_linked)
                  return (
                    <span key={c.key} role="cell" className="nmatrix__cell" data-label={t(c.label)}>
                      <Switch on={!!matrix[k.key]?.[c.key] && !unavailable} disabled={unavailable}
                        onChange={(v) => setCell(k.key, c.key, v)} label={`${t(k.label)} — ${t(c.label)}`} />
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        )}
        {data && !data.email_enabled && <p className="setnote">{t("Email ustuni: hisobingizda email ko'rsatilmagan yoki platformada email yuborish sozlanmagan.")}</p>}
      </section>
    </div>
  )
}
