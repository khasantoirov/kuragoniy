import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { useLicences } from '@/features/schools/api'
import { IC } from '@/icons'
import { panelUrl } from '@/lib/adminHost'
import { isOversight, isSchoolAdmin, mayUseAdminPanel, useAuth } from '@/lib/auth/AuthContext'

import { useOffers, type Offers } from './api'
import './subscriptions.css'

/* Obunalar va tariflar (owner's mock-ups, 2026-11-26). The plans as the
   administration priced them in the panel (never invented), the contract
   template, how to pay until Click/Payme come (after the merchant
   contract), and for the administration the subscriptions' figures. */

const METHODS = ['Click', 'Payme', 'Uzum']

function Figures() {
  const { t } = useTranslation()
  const { data } = useLicences()
  if (!data) return null
  const active = data.schools.filter((r) => r.school.is_active)
  const inForce = active.filter((r) => r.in_force).length
  const ending = active.filter((r) => r.state === 'ending').length
  const out = active.filter((r) => !r.in_force).length
  const pupils = active.reduce((n, r) => n + (r.usage?.pupils ?? 0), 0)
  const teachers = active.reduce((n, r) => n + (r.usage?.teachers ?? 0), 0)
  const tiles = [
    { label: 'Amaldagi obunalar', value: inForce, sub: `${active.length} ${t('ta hamkor maktabdan')}` },
    { label: "O'quvchilar", value: pupils, sub: t("obunadagi maktablar ro'yxatlarida") },
    { label: "O'qituvchilar", value: teachers, sub: t('maktablarga biriktirilgan') },
    { label: 'Muddati tugayotgan', value: ending, sub: out ? `${out} ${t('tasida obuna amalda emas')}` : t("Hammasida amalda"), warn: ending > 0 || out > 0 },
  ]
  return (
    <ul className="sub-figs">
      {tiles.map((x) => (
        <li key={x.label} className="sub-fig">
          <span className="sub-fig__l">{t(x.label)}</span>
          <b className="sub-fig__v">{x.value}</b>
          <span className={`sub-fig__s ${x.warn ? 'is-warn' : ''}`}>{x.sub}</span>
        </li>
      ))}
    </ul>
  )
}

function Plans({ offers }: { offers: Offers }) {
  const { t } = useTranslation()
  if (!offers.plans.length) return <p className="sub-empty">{t('Tariflar hali kiritilmagan.')}</p>
  return (
    <div className="sub-plans">
      {offers.plans.map((p) => (
        <article key={p.plan} className={`sub-plan ${p.recommended ? 'is-rec' : ''}`}>
          {p.recommended && <span className="sub-plan__rec">{t('Tavsiya etiladi')}</span>}
          <h3>{t(p.plan_label)}</h3>
          <p className="sub-plan__price">{p.price || '—'}</p>
          {p.features && (
            <ul className="sub-plan__list">
              {p.features.split('\n').map((f) => f.trim()).filter(Boolean).map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}
        </article>
      ))}
    </div>
  )
}

export function SubscriptionsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const oversight = isOversight(user)
  const school = isSchoolAdmin(user)
  const { data: offers, isLoading } = useOffers()

  return (
    <div className="sub">
      <header className="sub-head">
        <div>
          <h1>{t('Obunalar va tariflar')}</h1>
          <p>{t("Maktablar obunasi: tariflar, shartnoma va to'lov tartibi.")}</p>
        </div>
        {mayUseAdminPanel(user) && (
          <a className="btn btn--sm" href={panelUrl('litsenziya')}>{IC.settings} {t('Boshqaruv panelida tahrirlash')}</a>
        )}
      </header>

      {oversight && <Figures />}
      {school && (
        <p className="sub-mine">{IC.school} {t("Maktabingizning joriy obunasi va muddati «Maktabim» sahifasida.")} <Link to="/my-school">{t('Maktabim')} ›</Link></p>
      )}

      <section className="sub-card">
        <h2>{t('Tarif rejalari')}</h2>
        {isLoading || !offers ? <Skeleton lines={3} /> : <Plans offers={offers} />}
      </section>

      {offers && (
        <section className="sub-card">
          <h2>{t("Shartnoma va to'lov")}</h2>
          <div className="sub-pay">
            <div>
              {offers.contract_url ? (
                <a className="btn btn--primary" href={offers.contract_url} target="_blank" rel="noopener noreferrer" download>
                  {IC.download} {t('Shartnoma namunasini yuklab olish')}
                </a>
              ) : <p className="sub-empty">{t("Shartnoma namunasi hali yuklanmagan.")}</p>}
              {offers.payment_note && <p className="sub-note">{offers.payment_note}</p>}
            </div>
            <div className="sub-methods">
              <p className="sub-methods__t">{t("To'lov tizimlari")}</p>
              <ul>
                <li className="is-on">{IC.cards} {t("Bank o'tkazmasi (shartnoma asosida)")}</li>
                {METHODS.map((m) => <li key={m}>{m} <small>{t('tez orada')}</small></li>)}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
