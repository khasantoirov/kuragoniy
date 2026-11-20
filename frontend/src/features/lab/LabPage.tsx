import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { IC } from '@/icons'

import {
  BENCHES, benchEquipment, benchOf, EQUIP, EquipIcon, equipOf, simsOfBench, simsWith, type BenchId, type EquipId,
} from './equipment'
import { LabRoom } from './LabRoom'
import { LandscapeButton, LandscapeFrame } from './Landscape'
import { useLandscape } from './useLandscape'
import { SimThumb } from './SimThumb'
import { SIMS, type Sim } from './sims'
import './lab.css'
import './i18n'

const isBench = (v: string | null): v is BenchId => BENCHES.some((b) => b.id === v)
const benchMeta = (id: BenchId) => BENCHES.find((b) => b.id === id)!

/** One experiment as a card: a live view (plays while hovered or focused),
 * its name, aim and the equipment it uses. */
function ExpCard({ sim }: { sim: Sim }) {
  const { t } = useTranslation()
  const [live, setLive] = useState(false)
  const bench = benchOf(sim.id)
  const color = bench ? benchMeta(bench).color : 'var(--ink-3)'
  return (
    <Link
      to={`/lab/${sim.id}`}
      className="labexp"
      style={{ ['--bench' as string]: color }}
      onMouseEnter={() => setLive(true)}
      onMouseLeave={() => setLive(false)}
      onFocus={() => setLive(true)}
      onBlur={() => setLive(false)}
    >
      <span className="labexp__view">
        <SimThumb sim={sim} live={live} />
        <span className="labexp__play">{IC.play}</span>
      </span>
      <span className="labexp__body">
        <span className="labexp__t">{t(sim.title)}</span>
        <span className="labexp__d">{t(sim.desc)}</span>
        <span className="labexp__eq">
          {equipOf(sim).map((e) => (
            <span key={e} className="labexp__eqi" title={t(EQUIP[e].name)}><EquipIcon id={e} size={22} /></span>
          ))}
        </span>
      </span>
    </Link>
  )
}

function Crumbs({ here }: { here: string }) {
  const { t } = useTranslation()
  return (
    <nav className="labcrumbs" aria-label={t('Yo‘l')}>
      <Link to="/lab">{IC.flask} {t('Laboratoriya xonasi')}</Link>
      <span aria-hidden="true">›</span>
      <span>{here}</span>
    </nav>
  )
}

function RoomView({ q, setQ }: { q: string; setQ: (v: string) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const land = useLandscape({ auto: true })
  const counts = Object.fromEntries(BENCHES.map((b) => [b.id, simsOfBench(b.id).length])) as Record<BenchId, number>
  const term = q.trim().toLowerCase()
  const found = term
    ? SIMS.filter((s) => `${t(s.title)} ${t(s.desc)} ${s.title} ${equipOf(s).map((e) => t(EQUIP[e].name)).join(' ')}`.toLowerCase().includes(term))
    : []

  return (
    <>
      <div className="labtop">
        <div>
          <h2 className="labtop__t">{t('Virtual fizika laboratoriyasi')}</h2>
          <p className="labtop__s">{t('Stolni yoki jihozlar shkafini tanlang: tajribalarni jonli kuzating, sozlang va o‘lchang.')}</p>
        </div>
        <label className="search labtop__q">
          <span className="search__ic" aria-hidden="true">{IC.search}</span>
          <input className="search__input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Tajriba yoki jihoz qidirish…')} autoComplete="off" />
        </label>
      </div>

      {term ? (
        found.length ? (
          <div className="labexps">{found.map((s) => <ExpCard key={s.id} sim={s} />)}</div>
        ) : (
          <p className="prose">{t('Hech narsa topilmadi')}.</p>
        )
      ) : (
        <>
          <LandscapeFrame on={land.on} onClose={land.close} className="labroom-land">
            <div className="labroom-wrap">
              <LabRoom counts={counts} onBench={(b) => navigate(`/lab?bench=${b}`)} onCabinet={() => navigate('/lab?view=jihozlar')} />
              {!land.on && <LandscapeButton onClick={land.open} className="labroom__land" />}
            </div>
          </LandscapeFrame>
          {/* On a phone the scene's plates are too small to aim at — the
              same benches as big rows under it. */}
          <nav className="labbenches" aria-label={t('Stollar')}>
            {BENCHES.map((b) => (
              <Link key={b.id} to={`/lab?bench=${b.id}`} className="labbench" style={{ ['--bench' as string]: b.color }}>
                <span className="labbench__dot" />
                <span className="labbench__b">
                  <b>{t(b.label)}</b>
                  <small>{t(b.sub)}</small>
                </span>
                <span className="labbench__n">{counts[b.id]} {t('tajriba')}</span>
              </Link>
            ))}
            <Link to="/lab?view=jihozlar" className="labbench" style={{ ['--bench' as string]: '#B45309' }}>
              <span className="labbench__dot" />
              <span className="labbench__b">
                <b>{t('Jihozlar shkafi')}</b>
                <small>{t('Jihozni tanlang — u qaysi tajribalarda ishlatilishini ko‘rasiz.')}</small>
              </span>
            </Link>
          </nav>
        </>
      )}
    </>
  )
}

function BenchView({ bench }: { bench: BenchId }) {
  const { t } = useTranslation()
  const meta = benchMeta(bench)
  const [only, setOnly] = useState<EquipId | null>(null)
  const sims = simsOfBench(bench)
  const shown = only ? sims.filter((s) => equipOf(s).includes(only)) : sims
  return (
    <div style={{ ['--bench' as string]: meta.color }}>
      <Crumbs here={t(meta.label)} />
      <header className="labbhead">
        <h2 className="labbhead__t"><span className="labbhead__dot" />{t(meta.label)}</h2>
        <p className="labbhead__s">{t(meta.sub)} · {sims.length} {t('tajriba')}</p>
      </header>
      <section className="labtable" aria-label={t("Stol ustidagi jihozlar")}>
        <span className="labtable__label">{t("Stol ustidagi jihozlar")} — {t('bosing, shu jihozli tajribalar qoladi')}</span>
        <div className="labtable__row">
          {benchEquipment(bench).map((e) => (
            <button
              key={e}
              type="button"
              className={`labtool ${only === e ? 'is-on' : ''}`}
              aria-pressed={only === e}
              onClick={() => setOnly(only === e ? null : e)}
              title={t(EQUIP[e].hint)}
            >
              <EquipIcon id={e} size={46} />
              <span className="labtool__n">{t(EQUIP[e].name)}</span>
            </button>
          ))}
        </div>
      </section>
      {only && (
        <p className="labfilter">
          {t('Jihoz')}: <b>{t(EQUIP[only].name)}</b> · {shown.length} {t('tajriba')}
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setOnly(null)}>{IC.close} {t('Hammasi')}</button>
        </p>
      )}
      <div className="labexps">{shown.map((s) => <ExpCard key={s.id} sim={s} />)}</div>
    </div>
  )
}

function CabinetView() {
  const { t } = useTranslation()
  const [open, setOpen] = useState<EquipId | null>(null)
  return (
    <div>
      <Crumbs here={t('Jihozlar shkafi')} />
      <header className="labbhead" style={{ ['--bench' as string]: '#B45309' }}>
        <h2 className="labbhead__t"><span className="labbhead__dot" />{t('Jihozlar shkafi')}</h2>
        <p className="labbhead__s">{t('Jihozni tanlang — u qaysi tajribalarda ishlatilishini ko‘rasiz.')}</p>
      </header>
      {BENCHES.map((b) => {
        const items = (Object.keys(EQUIP) as EquipId[]).filter((e) => EQUIP[e].bench === b.id)
        return (
          <section key={b.id} className="labshelf" style={{ ['--bench' as string]: b.color }}>
            <h3 className="labshelf__t">{t(b.label)}</h3>
            <div className="labshelf__row">
              {items.map((e) => {
                const used = simsWith(e)
                return (
                  <div key={e} className={`labitem ${open === e ? 'is-open' : ''}`}>
                    <button type="button" className="labitem__b" aria-expanded={open === e} onClick={() => setOpen(open === e ? null : e)}>
                      <EquipIcon id={e} size={56} />
                      <span className="labitem__n">{t(EQUIP[e].name)}</span>
                      <span className="labitem__h">{t(EQUIP[e].hint)}</span>
                      <span className="labitem__c">{used.length} {t('tajriba')}</span>
                    </button>
                    {open === e && (
                      <ul className="labitem__list">
                        {used.map((s) => <li key={s.id}><Link to={`/lab/${s.id}`}>{t(s.title)}</Link></li>)}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Laboratoriya: the room (benches + cabinet), a bench, or the cabinet —
 * picked by ?bench=<id> / ?view=jihozlar so the browser's Back works. */
export function LabPage() {
  const [params] = useSearchParams()
  const [q, setQ] = useState('')
  const bench = params.get('bench')
  return (
    <div className="labx">
      {isBench(bench) ? <BenchView key={bench} bench={bench} /> : params.get('view') === 'jihozlar' ? <CabinetView /> : <RoomView q={q} setQ={setQ} />}
    </div>
  )
}
