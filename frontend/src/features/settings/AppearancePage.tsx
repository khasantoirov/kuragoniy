import { useTranslation } from 'react-i18next'

import { PageHead } from '@/features/portal/ui'
import { IC } from '@/icons'
import { isAdmin, useAuth } from '@/lib/auth/AuthContext'
import { useVisibleNavItems } from '@/layouts/navItems'
import { NavRail, type RailItem } from '@/layouts/NavRail'
import { NAV_STYLES } from '@/layouts/navStyles'
import { MAX_NAV_ITEMS, useUIStore, type Lang, type NavDock, type ThemeMode } from '@/store/uiStore'

const LANGS: { k: Lang; label: string }[] = [
  { k: 'uz', label: "O'zbekcha" },
  { k: 'ru', label: 'Ruscha' },
  { k: 'en', label: 'Inglizcha' },
]

const THEMES: { k: ThemeMode; label: string; sub?: string }[] = [
  { k: 'system', label: "Tizim bo'yicha", sub: 'Qurilma sozlamasiga ergashadi' },
  { k: 'light', label: 'Och' },
  { k: 'dark', label: "Qorong'i" },
]

const DOCKS: { k: NavDock; label: string; sub: string }[] = [
  { k: 'float', label: 'Suzuvchi panel', sub: 'Ekran pastida qalqib turadi' },
  { k: 'full', label: "To'liq panel", sub: 'Ekran pastiga yopishadi' },
]

function Choice({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button type="button" className={`choice ${on ? 'is-on' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="choice__t">{title}</span>
      {sub && <span className="choice__s">{sub}</span>}
    </button>
  )
}

export function AppearancePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const s = useUIStore()
  const navItems = useVisibleNavItems().filter((it) => it.to !== '/settings')
  const byPath = new Map(navItems.map((it) => [it.to, it]))
  const chosen = s.navItems.filter((p) => byPath.has(p))
  const addable = navItems.filter((it) => !chosen.includes(it.to))

  const move = (i: number, d: -1 | 1) => {
    const next = [...chosen]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    s.setNavItems(next)
  }

  const previewItems: RailItem[] = [...chosen.map((p) => byPath.get(p)!), { to: '/settings', label: 'Sozlamalar', icon: 'gear' as const }]
    .map((it) => ({ to: it.to, icon: IC[it.icon], label: t(it.label) }))

  return (
    <div className="setpg">
      <PageHead title={t("Ko'rinish")} sub={t('Tema, til va navigatsiya sozlamalari — barcha qurilmalaringizda bir xil')} />

      <section className="panel">
        <h3 className="panel__title">{t('Tema')}</h3>
        <p className="prose prose--note">{t('Ilovaning umumiy ranglari')}</p>
        <div className="choices">
          {THEMES.map((x) => (
            <Choice key={x.k} on={s.themeMode === x.k} onClick={() => s.setThemeMode(x.k)} title={t(x.label)} sub={x.sub && t(x.sub)} />
          ))}
        </div>
      </section>

      <section className="panel">
        <h3 className="panel__title">{t('Til')}</h3>
        <div className="settings__row">
          {LANGS.map((l) => (
            <button key={l.k} type="button" className={`chip settings__opt ${l.k === s.lang ? 'is-on' : ''}`} onClick={() => s.setLang(l.k)}>
              {t(l.label)}
            </button>
          ))}
        </div>
      </section>

      {isAdmin(user ?? null) && (
        <section className="panel">
          <h3 className="panel__title">{t("Ko'rish rejimi")}</h3>
          <div className="pf__mode">
            <button type="button" className={`grade ${s.viewMode === 'admin' ? 'is-on' : ''}`} onClick={() => s.setViewMode('admin')}>{t('Admin')}</button>
            <button type="button" className={`grade ${s.viewMode === 'teacher' ? 'is-on' : ''}`} onClick={() => s.setViewMode('teacher')}>{t("O'qituvchi")}</button>
          </div>
          <p className="form__note">{t("Platformani oddiy o'qituvchi qanday ko'rishini shu yerdan tekshirasiz.")}</p>
        </section>
      )}

      <section className="panel">
        <h3 className="panel__title">{t("Pastki navbar ko'rinishi")}</h3>
        <p className="prose prose--note">{t('Faqat telefonda ko\'rinadi')}</p>
        <div className="choices choices--2">
          {DOCKS.map((x) => (
            <Choice key={x.k} on={s.navDock === x.k} onClick={() => s.setNavDock(x.k)} title={t(x.label)} sub={t(x.sub)} />
          ))}
        </div>
        <label className="check setcheck">
          <input type="checkbox" checked={s.navLabels} onChange={(e) => s.setNavLabels(e.target.checked)} />
          <span>{t("Ikonka tagida bo'lim nomi ko'rinsin")}</span>
        </label>
        <div className={`navpreview bottomnav--${s.navDock} ${s.navLabels ? '' : 'bottomnav--nolabels'}`}>
          <NavRail items={previewItems} activeTo={previewItems[0]?.to ?? ''} styleKey={s.navStyle} interactive={false} />
        </div>
      </section>

      <section className="panel">
        <h3 className="panel__title">{t("Pastki navbar bo'limlari")}</h3>
        <p className="prose prose--note">
          {t("Eng ko'pi 4 ta bo'lim. Tartibni o'zgartirish uchun o'qlardan foydalaning. «Sozlamalar» doim oxirida turadi.")}
        </p>
        <ol className="navpick">
          {chosen.map((p, i) => {
            const it = byPath.get(p)!
            return (
              <li key={p} className="navpick__row">
                <span className="navpick__n">{i + 1}</span>
                <span className="navpick__ic">{IC[it.icon]}</span>
                <span className="navpick__lb">{t(it.label)}</span>
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('Yuqoriga')}>
                  <span className="navpick__up">{IC.chevron}</span>
                </button>
                <button type="button" className="icon-btn" disabled={i === chosen.length - 1} onClick={() => move(i, 1)} aria-label={t('Pastga')}>
                  <span className="navpick__down">{IC.chevron}</span>
                </button>
                <button type="button" className="icon-btn icon-btn--danger" disabled={chosen.length <= 1}
                  onClick={() => s.setNavItems(chosen.filter((x) => x !== p))} aria-label={t('Olib tashlash')}>
                  {IC.close}
                </button>
              </li>
            )
          })}
        </ol>
        {chosen.length < MAX_NAV_ITEMS && addable.length > 0 && (
          <>
            <p className="navpick__addt">{t("Bo'lim qo'shish")}</p>
            <div className="settings__row">
              {addable.map((it) => (
                <button key={it.to} type="button" className="chip" onClick={() => s.setNavItems([...chosen, it.to])}>+ {t(it.label)}</button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h3 className="panel__title">{t('Pastki navigatsiya uslubi')}</h3>
        <p className="prose prose--note">{t("Tugmalar pastki navigatsiya panelida qanday ko'rinishini tanlang.")}</p>
        <div className="navstyle-grid">
          {NAV_STYLES.map((x) => (
            <button key={x.key} type="button" className={`navstyle-card ${x.key === s.navStyle ? 'is-on' : ''}`} onClick={() => s.setNavStyle(x.key)}>
              <span className="navstyle-card__preview">
                <NavRail items={previewItems} activeTo={previewItems[0]?.to ?? ''} styleKey={x.key} interactive={false} />
              </span>
              <span className="navstyle-card__name">{x.label}</span>
              <span className="navstyle-card__desc">{t(x.desc)}</span>
              {x.key === s.navStyle && <span className="navstyle-card__check">{IC.check2}</span>}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
