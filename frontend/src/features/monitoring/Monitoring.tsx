import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'
import { StatusPill } from '@/features/portal/ui'
import { LICENCE_TONE } from '@/features/schools/licence'
import { IC } from '@/icons'
import { panelUrl } from '@/lib/adminHost'
import { mayUseAdminPanel, useAuth } from '@/lib/auth/AuthContext'

import { type Monitoring, useMonitoring } from './api'
import './i18n'
import './monitoring.css'

/* The administration's overview (owner's mock-ups, 2026-11-26): live
   figures from backend dashboard/monitoring.py. On the Bosh sahifa for the
   administration (HomeMonitoring) and as Statistika's first tab
   (MonitoringTab). Every number is real — the mock-ups' were invented. */

const MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']
const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym
const fmtDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
const num = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ')

function Card({ title, more, children, className = '' }: { title: string; more?: ReactNode; children: ReactNode; className?: string }) {
  const { t } = useTranslation()
  return (
    <section className={`mon-card ${className}`}>
      <header className="mon-card__head">
        <h2 className="mon-card__title">{t(title)}</h2>
        {more}
      </header>
      {children}
    </section>
  )
}

/** The figures on top: schools, pupils, teachers in training, Muhandis D's
 *  own teachers and the subscriptions in force. */
export function KpiTiles({ data }: { data: Monitoring }) {
  const { t } = useTranslation()
  const k = data.kpi
  const ending = data.licences.by_state.ending ?? 0
  const tiles: { ic: keyof typeof IC; label: string; value: number; sub: string; warn?: boolean }[] = [
    { ic: 'school', label: 'Hamkor maktablar', value: k.schools.total, sub: `${k.schools.in_force} ${t('tasida obuna amalda')}` },
    { ic: 'users', label: "O'quvchilar", value: k.pupils, sub: `${num(k.pupil_accounts)} ${t('tasining hisobi bor')}` },
    { ic: 'cap', label: 'Malaka oshirayotgan ustozlar', value: k.training.learning, sub: `${k.training.certificates} ${t('ta sertifikat berilgan')}` },
    { ic: 'user', label: "Muhandis D o'qituvchilari", value: k.muhandis.teachers, sub: `${k.muhandis.schools} ${t('ta maktabda')}` },
    { ic: 'cards', label: 'Amaldagi obunalar', value: k.schools.in_force, sub: ending ? `${ending} ${t('tasining muddati tugayapti')}` : t('Muddati tugayotgani yo\'q'), warn: ending > 0 },
  ]
  return (
    <ul className="mon-kpis">
      {tiles.map((x) => (
        <li key={x.label} className="mon-kpi">
          <span className="mon-kpi__ic" aria-hidden="true">{IC[x.ic]}</span>
          <span className="mon-kpi__tx">
            <span className="mon-kpi__label">{t(x.label)}</span>
            <b className="mon-kpi__value">{num(x.value)}</b>
            <span className={`mon-kpi__sub ${x.warn ? 'is-warn' : ''}`}>{x.sub}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Today's lessons from the weekly timetable, school by school. */
export function TodayPanel({ data }: { data: Monitoring }) {
  const { t } = useTranslation()
  const rows = data.today.schools
  return (
    <Card title="Bugungi darslar va faollik" more={<Link className="mon-card__more" to="/timetable">{t('Jadval')} ›</Link>}>
      {data.today.weekday === null ? (
        <p className="mon-empty">{t('Bugun dam olish kuni.')}</p>
      ) : !rows.length ? (
        <p className="mon-empty">{t("Bugun jadvalda dars yo'q.")}</p>
      ) : (
        <ul className="mon-list">
          {rows.map((r) => {
            const left = r.lessons - r.done
            const pill = r.now
              ? <StatusPill tone="info">{t('Hozir dars ketmoqda')}</StatusPill>
              : r.next
                ? <StatusPill tone="muted">{t('Keyingisi')} {r.next}</StatusPill>
                : left > 0
                  ? <StatusPill tone="mid">{left} {t('tasi jurnalga yozilmagan')}</StatusPill>
                  : <StatusPill tone="ok">{t('Yakunlandi')}</StatusPill>
            const body = (
              <>
                <span className="mon-list__ic" aria-hidden="true">{IC.school}</span>
                <span className="mon-list__tx">
                  <b>{r.name}</b>
                  <small>{r.lessons} {t('ta dars')} · {r.done} {t('tasi yozildi')}</small>
                </span>
                {pill}
              </>
            )
            return (
              <li key={r.id ?? r.name}>
                {r.id ? <Link className="mon-list__row" to={`/manage/schools/${r.id}`}>{body}</Link> : <div className="mon-list__row">{body}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/** What waits for the administration, and the subscriptions running out. */
export function RequestsPanel({ data }: { data: Monitoring }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const panel = mayUseAdminPanel(user)
  const r = data.requests
  const rows: { ic: keyof typeof IC; label: string; n: number; to?: string; href?: string; show?: boolean }[] = [
    { ic: 'users', label: 'Tasdiq kutayotgan xodimlar', n: r.staff_pending, href: panel ? panelUrl('foydalanuvchilar') : undefined },
    { ic: 'mail', label: 'Hamkorlik arizalari', n: r.leads_new, href: panel ? panelUrl('sayt') : undefined },
    { ic: 'user', label: "Mehmon ustoz so'rovlari", n: r.guests_new, to: '/staffroom?bolim=mehmon' },
    { ic: 'cards', label: "Kerakli jihozlar so'rovlari", n: r.kits_new, to: '/lessons?bolim=chamadonlar&sub=sorovlar', show: data.fan !== 'fizika' },
    { ic: 'help', label: 'Yordam murojaatlari', n: r.tickets_open, to: '/help' },
  ]
  return (
    <Card title="So'rovlar va obunalar holati">
      <ul className="mon-list">
        {rows.filter((x) => x.show !== false).map((x) => {
          const body = (
            <>
              <span className="mon-list__ic" aria-hidden="true">{IC[x.ic]}</span>
              <span className="mon-list__tx"><b>{t(x.label)}</b></span>
              <span className={`mon-count ${x.n ? 'is-on' : ''}`}>{x.n ? `${x.n} ${t('ta yangi')}` : t("yo'q")}</span>
            </>
          )
          return (
            <li key={x.label}>
              {x.href ? <a className="mon-list__row" href={x.href}>{body}</a>
                : x.to ? <Link className="mon-list__row" to={x.to}>{body}</Link>
                  : <div className="mon-list__row">{body}</div>}
            </li>
          )
        })}
      </ul>
      <h3 className="mon-sub">{t('Obunasi tugayotgan maktablar')}</h3>
      {data.licences.ending.length ? (
        <ul className="mon-list">
          {data.licences.ending.map((l) => (
            <li key={l.id}>
              <Link className="mon-list__row" to={`/manage/schools/${l.id}`}>
                <span className={`mon-list__ic ${l.days_left <= 7 ? 'is-bad' : ''}`} aria-hidden="true">{IC.calendar}</span>
                <span className="mon-list__tx">
                  <b>{l.name}</b>
                  <small>{t(l.plan)} · {fmtDate(l.ends_on)} {t('gacha')}</small>
                </span>
                <StatusPill tone={l.days_left <= 7 ? 'bad' : 'mid'}>{l.days_left} {t('kun qoldi')}</StatusPill>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mon-empty">{t("Keyingi 30 kunda muddati tugaydigan obuna yo'q.")}</p>
      )}
    </Card>
  )
}

/** Malaka oshirish: each course's learners and how far they got. */
export function CoursesPanel({ data }: { data: Monitoring }) {
  const { t } = useTranslation()
  return (
    <Card title="Ustozlarni qayta tayyorlash" more={<Link className="mon-card__more" to="/training">{t('Malaka oshirish')} ›</Link>}>
      {!data.courses.length ? (
        <p className="mon-empty">{t("Hali e'lon qilingan kurs yo'q.")}</p>
      ) : (
        <ul className="mon-courses">
          {data.courses.slice(0, 4).map((c) => (
            <li key={c.id}>
              <Link to={`/training/${c.id}`} className="mon-course">
                <span className="mon-course__top">
                  <b>{c.title}</b>
                  <span className="mon-course__pct">{c.progress}%</span>
                </span>
                <span className="mon-bar" role="progressbar" aria-valuenow={c.progress} aria-valuemin={0} aria-valuemax={100} aria-label={c.title}>
                  <span style={{ width: `${c.progress}%` }} />
                </span>
                <small>{c.enrolled} {t("ta ustoz o'qimoqda")}{c.completed ? ` · ${c.completed} ${t('tasi tugatgan')}` : ''}</small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Kerakli jihozlar (the STEAM window's kits): at schools, and requests. */
export function KitsPanel({ data }: { data: Monitoring }) {
  const { t } = useTranslation()
  const k = data.kits
  if (!k) return null
  return (
    <Card title="Kerakli jihozlar" more={<Link className="mon-card__more" to="/lessons?bolim=chamadonlar">{t("Ko'rish")} ›</Link>}>
      <ul className="mon-figs">
        <li><b>{k.at_schools}</b><span>{t("to'plam maktablarda")}</span></li>
        <li><b>{k.schools}</b><span>{t('maktabda bor')}</span></li>
        <li><b>{k.open}</b><span>{t("so'rov ochiq")}</span></li>
        <li><b>{k.delivered}</b><span>{t('yetkazilgan')}</span></li>
      </ul>
      <p className="mon-empty">{k.types} {t("xil to'plam katalogda")}</p>
    </Card>
  )
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** O'zlashtirish and sifat by month — one axis (0–100 %), two lines:
 *  solid blue and dashed gold (the logo's colours), each labelled at its
 *  end, a crosshair and tooltip on hover, the numbers in a table below. */
export function MonthlyChart({ data }: { data: Monitoring }) {
  const { t } = useTranslation()
  const [box, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pts = data.monthly
  const H = 240
  const pad = { l: 40, r: 104, t: 14, b: 28 }
  const W = Math.max(width, 280)
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const x = (i: number) => pad.l + (pts.length > 1 ? (iw * i) / (pts.length - 1) : iw / 2)
  const y = (v: number) => pad.t + ih - (ih * v) / 100
  const line = (key: 'passed' | 'quality') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  // the two end labels must not sit on each other
  let ya = last ? y(last.passed) : 0
  let yb = last ? y(last.quality) : 0
  if (last && Math.abs(ya - yb) < 16) {
    const mid = (ya + yb) / 2
    ya = mid - 8
    yb = mid + 8
  }
  const tip = hover !== null ? pts[hover] : null

  return (
    <Card title="O'zlashtirish va sifat dinamikasi" className="mon-chartcard">
      <p className="mon-note">{t("Oylar kesimida: o'zlashtirish — «3» va undan yuqori baholar ulushi, sifat — «4» va «5» ulushi.")}</p>
      {pts.length < 2 ? (
        <p className="mon-empty">
          {pts.length
            ? `${t('Hozircha bitta oy')}: ${t("o'zlashtirish")} ${last!.passed}%, ${t('sifat')} ${last!.quality}% (${last!.marks} ${t('ta baho')}).`
            : t("Bu o'quv yilida hali baho qo'yilmagan.")}
        </p>
      ) : (
        <>
          <ul className="mon-legend" aria-label={t('Belgilar')}>
            <li><span className="mon-legend__sw mon-legend__sw--a" aria-hidden="true" />{t("O'zlashtirish")}</li>
            <li><span className="mon-legend__sw mon-legend__sw--b" aria-hidden="true" />{t('Sifat')}</li>
          </ul>
          <div className="mon-chart" ref={box} onMouseLeave={() => setHover(null)}>
            {width > 0 && (
              <svg width={W} height={H} role="img" aria-label={t("O'zlashtirish va sifat dinamikasi")}>
                {[0, 25, 50, 75, 100].map((v) => (
                  <g key={v}>
                    <line className="mon-chart__grid" x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} />
                    <text className="mon-chart__axis" x={pad.l - 8} y={y(v) + 4} textAnchor="end">{v}%</text>
                  </g>
                ))}
                {pts.map((p, i) => (
                  <text key={p.month} className="mon-chart__axis" x={x(i)} y={H - 8} textAnchor="middle">{t(monthLabel(p.month))}</text>
                ))}
                {hover !== null && <line className="mon-chart__cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} />}
                <path className="mon-chart__line mon-chart__line--a" d={line('passed')} />
                <path className="mon-chart__line mon-chart__line--b" d={line('quality')} />
                {pts.map((p, i) => (
                  <g key={p.month}>
                    <circle className="mon-chart__dot mon-chart__dot--a" cx={x(i)} cy={y(p.passed)} r={hover === i ? 5 : 4} />
                    <circle className="mon-chart__dot mon-chart__dot--b" cx={x(i)} cy={y(p.quality)} r={hover === i ? 5 : 4} />
                  </g>
                ))}
                {last && (
                  <>
                    <text className="mon-chart__end" x={x(pts.length - 1) + 10} y={ya + 4}>{t("O'zlashtirish")} {Math.round(last.passed)}%</text>
                    <text className="mon-chart__end" x={x(pts.length - 1) + 10} y={yb + 4}>{t('Sifat')} {Math.round(last.quality)}%</text>
                  </>
                )}
                {/* hit areas wider than the marks: one column per month */}
                {pts.map((p, i) => {
                  const half = pts.length > 1 ? iw / (pts.length - 1) / 2 : iw / 2
                  return (
                    <rect key={p.month} className="mon-chart__hit" x={x(i) - half} y={pad.t} width={half * 2} height={ih}
                      onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
                  )
                })}
              </svg>
            )}
            {tip && hover !== null && (
              <div className="mon-tip" style={{ left: Math.min(Math.max(x(hover), 90), W - 90) }} role="status">
                <b>{t(monthLabel(tip.month))} {tip.month.slice(0, 4)}</b>
                <span><i className="mon-legend__sw mon-legend__sw--a" />{t("O'zlashtirish")}: {tip.passed}%</span>
                <span><i className="mon-legend__sw mon-legend__sw--b" />{t('Sifat')}: {tip.quality}%</span>
                <small>{num(tip.marks)} {t('ta baho')}</small>
              </div>
            )}
          </div>
        </>
      )}
      {pts.length > 0 && (
        <details className="mon-table-toggle">
          <summary>{t('Raqamlar jadvali')}</summary>
          <table className="mon-table">
            <thead><tr><th>{t('Oy')}</th><th>{t("O'zlashtirish")}</th><th>{t('Sifat')}</th><th>{t('Baholar')}</th></tr></thead>
            <tbody>
              {pts.map((p) => (
                <tr key={p.month}><td>{t(monthLabel(p.month))} {p.month.slice(0, 4)}</td><td>{p.passed}%</td><td>{p.quality}%</td><td>{num(p.marks)}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </Card>
  )
}

/** Every partner school: pupils, teachers, lessons in the last 30 days and
 *  the subscription. */
export function SchoolsTable({ data }: { data: Monitoring }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  if (!data.schools.length) {
    return <Card title="Maktablar faolligi va obunalar"><p className="mon-empty">{t("Hali hamkor maktab qo'shilmagan.")}</p></Card>
  }
  return (
    <Card title="Maktablar faolligi va obunalar" more={<Link className="mon-card__more" to="/manage/schools">{t('Hamkor maktablar')} ›</Link>}>
      <div className="mon-table-wrap">
        <table className="mon-table mon-table--schools">
          <thead>
            <tr>
              <th>{t('Maktab')}</th>
              <th>{t('Hudud')}</th>
              <th className="num">{t("O'quvchilar")}</th>
              <th className="num">{t('Ustozlar')}</th>
              <th className="num">{t('Darslar (30 kun)')}</th>
              <th>{t('Obuna')}</th>
            </tr>
          </thead>
          <tbody>
            {data.schools.map((s) => (
              <tr key={s.id} onClick={() => navigate(`/manage/schools/${s.id}`)}>
                <td><Link to={`/manage/schools/${s.id}`} onClick={(e) => e.stopPropagation()}>{s.name}</Link></td>
                <td>{s.district || '—'}</td>
                <td className="num">{num(s.pupils)}</td>
                <td className="num">{s.teachers}{s.muhandis ? <small> · {s.muhandis} {t('Muhandis D')}</small> : null}</td>
                <td className="num">{s.lessons_30d}</td>
                <td>
                  <StatusPill tone={LICENCE_TONE[s.licence.state]}>{t(s.licence.label)}</StatusPill>
                  {s.licence.plan && <small className="mon-plan">{t(s.licence.plan)}{s.licence.ends_on ? ` · ${fmtDate(s.licence.ends_on)}` : ''}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Loading() {
  return <div className="mon"><Skeleton lines={6} /></div>
}

/** Bosh sahifa, for the administration: the figures, today's lessons by
 *  school, what waits, the courses and the kits. */
export function HomeMonitoring() {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useMonitoring()
  if (isLoading) return <Loading />
  if (isError || !data) return null
  return (
    <section className="mon" aria-label={t('Platforma monitoringi')}>
      <header className="mon-head">
        <h2>{t('Platforma monitoringi')}</h2>
        <Link className="mon-card__more" to="/statistics?bolim=monitoring">{t("To'liq statistika")} ›</Link>
      </header>
      <KpiTiles data={data} />
      <div className="mon-grid">
        <TodayPanel data={data} />
        <RequestsPanel data={data} />
        <CoursesPanel data={data} />
        <KitsPanel data={data} />
      </div>
    </section>
  )
}

/** Statistika › Monitoring. */
export function MonitoringTab() {
  const { data, isLoading, isError } = useMonitoring()
  const { t } = useTranslation()
  if (isLoading) return <Loading />
  if (isError || !data) return <p className="mon-empty">{t("Ma'lumotni yuklab bo'lmadi.")}</p>
  return (
    <section className="mon">
      <KpiTiles data={data} />
      <MonthlyChart data={data} />
      <div className="mon-grid">
        <TodayPanel data={data} />
        <RequestsPanel data={data} />
      </div>
      <SchoolsTable data={data} />
      <div className="mon-grid">
        <CoursesPanel data={data} />
        <KitsPanel data={data} />
      </div>
    </section>
  )
}
