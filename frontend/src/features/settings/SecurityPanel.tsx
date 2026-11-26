import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/components/Toast'
import { ChangePasswordForm, LogoutEverywhereButton } from '@/features/portal/AccountSecurity'
import { fmtDateTime } from '@/features/portal/ui'
import { IC } from '@/icons'
import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'

import { useRevokeSession, useSecurityLog, useSessions } from './api'

const errDetail = (err: unknown) => (isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined)

const ACTION_LABEL: Record<string, string> = {
  login_ok: 'Kirish',
  login_failed: "Noto'g'ri parol",
  login_locked: 'Hisob bloklandi',
  password_changed: "Parol o'zgartirildi",
  password_reset_done: 'Parol tiklandi',
  password_reset_requested: "Parolni tiklash so'raldi",
  logout_all: 'Barcha qurilmalardan chiqildi',
  session_revoked: 'Qurilma chiqarildi',
  '2fa_enabled': 'Ikki bosqichli tasdiqlash yoqildi',
  '2fa_disabled': "Ikki bosqichli tasdiqlash o'chirildi",
}

const BAD_ACTIONS = new Set(['login_failed', 'login_locked', '2fa_disabled'])

export function SecurityTab() {
  const { t } = useTranslation()
  const [pwOpen, setPwOpen] = useState(false)
  const log = useSecurityLog()
  return (
    <div className="setgrid">
      <section className="panel">
        <h3 className="panel__title">{t("Parolni o'zgartirish")}</h3>
        <p className="prose prose--note">{t("Yangi parol saqlangach, boshqa barcha qurilmalardagi seanslar yopiladi.")}</p>
        {pwOpen ? <ChangePasswordForm onDone={() => setPwOpen(false)} />
          : <button type="button" className="btn btn--sm" onClick={() => setPwOpen(true)}>{IC.lock} {t("O'zgartirish")}</button>}
      </section>
      <section className="panel setgrid__wide">
        <h3 className="panel__title">{t('Kirishlar tarixi')}</h3>
        {log.data?.length ? (
          <ul className="seclog">
            {log.data.map((r) => (
              <li key={r.id} className={`seclog__row ${BAD_ACTIONS.has(r.action) ? 'is-bad' : ''}`}>
                <span className="seclog__what">{t(ACTION_LABEL[r.action] ?? r.action)}</span>
                <span className="seclog__dev">{[r.device, r.ip].filter(Boolean).join(' · ')}</span>
                <span className="seclog__at">{fmtDateTime(r.at)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="prose prose--note">{t("Hali yozuv yo'q.")}</p>}
      </section>
    </div>
  )
}

const KIND_LABEL: Record<string, string> = { phone: 'Telefon', tablet: 'Planshet', desktop: 'Kompyuter' }

export function SessionsTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const sessions = useSessions()
  const revoke = useRevokeSession()

  const onRevoke = async (id: number) => {
    try {
      await revoke.mutateAsync(id)
      toast(t('Qurilma hisobdan chiqarildi'))
    } catch (err) {
      toast(t(errDetail(err) ?? "Amalni bajarib bo'lmadi"), 'error')
    }
  }

  return (
    <section className="panel">
      <div className="thead">
        <h3 className="panel__title">{t('Aktiv seanslar')}</h3>
        <LogoutEverywhereButton />
      </div>
      <p className="prose prose--note">
        {t("Hisobingiz ochiq turgan qurilmalar. Tanimagan qurilmani chiqaring va parolni almashtiring. Chiqarilgan qurilma 15 daqiqa ichida tizimdan chiqadi.")}
      </p>
      <p className="sess__policy">
        {IC.shield} {t("Xavfsizlik: har 24 soatda login va parol bilan qayta kirish talab qilinadi; 30 daqiqa faollik bo'lmasa, tizimdan avtomatik chiqiladi.")}
      </p>
      {sessions.data?.length ? (
        <ul className="sesslist">
          {sessions.data.map((s) => (
            <li key={s.id} className={`sess ${s.current ? 'is-current' : ''}`}>
              <span className="sess__ic">{s.kind === 'desktop' ? IC.monitor : IC.smartphone}</span>
              <span className="sess__txt">
                <span className="sess__nm">
                  {s.device || t(KIND_LABEL[s.kind] ?? 'Kompyuter')}
                  {s.device && <span className="sess__kind">{t(KIND_LABEL[s.kind] ?? 'Kompyuter')}</span>}
                  {s.current && <em className="sess__cur">{t('Joriy qurilma')}</em>}
                </span>
                <span className="sess__sys">
                  {s.os_full} · {s.browser_full}
                  {s.model && !s.device.includes(s.model) ? ` · ${t('Model')}: ${s.model}` : ''}
                </span>
                <span className="sess__meta">
                  {s.ip ? `IP ${s.ip} · ` : ''}{t('Oxirgi faollik')}: {fmtDateTime(s.last_seen_at)} · {t('Kirgan')}: {fmtDateTime(s.created_at)}
                  {' · '}{t('Seans tugashi')}: {fmtDateTime(s.expires_at)}
                </span>
              </span>
              {!s.current && (
                <button type="button" className="btn btn--sm btn--ghost sess__out" onClick={() => onRevoke(s.id)} disabled={revoke.isPending}>
                  {IC.logout} {t('Chiqarish')}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="prose prose--note">{t("Bu ro'yxat yangilanishdan keyingi kirishlardan boshlab yuritiladi — hozircha yozuv yo'q.")}</p>
      )}
    </section>
  )
}
