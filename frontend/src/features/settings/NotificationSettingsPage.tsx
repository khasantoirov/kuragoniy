import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
]

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className={`qswitch ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)}>
      <span className="qswitch__dot" />
    </button>
  )
}

/** One settings line: a coloured icon tile, the name (and a line under
 *  it), the control at the right end — the same idiom as phone settings. */
function Row({ icon, tone, title, sub, children, wrap }: {
  icon: ReactNode; tone: string; title: ReactNode; sub?: ReactNode; children?: ReactNode; wrap?: boolean
}) {
  return (
    <div className={`srow ${wrap ? 'srow--wrap' : ''}`}>
      <span className="srow__ic" style={{ '--tone': tone } as CSSProperties}>{icon}</span>
      <span className="srow__txt">
        <span className="srow__t">{title}</span>
        {sub && <span className="srow__s">{sub}</span>}
      </span>
      {children && <span className="srow__end">{children}</span>}
    </div>
  )
}

type SaveState = 'idle' | 'saving' | 'saved'

export function NotificationSettingsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const device = useDeviceSettings()
  const prefs = usePrefs()
  const save = useSavePrefs()
  const [matrix, setMatrix] = useState<ChannelMap | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [pushState, setPushState] = useState<PushState>('unsubscribed')
  const [pushBusy, setPushBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (prefs.data && !matrix) setMatrix(prefs.data.channels)
  }, [prefs.data, matrix])

  useEffect(() => {
    getPushState().then(setPushState).catch(() => {})
  }, [])

  // The channel switches save themselves (like the device's ones above):
  // a short pause gathers quick taps into one request.
  const pending = useRef<ChannelMap | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const saveRef = useRef(save.mutateAsync)
  saveRef.current = save.mutateAsync
  const serverRef = useRef<ChannelMap | null>(null)
  serverRef.current = prefs.data?.channels ?? null

  const flush = async () => {
    const body = pending.current
    if (!body) return
    pending.current = null
    try {
      const res = await saveRef.current({ channels: body })
      if (!pending.current) {
        setMatrix(res.channels)
        setSaveState('saved')
      }
    } catch {
      if (!pending.current) {
        setMatrix(serverRef.current)
        setSaveState('idle')
      }
      toast(t("Saqlab bo'lmadi"), 'error')
    }
  }

  useEffect(() => () => {
    // leaving the page right after a tap: still saved
    window.clearTimeout(timer.current)
    if (pending.current) void saveRef.current({ channels: pending.current }).catch(() => {})
  }, [])

  const setCell = (kind: string, ch: ChannelKey, v: boolean) => {
    if (!matrix) return
    const next = { ...matrix, [kind]: { ...matrix[kind], [ch]: v } }
    setMatrix(next)
    pending.current = next
    setSaveState('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), 500)
  }

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

  const data = prefs.data
  const vol = Math.round(device.volume * 100)

  return (
    <div className="setpg npref">
      <PageHead title={t('Bildirishnomalar')} sub={t('Xabarlarni qanday va qayerdan olasiz')} />

      <section className="panel">
        <h3 className="panel__title">{t('Brauzer bildirishnomalari')}</h3>
        <p className="prose prose--note">{t('Qalqib chiquvchi xabarlar va ovoz — faqat shu qurilmada saqlanadi')}</p>
        <div className="slist">
          <Row icon={IC.bell} tone="#f59e0b" title={t('Qalqib chiquvchi bildirishnomalar')} sub={t("Tab fonda bo'lganda ham xabar ko'rsatiladi")}>
            <Switch on={device.popup && popupsAllowed()} onChange={togglePopup} label={t('Qalqib chiquvchi bildirishnomalar')} />
          </Row>
          {isPushSupported() && (
            <Row icon={IC.smartphone} tone="#10b981" title={t('Push bildirishnomalar')}
              sub={pushState === 'subscribed'
                ? t("Yoqilgan — ilova yopiq bo'lsa ham e'lonlar shu qurilmaga keladi.")
                : pushState === 'denied'
                  ? t('Bildirishnomalar bloklangan — brauzer sozlamalaridan ruxsat bering.')
                  : t("Ilova yopiq bo'lsa ham bildirishnoma olish uchun push'ni yoqing.")}>
              {pushState === 'subscribed'
                ? <span className="spill">{IC.check} {t('Yoqilgan')}</span>
                : pushState !== 'denied' && (
                  <button type="button" className="btn btn--sm btn--primary" onClick={enablePush} disabled={pushBusy}>{t('Yoqish')}</button>
                )}
            </Row>
          )}
          <Row icon={IC.play} tone="#6366f1" title={t('Sinov bildirishnomasi')}
            sub={t('Oyna chiqmasa, sababi operatsion tizim yoki brauzer sozlamalarida')}>
            <button type="button" className="btn btn--sm" onClick={sendTest}>{t('Yuborish')}</button>
          </Row>
        </div>
        {pushState !== 'subscribed' && (
          <p className="sfoot">
            {IC.info}
            <span>{t("Telefonda xabar ilova ochiq turganda ko'rsatiladi. Ilova yopiq bo'lganda ham olish uchun «Push»ni yoqing (iPhone'da avval saytni «Bosh ekranga qo'shing»).")}</span>
          </p>
        )}
      </section>

      <section className="panel">
        <h3 className="panel__title">{t('Ovoz')}</h3>
        <p className="prose prose--note">{t('Har bir bildirishnomada qisqa ohang eshitiladi')}</p>
        <div className="slist">
          <Row icon={IC.volume} tone="#ef4466" title={t('Ovoz')}>
            <Switch on={device.sound} onChange={(v) => setDeviceSettings({ sound: v })} label={t('Ovoz')} />
          </Row>
          <div className={`srow srow--vol ${device.sound ? '' : 'is-off'}`}>
            <span className="srow__t">{t('Balandlik')}</span>
            <input type="range" min={0} max={100} step={5} value={vol} disabled={!device.sound}
              style={{ '--val': `${vol}%` } as CSSProperties}
              onChange={(e) => setDeviceSettings({ volume: Number(e.target.value) / 100 })} aria-label={t('Balandlik')} />
            <b>{vol}%</b>
          </div>
        </div>

        <p className="slabel">{t("Bildirishnoma turi bo'yicha ovoz")}</p>
        <div className={`slist ${device.sound ? '' : 'is-off'}`}>
          {(data?.kinds ?? []).map((k) => {
            const meta = KIND_META[k.key]
            const current = device.sounds[k.key] ?? DEFAULT_SOUNDS[k.key]
            return (
              <Row key={k.key} icon={IC[meta.icon]} tone={meta.tone} title={t(meta.label)}>
                <select className="input input--sm srow__sel" value={current} disabled={!device.sound} aria-label={`${t(meta.label)} — ${t('Ovoz')}`}
                  onChange={(e) => setDeviceSettings({ sounds: { ...device.sounds, [k.key]: e.target.value as SoundKey } })}>
                  {SOUND_KEYS.filter((s) => s !== 'custom' || device.custom).map((s) => <option key={s} value={s}>{t(SOUND_LABELS[s])}</option>)}
                </select>
                <button type="button" className="icon-btn srow__play" disabled={!device.sound || current === 'none'} onClick={() => playSound(current)}
                  aria-label={t('Eshitib ko\'rish')}>{IC.play}</button>
              </Row>
            )
          })}
          <Row icon={IC.upload} tone="#8b5cf6" wrap title={t("O'z ovozingiz")}
            sub={device.custom ? `${t('Qo\'shilgan')}: ${device.customName ?? ''}` : t("Audio fayl qo'shing (300 KB gacha) va istalgan tur uchun tanlang")}>
            {device.custom && <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDeviceSettings({ custom: null, customName: null })}>{t("O'chirish")}</button>}
            <button type="button" className="btn btn--sm" onClick={() => fileRef.current?.click()}>{t("Fayl qo'shish")}</button>
          </Row>
          <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onCustom} />
        </div>
      </section>

      <section className="panel">
        <div className="thead">
          <span>
            <h3 className="panel__title">{t('Bildirishnoma sozlamalari')}</h3>
            <p className="prose prose--note">{t('Qaysi hodisalar haqida qayerdan xabar olishni boshqaring')}</p>
          </span>
          <span className={`savestate ${saveState === 'idle' ? '' : 'is-shown'}`} aria-live="polite">
            {saveState === 'saving' ? t('Saqlanmoqda…') : saveState === 'saved' ? <>{IC.check} {t('Saqlandi')}</> : t("O'zgarishlar avtomatik saqlanadi")}
          </span>
        </div>
        {data && !data.telegram_linked && (
          <p className="sfoot sfoot--warn">
            {IC.telegram}
            <span>{t('Telegram ulanmagan — Telegram ustuni ishlashi uchun')} <Link to="/settings/integrations">{t('Integratsiyalar')}</Link> {t("bo'limidan ulang.")}</span>
          </p>
        )}
        {data && matrix && (
          <div className="nmatrix" role="table">
            <div className="nmatrix__row nmatrix__head" role="row">
              <span role="columnheader">{t('Hodisa')}</span>
              {CHANNELS.map((c) => <span key={c.key} role="columnheader">{t(c.label)}</span>)}
            </div>
            {data.kinds.map((k) => {
              const meta = KIND_META[k.key]
              return (
                <div className="nmatrix__row" role="row" key={k.key}>
                  <span className="nmatrix__ev" role="cell">
                    <span className="srow__ic nmatrix__ic" style={{ '--tone': meta?.tone ?? 'var(--pick)' } as CSSProperties}>{meta ? IC[meta.icon] : IC.bell}</span>
                    <span className="srow__txt">
                      <span className="srow__t">{t(k.label)}</span>
                      <span className="srow__s">{t(k.desc)}</span>
                    </span>
                  </span>
                  {CHANNELS.map((c) => {
                    const unavailable = c.key === 'telegram' && !data.telegram_linked
                    return (
                      <span key={c.key} role="cell" className="nmatrix__cell">
                        <Switch on={!!matrix[k.key]?.[c.key] && !unavailable} disabled={unavailable}
                          onChange={(v) => setCell(k.key, c.key, v)} label={`${t(k.label)} — ${t(c.label)}`} />
                      </span>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
