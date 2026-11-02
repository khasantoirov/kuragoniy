import { useTranslation } from 'react-i18next'

import { PageHead } from '@/features/portal/ui'
import { useStatsHub } from '@/features/schools/statsFilter'

import { MasteryBreakdown } from './MasteryBreakdown'
import type { DashboardChorak } from './types'

/** Statistika › Umumiy ko'rinish: pupils' mastery and attendance from the
 * journal — the distribution, the comparison, the trend and the numbers
 * behind them. Period, school, teacher and class come from the filter
 * panel over the tabs (schools/statsFilter.tsx); the school's working
 * figures (teaching load, materials, accounts) are in Boshqaruv › Ma'lumot
 * (SystemStats.tsx). */
export function StatisticsPage() {
  const { t } = useTranslation()
  const f = useStatsHub()?.filter
  const chorak: DashboardChorak = f && f.chorak !== 'all' ? (Number(f.chorak) as DashboardChorak) : 'u'
  return (
    <div className="stats">
      <PageHead title={t("Umumiy ko'rinish")}
        sub={t("Jurnal bo'yicha o'zlashtirish va davomat. Davr, maktab, o'qituvchi va sinfni yuqoridagi filtrdan tanlang.")} />
      <section className="panel dash">
        {/* remounted when the panel's scope changes, so a drill-down never outlives it */}
        <MasteryBreakdown key={`${f?.school}|${f?.teacher}|${f?.cls}`} chorak={chorak} />
      </section>
    </div>
  )
}
