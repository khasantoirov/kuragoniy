import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { useTimetable } from '@/features/timetable/api'
import { IC } from '@/icons'
import { isAdminInView, useAuth } from '@/lib/auth/AuthContext'
import { useUIStore } from '@/store/uiStore'

const WEEK = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']
const MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr',
]

function firstName(name: string) {
  return (name || '').trim().split(/\s+/)[0] || name || ''
}
function greetingKey(h: number) {
  return h < 12 ? 'Xayrli tong' : h < 18 ? 'Xayrli kun' : 'Xayrli kech'
}

const LINKS: { view: string; ic: keyof typeof IC; title: string; sub: string; adminOnly?: boolean }[] = [
  { view: '/lessons', ic: 'atom', title: 'Darslar', sub: 'Mavzular va tajribalar' },
  { view: '/journal', ic: 'clipboard', title: 'Jurnal', sub: 'Baho, davomat, statistika' },
  { view: '/timetable', ic: 'calendar', title: 'Jadval', sub: 'Haftalik dars jadvali' },
  { view: '/library', ic: 'book', title: 'Kutubxona', sub: "Kitob, qo'llanma, video" },
  { view: '/about', ic: 'info', title: 'Platforma haqida', sub: "Bo'limlar va imkoniyatlar" },
  { view: '/admin', ic: 'settings', title: 'Boshqaruv', sub: "Arizalar va o'qituvchilar", adminOnly: true },
]

export function HomePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const viewMode = useUIStore((s) => s.viewMode)
  const navigate = useNavigate()
  const { data: slots, isLoading } = useTimetable()
  const now = new Date()
  const ttDay = now.getDay() - 1 // Monday = 0
  const isWeekday = ttDay >= 0 && ttDay < 5

  const todaySlots = isWeekday
    ? (slots ?? [])
        .filter((s) => s.day_index === ttDay)
        .sort((a, b) => a.period_index - b.period_index)
    : []

  const admin = isAdminInView(user, viewMode)
  const links = LINKS.filter((l) => !l.adminOnly || admin)
  const fmtDate = `${t(WEEK[now.getDay()])}, ${now.getDate()}-${t(MONTHS[now.getMonth()])}`

  return (
    <section className="home">
      <header className="home__hero">
        <h2 className="home__hi">
          {t(greetingKey(now.getHours()))}, {firstName(user?.name ?? '')}!
        </h2>
        <p className="home__date">{fmtDate}</p>
      </header>

      <div className="home__grid">
        <div className="panel home__today">
          <div className="home__phead">
            <h3 className="home__ptitle">{t('Bugungi darslar')}</h3>
            <span className="home__pday">{isWeekday ? t(WEEK[now.getDay()]) : t('Dam olish kuni')}</span>
          </div>
          {isLoading ? (
            <Skeleton lines={2} />
          ) : todaySlots.length ? (
            <ul className="today">
              {todaySlots.map((s) => (
                <li key={s.id} className={`today__row ${s.band ? 'today__row--band' : ''}`}>
                  <span className="today__p">{s.period_index}</span>
                  <span className="today__body">
                    <span className="today__main">
                      {s.band && IC.lock} {s.maktab || t('Dars')}
                    </span>
                    {(s.xona || s.sinf) && (
                      <span className="today__meta">{[s.xona ? `${t('Xona')} ${s.xona}` : '', s.sinf].filter(Boolean).join(' · ')}</span>
                    )}
                  </span>
                  <span className="today__time">
                    {s.time_from ? `${s.time_from.slice(0, 5)}${s.time_to ? '–' + s.time_to.slice(0, 5) : ''}` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          ) : isWeekday ? (
            <div className="home__empty">
              <p className="prose">{t('Bugunga dars kiritilmagan.')}</p>
              <button className="btn btn--sm" onClick={() => navigate('/timetable')}>
                {t('Jadvalni ochish')}
              </button>
            </div>
          ) : (
            <div className="home__empty">
              <p className="prose">{t('Bugun dam olish kuni — dars yo\'q.')}</p>
            </div>
          )}
        </div>

        <div className="home__links">
          {links.map((l) => (
            <button key={l.view} className="qlink" onClick={() => navigate(l.view)}>
              <span className="qlink__ic" aria-hidden="true">
                {IC[l.ic]}
              </span>
              <span className="qlink__tx">
                <span className="qlink__t">{t(l.title)}</span>
                <span className="qlink__s">{t(l.sub)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
