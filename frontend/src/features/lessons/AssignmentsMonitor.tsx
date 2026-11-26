import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { StatusPill } from '@/features/portal/ui'
import { type Assignment, useAssignments } from '@/features/learning/api'
import { isOversight, isTeacherLike, useAuth } from '@/lib/auth/AuthContext'
import { useModules } from '@/lib/modules'

import './quarters.css'

/* Darslar › "Darslar jarayoni va topshiriqlar monitoringi" (owner's
   mock-ups, 2026-11-26): the latest assignments of the window's classes —
   how many pupils handed in, their average result and where it stands.
   A teacher sees their own; the administration everyone's. */

const fmtDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`

function stateOf(a: Assignment): { tone: 'ok' | 'mid' | 'muted' | 'info'; label: string; when?: string } {
  const s = a.stats
  if (a.due_at && new Date(a.due_at) < new Date()) return { tone: 'muted', label: 'Yopilgan' }
  if (s && s.students > 0 && s.submitted >= s.students) return { tone: 'ok', label: 'Hammasi topshirdi' }
  if (a.due_at) return { tone: 'info', label: 'Faol', when: fmtDay(a.due_at.slice(0, 10)) }
  return { tone: 'mid', label: 'Davom etmoqda' }
}

export function AssignmentsMonitor() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { on } = useModules()
  const oversight = isOversight(user)
  // the read-only Kuzatuvchi has no Vazifalar page to go to
  const canOpen = isTeacherLike(user)
  const show = on('assignments') && (isTeacherLike(user) || oversight)
  const { data, isLoading } = useAssignments(oversight ? { all: 1 } : {})
  if (!show || isLoading) return null
  const rows = (data ?? []).filter((a) => a.is_published).slice(0, 8)

  return (
    <section className="amon">
      <header className="amon__head">
        <h2 className="amon__title">{t('Darslar jarayoni va topshiriqlar monitoringi')}</h2>
        {canOpen && <Link className="amon__more" to="/assignments">{t('Barcha vazifalar')} ›</Link>}
      </header>
      {!rows.length ? (
        <p className="amon__empty">
          {t("Hali vazifa berilmagan. Darsni sinfga topshiriq sifatida bering — kim topshirgani va natijalari shu yerda ko'rinadi.")}
        </p>
      ) : (
        <div className="amon__wrap">
          <table className="amon__t">
            <thead>
              <tr>
                <th>{t('Sinf')}</th>
                <th>{t('Mavzu')}</th>
                {oversight && <th>{t("O'qituvchi")}</th>}
                <th>{t('Topshirganlar')}</th>
                <th className="num">{t("O'rtacha natija")}</th>
                <th>{t('Holat')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const s = a.stats
                const pct = s && s.students ? Math.round((100 * s.submitted) / s.students) : null
                const st = stateOf(a)
                return (
                  <tr key={a.id}>
                    <td className="amon__cls">{a.class_name}</td>
                    <td>{canOpen ? <Link to="/assignments">{a.lesson_title || a.title}</Link> : a.lesson_title || a.title}</td>
                    {oversight && <td>{a.teacher_name}</td>}
                    <td>
                      <span className="amon__sub">
                        <span className="amon__bar" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}
                          aria-label={t('Topshirganlar')}>
                          <span style={{ width: `${pct ?? 0}%` }} />
                        </span>
                        <span className="amon__n">{s ? `${s.submitted}/${s.students}` : '—'}{pct !== null ? ` (${pct}%)` : ''}</span>
                      </span>
                    </td>
                    <td className="num">{s?.avg_percent != null ? `${Math.round(s.avg_percent)}%` : '—'}</td>
                    <td><StatusPill tone={st.tone}>{t(st.label)}{st.when ? ` · ${st.when} ${t('gacha')}` : ''}</StatusPill></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
