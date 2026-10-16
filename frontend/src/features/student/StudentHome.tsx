import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { ATTEMPT_KIND_LABEL, fmtDateTime, Meter, PageHead, PercentPill, StatTile } from '@/features/portal/ui'
import { useAuth } from '@/lib/auth/AuthContext'

import { useLeaderboard, useStudentDashboard } from './api'

export function StudentHome() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data, isLoading, error } = useStudentDashboard()
  const board = useLeaderboard()

  if (isLoading) return <Skeleton lines={6} />
  if (error || !data) {
    return (
      <div className="panel">
        <p className="prose">{t("Siz hali biror sinfga biriktirilmagansiz. O'qituvchingizdan sinf kodini so'rang va Profil bo'limida kiriting.")}</p>
        <Link className="btn" to="/s/profile">{t('Profil')}</Link>
      </div>
    )
  }

  const firstName = (user?.name ?? '').split(' ').slice(-1)[0]

  return (
    <div>
      <PageHead title={`${t('Salom')}, ${firstName}!`} sub={user?.student?.class_name ? `${user.student.class_name} · ${user.student.school}` : undefined} />

      <section className="xpcard">
        <div className="xpcard__lvl">
          <span className="xpcard__n">{data.xp.level}</span>
          <span className="xpcard__l">{t('daraja')}</span>
        </div>
        <div className="xpcard__body">
          <p className="xpcard__xp"><b>{data.xp.xp}</b> {t('ball')} · {t('keyingi daraja')}: {data.xp.next_level_xp}</p>
          <Meter value={data.xp.level_progress} label={t('Keyingi darajagacha')} />
          <p className="xpcard__hint">{t("Ball uy vazifalari, mashqlar va tugatilgan darslar uchun beriladi.")}</p>
        </div>
      </section>

      <div className="stiles">
        <StatTile label={t("O'rtacha natija")} value={data.avg_percent != null ? `${Math.round(data.avg_percent)}%` : '—'} />
        <StatTile label={t('Sinfdagi o\'rin')} value={data.class_rank ? `${data.class_rank}/${data.class_size}` : '—'} />
        <StatTile label={t('Tugatilgan darslar')} value={data.xp.lessons_completed} />
        <StatTile label={t('Bajarilmagan vazifa')} value={data.pending_count} tone={data.pending_count ? 'warn' : 'ok'} />
      </div>

      <div className="cols2">
        <section className="panel">
          <h3 className="panel__title">{t('Uyga vazifalar')}</h3>
          {data.pending_homework.length ? (
            <ul className="tlist">
              {data.pending_homework.map((h) => (
                <li key={h.id}>
                  <Link to={`/s/homework/${h.id}`} className="tlist__row">
                    <span className="tlist__main">{h.title}</span>
                    <span className="tlist__side">{h.due_at ? `${t('muddat')}: ${fmtDateTime(h.due_at)}` : t('muddatsiz')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="prose prose--note">{t("Hozircha bajarilmagan vazifa yo'q. Zo'r! 🎉")}</p>
          )}
          <Link className="btn btn--sm" to="/s/lessons">{t('Darslarga o\'tish')} →</Link>
        </section>

        <section className="panel">
          <h3 className="panel__title">{t('Sinf reytingi')} {board.data && <span className="muted">· {board.data.class_name}</span>}</h3>
          {board.data?.rows.length ? (
            <ol className="lboard">
              {board.data.rows.slice(0, 7).map((r) => (
                <li key={r.rank} className={r.is_me ? 'is-me' : ''}>
                  <span className="lboard__rank">{r.rank}</span>
                  <span className="lboard__name">{r.name}{r.is_me && ` (${t('siz')})`}</span>
                  <span className="lboard__score">{Math.round(r.score)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="prose prose--note">{t("Reyting birinchi natijalardan keyin paydo bo'ladi.")}</p>
          )}
        </section>
      </div>

      <section className="panel">
        <h3 className="panel__title">{t("So'nggi natijalar")}</h3>
        {data.recent_results.length ? (
          <ul className="tlist">
            {data.recent_results.map((r) => (
              <li key={r.id}>
                <Link to={`/s/results/${r.id}`} className="tlist__row">
                  <span className="tlist__main">{r.assignment_title || r.lesson_title || t(ATTEMPT_KIND_LABEL[r.kind])}</span>
                  <span className="tlist__side">{fmtDateTime(r.submitted_at)} <PercentPill value={r.percent} /></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="prose prose--note">{t("Hali natija yo'q — birinchi darsni boshlang!")}</p>
        )}
      </section>

      {data.awards.length > 0 && (
        <section className="panel">
          <h3 className="panel__title">🏆 {t("Rag'batlar")}</h3>
          <ul className="awards">
            {data.awards.map((a) => (
              <li key={a.id} className="award">
                <strong>{a.title}</strong>
                {a.reason && <span>{a.reason}</span>}
                <small>{a.period}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
