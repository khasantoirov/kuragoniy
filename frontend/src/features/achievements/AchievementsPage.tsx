import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/Avatar'
import { EmptyState } from '@/components/EmptyState'
import { PageTabs } from '@/components/PageTabs'
import { Skeleton } from '@/components/Skeleton'
import { PageHead, Segmented } from '@/features/portal/ui'
import { isObserver, isOversight, useAuth } from '@/lib/auth/AuthContext'

import { useLeaderboard } from './api'
import { BadgeGrid } from './BadgeGrid'
import './achievements.css'

const PARTS: { key: string; label: string }[] = [
  { key: 'hisobot', label: 'Dars hisoboti' },
  { key: 'alo_dars', label: "A'lo dars (5 ball)" },
  { key: 'tayyor', label: 'Darsga tayyorgarlik' },
  { key: 'vazifa', label: 'Vazifa' },
  { key: 'jurnal', label: 'Jurnaldagi dars kuni' },
  { key: 'modul', label: 'Malaka oshirish moduli' },
  { key: 'malaka', label: 'Sertifikat' },
  { key: 'mehmon', label: 'Mehmon ustoz' },
]

function monthKey(offset: number) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function Board() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [month, setMonth] = useState(monthKey(0))
  const { data, isLoading } = useLeaderboard(month)
  const [open, setOpen] = useState<string | null>(null)
  const rows = data?.rows ?? []
  const top = rows.slice(0, 20)
  const me = rows.find((r) => r.user === user?.id)
  const shown = me && !top.includes(me) ? [...top, me] : top

  return (
    <div>
      <div className="achv__bar">
        <Segmented value={month} onChange={setMonth} options={[
          { value: monthKey(0), label: t('Shu oy') }, { value: monthKey(1), label: t("O'tgan oy") }, { value: monthKey(2), label: monthKey(2) },
        ]} />
        <details className="achv__rules">
          <summary>{t('Ball qanday hisoblanadi?')}</summary>
          <ul>{PARTS.map((p) => <li key={p.key}>{t(p.label)}: <b>+{data?.points[p.key] ?? '…'}</b></li>)}</ul>
          <p className="form__note">{t("Reyting faollikni ko'rsatadi: oy davomida qilingan ishlar hisoblanadi. Sifat bahosi faqat «a'lo dars» bonusi orqali qo'shiladi.")}</p>
        </details>
      </div>
      {isLoading && <Skeleton lines={6} />}
      {!isLoading && !rows.length && <EmptyState title={t("Bu oyda hali ball yo'q")} hint={t("Dars hisoboti, darsga tayyorgarlik, vazifa va jurnal yuritish ball beradi.")} />}
      {!!shown.length && (
        <ol className="board">
          {shown.map((r) => (
            <li key={r.user} className={`board__row ${r.user === user?.id ? 'is-me' : ''} ${r.rank <= 3 ? `is-top${r.rank}` : ''}`}>
              <button type="button" className="board__main" onClick={() => setOpen(open === r.user ? null : r.user)} aria-expanded={open === r.user}>
                <span className="board__rank">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
                <Avatar name={r.name} photo={r.photo} className="board__av" />
                <span className="board__name">{r.name}{r.user === user?.id ? ` · ${t('siz')}` : ''}</span>
                <b className="board__pts">{r.points} {t('ball')}</b>
              </button>
              {open === r.user && (
                <ul className="board__parts">
                  {PARTS.filter((p) => r.counts[p.key]).map((p) => (
                    <li key={p.key}><span>{t(p.label)}</span><span>{r.counts[p.key]} × {data?.points[p.key]} = <b>{r.counts[p.key] * (data?.points[p.key] ?? 0)}</b></span></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Reyting va nishonlar — the month's most active teachers, and one's badges. */
export function AchievementsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const teacher = !isObserver(user)
  return (
    <div>
      <PageHead title={t('Reyting va nishonlar')}
        sub={t("Oylik faollik reytingi va platformadagi ishingiz uchun beriladigan nishonlar: bronza, kumush, oltin.")} />
      <PageTabs tabs={[
        { key: 'reyting', label: 'Ustozlar reytingi', element: <Board />, show: teacher || isOversight(user) },
        { key: 'nishonlar', label: 'Nishonlarim', element: <section className="panel"><BadgeGrid /></section>, show: teacher },
      ]} />
    </div>
  )
}
