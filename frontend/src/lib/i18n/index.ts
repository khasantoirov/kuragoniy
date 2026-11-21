import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

/**
 * Ports js/i18n.js's DICT 1:1: Uzbek strings are used directly as
 * translation keys (so `t('Darslar')` needs no 'uz' resource bundle —
 * i18next returns the key verbatim when a bundle/key is missing), while
 * ru/en carry the same full dictionary the old vanilla-JS app shipped.
 * Free-text server content (lesson/experiment text) is translated
 * separately per-document via _ru/_en suffixed fields — see trField.ts.
 */
i18n.use(initReactI18next).init({
  // Uzbek is the keys themselves; ru/en arrive with loadDictionaries()
  resources: { uz: { translation: {} } },
  lng: 'uz',
  fallbackLng: 'uz',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
})

/**
 * The ru/en dictionaries (core.ts, portal.ts, site.ts — about 350 KB) are a
 * chunk of their own: most people use the site in Uzbek and never download
 * them. They load the first time Русский or English is picked (or when the
 * saved choice is one of them — main.tsx waits for that before the first
 * paint).
 */
let loading: Promise<void> | null = null
let loaded = false
const afterLoad: Array<() => void> = []

/** For a lazy page's own ru/en (features/lab, features/landing): added
 * after the main dictionaries, so those keep winning on a shared key (as
 * before the split), and not added at all while the site is in Uzbek. */
export function whenDictionaries(add: () => void) {
  if (loaded) add()
  else afterLoad.push(add)
}

export function loadDictionaries(): Promise<void> {
  loading ??= import('./dicts').then(
    () => {
      loaded = true
      for (const add of afterLoad.splice(0)) add()
    },
    (err: unknown) => {
      loading = null // a dropped connection: try again next time
      throw err
    },
  )
  return loading
}

let wanted = 'uz'
/** Switch the language once its dictionary is here, so the screen never
 * shows a half-translated page. The last pick wins if several are pending. */
export function setLanguage(lang: string): Promise<void> {
  wanted = lang
  const apply = () => {
    if (wanted === lang && i18n.language !== lang) void i18n.changeLanguage(lang)
  }
  if (lang === 'uz') {
    apply()
    return Promise.resolve()
  }
  return loadDictionaries().then(apply, () => {
    // offline and not cached yet: stay in Uzbek rather than break
  })
}

/** Resolves once the language picked at startup is ready to show. */
export function languageReady(): Promise<void> {
  return wanted === 'uz' ? Promise.resolve() : setLanguage(wanted)
}

export default i18n
