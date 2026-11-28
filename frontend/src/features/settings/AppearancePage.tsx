import { useTranslation } from 'react-i18next'

import { PageHead } from '@/features/portal/ui'
import { IC } from '@/icons'
import { useUIStore, type Lang, type ThemeMode } from '@/store/uiStore'


/* Tillar o'z nomi bilan (Русский, English) — boshqa tildagi odam ham
   o'z tilini topadi; ostida joriy tildagi nomi, agar farq qilsa. */
const LANGS: { k: Lang; code: string; native: string; label: string }[] = [
  { k: 'uz', code: 'UZ', native: "O'zbekcha", label: "O'zbekcha" },
  { k: 'ru', code: 'RU', native: 'Русский', label: 'Ruscha' },
  { k: 'en', code: 'EN', native: 'English', label: 'Inglizcha' },
]

const THEMES: { k: ThemeMode; label: string }[] = [
  { k: 'system', label: 'Avtomatik' },
  { k: 'light', label: "Yorug'" },
  { k: 'dark', label: "Qorong'i" },
]

/** A small picture of the app in that theme (fixed colours — it shows the
 *  theme, not the current one); «Avtomatik» is half light, half dark. */
function ThemePreview({ mode }: { mode: ThemeMode }) {
  const ui = (tone: 'light' | 'dark', half = false) => (
    <span className={`thui is-${tone} ${half ? 'thui--half' : ''}`}>
      <span className="thui__side"><i /><i /><i /><i /></span>
      <span className="thui__main">
        <span className="thui__bar" />
        <span className="thui__card"><i /><i /><i /></span>
        <span className="thui__row"><span className="thui__card" /><span className="thui__card" /></span>
      </span>
    </span>
  )
  return (
    <span className="thprev" aria-hidden="true">
      {ui(mode === 'dark' ? 'dark' : 'light')}
      {mode === 'system' && ui('dark', true)}
    </span>
  )
}


export function AppearancePage() {
  const { t } = useTranslation()
  const s = useUIStore()

  return (
    <div className="setpg">
      <PageHead title={t("Ko'rinish")} sub={t('Tema va til — barcha qurilmalaringizda bir xil')} />

      <div className="setgrid">
        <section className="panel">
          <h3 className="panel__title">{t('Tema')}</h3>
          <p className="prose prose--note">{t("«Avtomatik» qurilmangizning kunduzgi va tungi rejimiga ergashadi")}</p>
          <div className="thpick" role="radiogroup" aria-label={t('Tema')}>
            {THEMES.map((x) => {
              const on = s.themeMode === x.k
              return (
                <button key={x.k} type="button" role="radio" aria-checked={on} className={`thcard ${on ? 'is-on' : ''}`}
                  onClick={() => s.setThemeMode(x.k)}>
                  <ThemePreview mode={x.k} />
                  <span className="thcard__lb"><span className="thcard__radio" />{t(x.label)}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="panel">
          <h3 className="panel__title">{t('Til')}</h3>
          <p className="prose prose--note">{t("Menyu, tugmalar va xabarlar shu tilda ko'rsatiladi")}</p>
          <div className="optlist" role="radiogroup" aria-label={t('Til')}>
            {LANGS.map((l) => {
              const on = l.k === s.lang
              const sub = t(l.label)
              return (
                <button key={l.k} type="button" role="radio" aria-checked={on} className={`optrow ${on ? 'is-on' : ''}`}
                  onClick={() => s.setLang(l.k)}>
                  <span className="optrow__code">{l.code}</span>
                  <span className="optrow__txt">
                    <span className="optrow__t" lang={l.k}>{l.native}</span>
                    {sub !== l.native && <span className="optrow__s">{sub}</span>}
                  </span>
                  <span className="optrow__check">{on && IC.check}</span>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
