import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BarChart } from '@/components/charts/BarChart'
import { DonutChart } from '@/components/charts/DonutChart'
import { StatCard } from '@/components/charts/StatCard'
import { TrendLineChart } from '@/components/charts/TrendLineChart'
import { Skeleton } from '@/components/Skeleton'
import { gradeLabel, type Grade } from '@/features/lessons/labels'
import { quarterLabel } from '@/features/journal/labels'
import { useUIStore } from '@/store/uiStore'

import { useDashboardSummary } from './api'
import type { DashboardChorak } from './types'

const CATEGORICAL = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)']

const ROLE_LABELS: Record<string, string> = {
  teacher: "O'qituvchi",
  admin: 'Admin',
  boshliq: 'Boshliq',
}

const fmtShortDate = (iso: string, lang: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'uz-UZ', {
    day: '2-digit',
    month: '2-digit',
  })
}

export function DashboardSection({ admin }: { admin: boolean }) {
  const { t } = useTranslation()
  const { lang } = useUIStore()
  const [chorak, setChorak] = useState<DashboardChorak>('u')
  const { data, isLoading } = useDashboardSummary(chorak)

  if (isLoading || !data) return <Skeleton lines={4} />

  const { journal } = data
  const { mastery } = journal

  return (
    <section className="panel dash">
      <div className="jhead">
        <h3 className="panel__title">{t('Statistika')}</h3>
        <div className="chips chips--nowrap">
          {[1, 2, 3, 4].map((q) => (
            <button key={q} className={`chip ${chorak === q ? 'is-on' : ''}`} onClick={() => setChorak(q as DashboardChorak)}>
              {quarterLabel(q, lang)}
            </button>
          ))}
          <button className={`chip ${chorak === 'u' ? 'is-on' : ''}`} onClick={() => setChorak('u')}>{t('Umumiy')}</button>
        </div>
      </div>

      <div className="dash__stats">
        {admin && data.role === 'admin' && (
          <>
            <StatCard label={t('Jami foydalanuvchilar')} value={data.users.total} icon="users" />
            <StatCard
              label={t('Tasdiq kutmoqda')}
              value={data.users.pending_approval}
              accent={data.users.pending_approval > 0 ? 'mid' : undefined}
              icon="user"
              // Haqiqiy nisbat: jami foydalanuvchilarning qanchasi hali
              // tasdiqlanmagan. Boshqa kartochkalarda maxraj yo'q, shuning
              // uchun ularda progress-bar ham yo'q.
              progressPct={data.users.total > 0 ? (data.users.pending_approval / data.users.total) * 100 : null}
            />
            <StatCard label={t('Jami darslar')} value={data.lessons.total} icon="robot" />
          </>
        )}
        <StatCard
          label={t('Sinflar')}
          value={journal.total_classes}
          hint={admin ? t('Barcha o\'qituvchilar bo\'yicha') : undefined}
          icon="clipboard"
        />
        <StatCard
          label={t("O'quvchilar")}
          value={journal.total_students}
          hint={t("Faol ro'yxat qatorlari — bitta o'quvchi bir necha sinfda alohida hisoblanishi mumkin")}
          icon="users"
        />
        <StatCard
          label={t('Davomat')}
          value={journal.attendance_rate_pct !== null ? `${journal.attendance_rate_pct}%` : '—'}
          icon="calendar"
          progressPct={journal.attendance_rate_pct}
        />
      </div>

      <div className="dash__row">
        <div className="dash__card">
          <p className="dash__card-title">{t("O'zlashtirish")}</p>
          <div className="mastery__snapshot">
            <DonutChart
              ariaLabel={`${t('Yaxshi')} ${mastery.good}, ${t("O'rtacha")} ${mastery.mid}, ${t('Past')} ${mastery.bad}`}
              centerValue={mastery.class_pct !== null ? `${mastery.class_pct}%` : '—'}
              centerLabel={t("O'zlashtirish")}
              segments={[
                { key: 'good', label: t('Yaxshi'), value: mastery.good, color: 'var(--band-good)' },
                { key: 'mid', label: t("O'rtacha"), value: mastery.mid, color: 'var(--band-mid)' },
                { key: 'bad', label: t('Past'), value: mastery.bad, color: 'var(--band-bad)' },
              ]}
            />
            <div className="mastery__kpis">
              <div className="mastery__kpi mastery__kpi--good"><span>{t('Yaxshi')}</span><b>{mastery.good}</b></div>
              <div className="mastery__kpi mastery__kpi--mid"><span>{t("O'rtacha")}</span><b>{mastery.mid}</b></div>
              <div className="mastery__kpi mastery__kpi--bad"><span>{t('Past')}</span><b>{mastery.bad}</b></div>
              <div className="mastery__kpi"><span>{t('Baholanmagan')}</span><b>{mastery.ungraded}</b></div>
            </div>
          </div>
        </div>

        {admin && data.role === 'admin' && (
          <div className="dash__card">
            <p className="dash__card-title">{t("Yangi ro'yxatdan o'tishlar")}</p>
            <TrendLineChart
              ariaLabel={t("Kunlik ro'yxatdan o'tishlar soni")}
              data={data.users.signups_by_day.map((d) => ({ date: d.date, value: d.count }))}
              formatDate={(iso) => fmtShortDate(iso, lang)}
            />
          </div>
        )}
      </div>

      {admin && data.role === 'admin' && (
        <div className="dash__row">
          <div className="dash__card">
            <p className="dash__card-title">{t('Xodimlar rol bo\'yicha')}</p>
            <BarChart
              ariaLabel={t("Xodimlar rol bo'yicha taqsimoti")}
              data={data.users.by_role.map((r, i) => ({
                key: r.role,
                label: t(ROLE_LABELS[r.role] ?? r.role),
                value: r.count,
                color: CATEGORICAL[i % CATEGORICAL.length],
              }))}
            />
          </div>
          <div className="dash__card">
            <p className="dash__card-title">{t('Darslar sinf bandi bo\'yicha')}</p>
            <BarChart
              ariaLabel={t('Darslar sinf bandi bo\'yicha taqsimoti')}
              data={data.lessons.by_grade.map((g, i) => ({
                key: g.grade,
                label: gradeLabel(g.grade as Grade, lang),
                value: g.count,
                color: CATEGORICAL[i % CATEGORICAL.length],
              }))}
            />
          </div>
        </div>
      )}

      {admin && data.role === 'admin' && (
        <div className="dash__stats">
          <StatCard label={t('Push obunachilar')} value={data.engagement.push_subscribers} icon="bell" />
          <StatCard label={t("So'nggi 30 kunlik e'lonlar")} value={data.engagement.announcements_last_30d} icon="megaphone" />
          <StatCard label={t('Kutayotgan tarjima ishlari')} value={data.engagement.translation_jobs_pending} icon="file" />
        </div>
      )}
    </section>
  )
}
