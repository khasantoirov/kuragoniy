import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet } from 'react-router-dom'

import { IC, themeIconMoon, themeIconSun } from '@/icons'
import { useUIStore, type Lang } from '@/store/uiStore'

const LANGS: { k: Lang; code: string; label: string }[] = [
  { k: 'uz', code: 'UZ', label: "O'zbekcha" },
  { k: 'ru', code: 'RU', label: 'Русский' },
  { k: 'en', code: 'EN', label: 'English' },
]

const FEATURES: { ic: keyof typeof IC; title: string; text: string }[] = [
  { ic: 'play', title: 'Videodarslar', text: "Qisqa nazariya, formulalar va har bir mavzu bo'yicha video" },
  { ic: 'flask', title: 'Interaktiv laboratoriya', text: "Tajribalarni simulyatsiyada o'zingiz bajaring" },
  { ic: 'check2', title: 'Test va masalalar', text: "Javob darhol tekshiriladi, natija o'qituvchiga boradi" },
  { ic: 'dice', title: "Jonli o'yinlar", text: "Sinf bilan birga viktorina va mini-o'yinlar" },
]

const SOCIALS: { ic: keyof typeof IC; label: string; url: string }[] = [
  { ic: 'telegram', label: 'Telegram', url: 'https://t.me/Muhandis_D' },
  { ic: 'instagram', label: 'Instagram', url: 'https://instagram.com/Muhandis_D' },
  { ic: 'youtube', label: 'YouTube', url: 'https://youtube.com/@Muhandis_D' },
]

function LangMenu() {
  const { lang, setLang } = useUIStore()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const current = LANGS.find((l) => l.k === lang) ?? LANGS[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="gx-lang" ref={box}>
      <button type="button" className="gx-tool" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {IC.globe}
        <span>{current.code}</span>
        <span className={`gx-lang__chev ${open ? 'is-open' : ''}`}>{IC.chevron}</span>
      </button>
      {open && (
        <ul className="gx-lang__menu" role="listbox">
          {LANGS.map((l) => (
            <li key={l.k}>
              <button type="button" role="option" aria-selected={l.k === lang} className={l.k === lang ? 'is-on' : ''}
                onClick={() => { setLang(l.k); setOpen(false) }}>
                <b>{l.code}</b> {l.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A live pendulum on the login screen — drag the length slider and the
 * period follows T = 2π√(l/g). The first thing anyone sees shows what the
 * platform is: physics you can touch, not just read about. */
function Pendulum() {
  const { t } = useTranslation()
  const [len, setLen] = useState(1)
  const arm = useRef<SVGGElement>(null)
  const period = 2 * Math.PI * Math.sqrt(len / 9.81)
  const rod = 70 + len * 62

  useEffect(() => {
    const el = arm.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.setAttribute('transform', 'rotate(18 120 24)')
      return
    }
    const omega = Math.sqrt(9.81 / len)
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const angle = 24 * Math.cos(omega * ((now - start) / 1000))
      el.setAttribute('transform', `rotate(${angle.toFixed(2)} 120 24)`)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [len])

  return (
    <figure className="gx-lab">
      <figcaption className="gx-lab__head">
        <span className="gx-lab__live" /> {t('Jonli tajriba')}: {t('Matematik mayatnik')}
      </figcaption>
      <svg className="gx-lab__svg" viewBox="0 0 240 230" aria-hidden="true">
        <line x1="60" y1="24" x2="180" y2="24" className="gx-lab__beam" />
        <path d="M120 24 v192" className="gx-lab__axis" />
        <g ref={arm}>
          <line x1="120" y1="24" x2="120" y2={24 + rod} className="gx-lab__rod" />
          <circle cx="120" cy={24 + rod} r="13" className="gx-lab__bob" />
        </g>
        <circle cx="120" cy="24" r="4" className="gx-lab__pivot" />
      </svg>
      <label className="gx-lab__ctl">
        <span>{t('Ip uzunligi')}: <b>{len.toFixed(1)} m</b></span>
        <input type="range" min="0.3" max="2" step="0.1" value={len} onChange={(e) => setLen(Number(e.target.value))} />
      </label>
      <p className="gx-lab__out">
        T = 2π√(l/g) = <b>{period.toFixed(2)} s</b>
      </p>
    </figure>
  )
}

export function AuthLayout() {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useUIStore()

  return (
    <div className="gx">
      <div className="gx__bg" aria-hidden="true">
        <span className="gx__blob gx__blob--a" />
        <span className="gx__blob gx__blob--b" />
        <span className="gx__blob gx__blob--c" />
        <span className="gx__ring" />
        <span className="gx__f gx__f--1">F = m·a</span>
        <span className="gx__f gx__f--2">E = mc²</span>
        <span className="gx__f gx__f--3">λ = v/ν</span>
        <span className="gx__f gx__f--4">p = m·v</span>
      </div>

      <header className="gx__top">
        <Link className="gx__brand" to="/login">
          <img src="/logo.png" alt="" width={40} height={40} />
          <span>Amaliy Fizika</span>
        </Link>
        <div className="gx__tools">
          <LangMenu />
          <button type="button" className="gx-tool gx-tool--sq" title={t('Rejim')} aria-label={t('Rejim')} onClick={toggleTheme}>
            {theme === 'dark' ? themeIconMoon() : themeIconSun()}
          </button>
        </div>
      </header>

      <main className="gx__stage">
        <div className="gx__panel">
          <section className="gx__side gx__side--left">
            <p className="gx__eyebrow">{t("Interaktiv o'quv platformasi")}</p>
            <h2 className="gx__headline">{t("Fizikani ko'rib, sinab va tushunib o'rganing")}</h2>
            <ul className="gx__feats">
              {FEATURES.map((f) => (
                <li key={f.title}>
                  <span className="gx__feat-ic">{IC[f.ic]}</span>
                  <span>
                    <b>{t(f.title)}</b>
                    <small>{t(f.text)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <div className="gx__card">
            <div className="gx__mark">
              <img src="/logo.png" alt="Amaliy Fizika" width={64} height={64} />
              <img className="gx__sign gx__sign--day" src="/sign-night.png" alt="Muhandis D" />
            </div>
            <Outlet />
          </div>

          <section className="gx__side gx__side--right">
            <Pendulum />
          </section>
        </div>

        <ul className="gx__chips" aria-label={t('Platforma imkoniyatlari')}>
          {FEATURES.map((f) => (
            <li key={f.title}>{IC[f.ic]} {t(f.title)}</li>
          ))}
        </ul>
      </main>

      <footer className="gx__foot">
        <nav className="gx__social" aria-label={t('Ijtimoiy tarmoqlar')}>
          {SOCIALS.map((s) => (
            <a key={s.ic} href={s.url} target="_blank" rel="noreferrer" aria-label={s.label} title={s.label}>{IC[s.ic]}</a>
          ))}
        </nav>
        <p>© {new Date().getFullYear()} Amaliy Fizika · {t('Barcha huquqlar himoyalangan')}</p>
      </footer>
    </div>
  )
}
