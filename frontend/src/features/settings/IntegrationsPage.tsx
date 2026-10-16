import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmProvider'
import { useToast } from '@/components/Toast'
import { usePrefs } from '@/features/notifications/api'
import { PageHead, errText } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'
import { TELEGRAM_BOT_USERNAME } from '@/lib/config'

function StatusTag({ on }: { on: boolean }) {
  const { t } = useTranslation()
  return (
    <span className={`itag ${on ? 'itag--on' : ''}`}>
      <span className="itag__dot" aria-hidden="true" />{on ? t('Ulangan') : t('Ulanmagan')}
    </span>
  )
}

export function IntegrationsPage() {
  const { t } = useTranslation()
  const { user, refreshMe } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const prefs = usePrefs()
  const [busy, setBusy] = useState(false)
  const linked = !!user?.telegram_linked

  const connect = async () => {
    setBusy(true)
    // Opened synchronously (before the await) so popup blockers allow it.
    const win = window.open('', '_blank')
    if (win) win.opener = null
    try {
      const res = await api.post<{ url: string }>('/accounts/me/telegram-link/')
      if (win) win.location.href = res.data.url
      else window.location.href = res.data.url
      toast(t("Botda «Start» bosing, so'ng shu sahifaga qayting."))
    } catch (err) {
      win?.close()
      toast(t(errText(err)), 'error')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!(await confirm({
      title: t('Telegramni uzish'),
      text: t("Telegramga xabarlar va parolni tiklash kodi kelmay qoladi. Keyin istalgan payt qayta ulashingiz mumkin."),
      danger: true,
    }))) return
    try {
      await api.post('/accounts/me/telegram-unlink/')
      await refreshMe()
      toast(t('Telegram uzildi'))
    } catch (err) {
      toast(t(errText(err)), 'error')
    }
  }

  return (
    <div className="setpg">
      <PageHead title={t('Integratsiyalar')} sub={t('Telegram bot va email orqali xabarlar')} />

      <section className="panel icard">
        <div className="icard__head">
          <span className="icard__logo icard__logo--tg">{IC.telegram}</span>
          <span className="icard__txt">
            <span className="icard__t">{t('Telegram hisobim')}</span>
            <span className="icard__s">
              {linked
                ? `${t("Bog'langan")}${user?.telegram_username ? `: @${user.telegram_username}` : ''}`
                : t("Telegramni ulang: parolni unutsangiz, uni o'zingiz bir daqiqada tiklaysiz.")}
            </span>
          </span>
          <StatusTag on={linked} />
        </div>
        <div className="icard__body">
          <p className="prose prose--note">
            {linked
              ? t("Bildirishnomalar va parolni tiklash kodi shu Telegram hisobiga keladi. Qaysi xabarlar kelishini «Bildirishnomalar» sozlamalarida tanlaysiz.")
              : t("Ulangach, muhim xabarlar (e'lonlar, hisobot baholari, xavfsizlik ogohlantirishlari) Telegramga ham keladi.")}
          </p>
          <div className="tgbox__acts">
            {linked ? (
              <>
                <a className="btn" href={`https://t.me/${TELEGRAM_BOT_USERNAME}`} target="_blank" rel="noreferrer">{IC.external} {t('Botni ochish')}</a>
                <button type="button" className="btn btn--ghost" onClick={() => refreshMe()}>{t('Yangilash')}</button>
                <button type="button" className="btn btn--danger-soft" onClick={disconnect}>{t('Uzish')}</button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn--primary" onClick={connect} disabled={busy}>{IC.telegram} {t('Telegramni ulash')}</button>
                <button type="button" className="btn btn--ghost" onClick={() => refreshMe()}>{t('Tekshirish')}</button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="panel icard">
        <div className="icard__head">
          <span className="icard__logo icard__logo--mail">{IC.mail}</span>
          <span className="icard__txt">
            <span className="icard__t">{t('Email')}</span>
            <span className="icard__s">{user?.email || t("Hisobingizda email ko'rsatilmagan")}</span>
          </span>
          <StatusTag on={!!prefs.data?.email_enabled} />
        </div>
        <div className="icard__body">
          <p className="prose prose--note">
            {prefs.data?.email_enabled
              ? t("Email orqali qaysi xabarlar kelishini «Bildirishnomalar» sozlamalarida yoqasiz (odatda o'chiq).")
              : t('Email xabarlari uchun hisobingizda email bo\'lishi va platformada email yuborish sozlangan bo\'lishi kerak.')}
          </p>
          <Link className="btn" to="/settings/notifications">{IC.bell} {t('Bildirishnoma sozlamalari')}</Link>
        </div>
      </section>
    </div>
  )
}
