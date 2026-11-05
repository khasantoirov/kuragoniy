import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHead } from '@/features/portal/ui'
import { IC } from '@/icons'
import { isAdmin, useAuth } from '@/lib/auth/AuthContext'
import { useVisibleNavItems } from '@/layouts/navItems'
import { NavRail, type RailItem } from '@/layouts/NavRail'
import { setDeviceMode, useDeviceMode, type DeviceMode } from '@/lib/deviceMode'
import { MAX_NAV_ITEMS, useUIStore, type Lang, type ThemeMode } from '@/store/uiStore'

import { GradePalettePanel } from './GradePalettePanel'
import { ViewAsPupilModal } from './ViewAsPupilModal'

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

function Choice({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button type="button" className={`choice ${on ? 'is-on' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="choice__t">{title}</span>
      {sub && <span className="choice__s">{sub}</span>}
    </button>
  )
}

const DEVICE_MODES: { k: DeviceMode; label: string; sub: string }[] = [
  { k: 'auto', label: 'Avtomatik', sub: "Ekran o'lchamiga qarab o'zi tanlaydi" },
  { k: 'mobile', label: 'Mobil', sub: "Telefon ko'rinishi: pastki menyu, ixcham kartalar" },
  { k: 'desktop', label: 'Kompyuter', sub: "To'liq ko'rinish — telefonda ham keng jadval va yon menyu" },
]

export function AppearancePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const s = useUIStore()
  const [pickingPupil, setPickingPupil] = useState(false)
  const device = useDeviceMode()
  const navItems = useVisibleNavItems().filter((it) => it.to !== '/settings')
  const byPath = new Map(navItems.map((it) => [it.to, it]))
  const chosen = s.navItems.filter((p) => byPath.has(p))
  const addable = navItems.filter((it) => !chosen.includes(it.to))

  const move = (i: number, d: -1 | 1) => {
    const next = [...chosen]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    s.setNavItems(next)
  }

  const previewItems: RailItem[] = [...chosen.map((p) => byPath.get(p)!), { to: '#menu', label: 'Menyu', icon: 'menu' as const }]
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

      <section className="panel">
        <h3 className="panel__title">{t('Qurilma rejimi')}</h3>
        <p className="prose prose--note">{t("Sayt shu qurilmada qaysi ko'rinishda ochilsin — faqat shu qurilmaga saqlanadi")}</p>
        <div className="choices">
          {DEVICE_MODES.map((x) => (
            <Choice key={x.k} on={device === x.k} onClick={() => setDeviceMode(x.k)} title={t(x.label)} sub={t(x.sub)} />
          ))}
        </div>
      </section>

      {isAdmin(user ?? null) && (
        <section className="panel">
          <h3 className="panel__title">{t("Ko'rish rejimi")}</h3>
          <div className="pf__mode">
            <button type="button" className={`grade ${s.viewMode === 'admin' ? 'is-on' : ''}`} onClick={() => s.setViewMode('admin')}>{t('Admin')}</button>
            <button type="button" className={`grade ${s.viewMode === 'teacher' ? 'is-on' : ''}`} onClick={() => s.setViewMode('teacher')}>{t("O'qituvchi")}</button>
            <button type="button" className="grade" onClick={() => setPickingPupil(true)}>{t("O'quvchi")}…</button>
          </div>
          <p className="form__note">{t("Platformani oddiy o'qituvchi qanday ko'rishini shu yerdan tekshirasiz. «O'quvchi» — tanlangan o'quvchining oynasini uning ko'zi bilan ochadi (faqat ko'rish).")}</p>
          {pickingPupil && <ViewAsPupilModal onClose={() => setPickingPupil(false)} />}
        </section>
      )}

      {user?.is_dev_superuser && <GradePalettePanel />}

      <section className="panel">
        <h3 className="panel__title">{t("Pastki navbar bo'limlari")}</h3>
        <p className="prose prose--note">
          {t("Telefonda ekran pastida turadi. Eng ko'pi 4 ta bo'lim; tartibni o'qlar bilan o'zgartirasiz. Oxirida doim «Menyu» turadi — u yon tomondan barcha bo'limlarni ochadi.")}
        </p>
        <div className="navpreview">
          <NavRail items={previewItems} activeTo={previewItems[0]?.to ?? ''} interactive={false} />
        </div>
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
    </div>
  )
}
