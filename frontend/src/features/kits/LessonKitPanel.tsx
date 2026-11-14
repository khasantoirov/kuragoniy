import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { StatusPill } from '@/features/portal/ui'
import { IC } from '@/icons'
import { isObserver, useAuth } from '@/lib/auth/AuthContext'
import { useModules } from '@/lib/modules'

import { useLessonKits } from './api'
import { RequestModal } from './RequestModal'
import './kits.css'

/** A lesson page: which STEM chamadon it needs, whether the teacher's school
 * has it, what is still short — and asking for it. */
export function LessonKitPanel({ lessonId, lessonTitle }: { lessonId: number; lessonTitle: string }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { on } = useModules()
  const { data } = useLessonKits(on('kits') ? lessonId : undefined)
  const [asking, setAsking] = useState<'kit' | 'missing' | null>(null)
  const [showNeeds, setShowNeeds] = useState(false)
  if (!data || !data.needs.length) return null
  const best = data.kits[0]
  const canAsk = !isObserver(user)
  const ours = best?.owned.reduce((n, o) => n + o.quantity, 0) ?? 0

  return (
    <section className="panel kpanel">
      <div className="kpanel__head">
        <span className="kpanel__ic">{IC.cards}</span>
        <div className="kpanel__txt">
          <h3 className="panel__title">{t('STEM chamadon')}</h3>
          {best ? (
            <p>
              <Link to={`/kits/${best.id}`}><b>{best.name}</b></Link>{best.code && ` · ${best.code}`}
              {' — '}{best.percent === 100 ? t('dars uchun barcha jihozlar bor') : `${t('jihozlarning')} ${best.percent}% ${t('qismi bor')}`}
            </p>
          ) : (
            <p className="muted">{t("Bu dars jihozlari hali hech qaysi chamadonga kiritilmagan.")}</p>
          )}
        </div>
        {best && (ours
          ? <StatusPill tone="ok">✓ {t('Maktabingizda bor')}{ours > 1 ? ` (${ours})` : ''}</StatusPill>
          : data.my_schools.length ? <StatusPill tone="mid">{t("Maktabingizda yo'q")}</StatusPill> : null)}
      </div>

      {best && best.missing.length > 0 && (
        <div className="kpanel__miss">
          <b>{t('Chamadonda yetishmaydi')}:</b>
          <ul>{best.missing.map((m) => <li key={m.name}>{m.name} — {m.short} {t('ta')}</li>)}</ul>
        </div>
      )}

      <div className="kpanel__acts">
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setShowNeeds((v) => !v)}>
          {showNeeds ? t('Yashirish') : `${t('Kerakli jihozlar')} (${data.needs.length})`}
        </button>
        {best?.instructions_url && <a className="btn btn--sm" href={best.instructions_url} target="_blank" rel="noreferrer noopener">{IC.book} {t("Yo'riqnoma")}</a>}
        {best && <Link className="btn btn--sm" to={`/kits/${best.id}`}>{t('Chamadon tarkibi')}</Link>}
        {canAsk && best && !ours && <button type="button" className="btn btn--sm btn--primary" onClick={() => setAsking('kit')}>{t("Chamadon so'rash")}</button>}
        {canAsk && best && best.missing.length > 0 && (
          <button type="button" className="btn btn--sm" onClick={() => setAsking('missing')}>{t("Yetishmaganini so'rash")}</button>
        )}
        {canAsk && !best && <button type="button" className="btn btn--sm" onClick={() => setAsking('missing')}>{t("Jihozlarni so'rash")}</button>}
      </div>
      {showNeeds && (
        <ul className="kpanel__needs">
          {data.needs.map((n) => <li key={n.name}><span>{n.name}</span><b>{n.quantity} {t('ta')}</b></li>)}
        </ul>
      )}
      {asking && (
        <RequestModal kit={asking === 'kit' && best ? { id: best.id, name: best.name } : undefined}
          lesson={{ id: lessonId, title: lessonTitle }}
          missing={asking === 'missing' ? (best?.missing ?? data.needs.map((n) => ({ ...n, short: n.quantity }))) : undefined}
          schools={data.my_schools} onClose={() => setAsking(null)} />
      )}
    </section>
  )
}
