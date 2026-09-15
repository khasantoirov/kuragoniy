import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { IC } from '@/icons'

import { CATS, SIM_CATS, SIMS } from './sims'

export function LabPage() {
  const { t } = useTranslation()
  const [cat, setCat] = useState('all')

  const filtered = useMemo(() => (cat === 'all' ? SIMS : SIMS.filter((s) => SIM_CATS[s.id] === cat)), [cat])
  const cats = Object.entries(CATS)

  return (
    <div>
      <p className="prose prose--note">{t("Slayderlarni suring — hisob va animatsiya real vaqtda o'zgaradi.")}</p>

      <div className="tabs" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', border: 'none' }}>
        {cats.map(([k, c]) => {
          const count = k === 'all' ? SIMS.length : SIMS.filter((s) => SIM_CATS[s.id] === k).length
          return (
            <button
              key={k}
              className={`tab ${cat === k ? 'is-on' : ''}`}
              onClick={() => setCat(k)}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: 6,
                background: cat === k ? c.color : '#E3EBF1',
                color: cat === k ? '#fff' : '#12212E',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.2s',
              }}
            >
              {t(c.label)} ({count})
            </button>
          )
        })}
      </div>

      <div className="labgrid">
        {filtered.map((s) => (
          <Link key={s.id} to={`/lab/${s.id}`} className="labcard">
            <span className="labcard__ic">{IC.flask}</span>
            <span className="labcard__tx">
              <span className="labcard__t">{t(s.title)}</span>
              <span className="labcard__d">{t(s.desc)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
