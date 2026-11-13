import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import { fmtDate } from '@/features/portal/ui'

import { ORG } from './cert'
import './training.css'

interface Verified {
  valid: true
  name: string
  course_title: string
  hours: number
  number: string
  issued_at: string
}

/** /verify/<code> — open to anyone (an employer, a school): whether the
 * certificate is real, and only what it says. */
export function VerifyPage() {
  const { t } = useTranslation()
  const { code = '' } = useParams()
  const [state, setState] = useState<'loading' | 'missing' | 'error' | Verified>('loading')

  useEffect(() => {
    let live = true
    fetch(`/api/training/verify/${encodeURIComponent(code)}/`, { credentials: 'omit' })
      .then(async (r) => {
        if (!live) return
        if (r.status === 404) setState('missing')
        else if (r.ok) setState((await r.json()) as Verified)
        else setState('error')
      })
      .catch(() => live && setState('error'))
    return () => { live = false }
  }, [code])

  return (
    <main className="verify">
      <div className="verify__card">
        <img className="verify__logo" src="/logo.png" alt="" />
        <p className="verify__org">{ORG}</p>
        <h1 className="verify__h">{t('Sertifikatni tekshirish')}</h1>
        {state === 'loading' && <p className="verify__muted">{t('Tekshirilmoqda…')}</p>}
        {state === 'missing' && (
          <>
            <p className="verify__bad">✗ {t('Bunday sertifikat topilmadi')}</p>
            <p className="verify__muted">{t('Kod')}: <code>{code.toUpperCase()}</code></p>
          </>
        )}
        {state === 'error' && <p className="verify__bad">{t("Hozir tekshirib bo'lmadi — birozdan keyin qayta urinib ko'ring.")}</p>}
        {typeof state === 'object' && (
          <>
            <p className="verify__ok">✓ {t('Sertifikat haqiqiy')}</p>
            <dl className="verify__kv">
              <dt>{t('Egasi')}</dt><dd>{state.name}</dd>
              <dt>{t('Kurs')}</dt><dd>«{state.course_title}»{state.hours > 0 ? ` · ${state.hours} ${t('soat')}` : ''}</dd>
              <dt>{t('Raqami')}</dt><dd>№ {state.number}</dd>
              <dt>{t('Berilgan sana')}</dt><dd>{fmtDate(state.issued_at)}</dd>
            </dl>
          </>
        )}
        <Link className="verify__home" to="/">{t('Platformaga o\'tish')} ›</Link>
      </div>
    </main>
  )
}
