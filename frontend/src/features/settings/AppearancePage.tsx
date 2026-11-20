import { useTranslation } from 'react-i18next'

import { PageHead } from '@/features/portal/ui'
import { useUIStore, type Lang, type ThemeMode } from '@/store/uiStore'


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


export function AppearancePage() {
  const { t } = useTranslation()
  const s = useUIStore()

  return (
    <div className="setpg">
      <PageHead title={t("Ko'rinish")} sub={t('Tema va til — barcha qurilmalaringizda bir xil')} />

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



    </div>
  )
}
