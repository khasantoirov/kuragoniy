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
          <div className="gx__card">
            <div className="gx__mark">
              <img src="/logo.png" alt="Amaliy Fizika" width={64} height={64} />
              <img className="gx__sign" src="/muhandis-d-on-dark.png" alt="Muhandis D" width={751} height={160} />
            </div>
            <Outlet />
          </div>

        </div>

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
