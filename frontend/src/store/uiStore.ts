import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Grade } from '@/features/lessons/labels'
import i18n from '@/lib/i18n'
import type { NavStyleKey } from '@/layouts/navStyles'

export type Lang = 'uz' | 'ru' | 'en'
export type Theme = 'light' | 'dark'
export type ViewMode = 'admin' | 'teacher'
/** Butun platformaning ko'rinish uslubi: 'r1' — asl "texnik chizma"
 *  ko'rinishi (standart, legacy.css), 'r2' — EDUMIN uslubidagi ikkinchi
 *  rejim (skin-edumin.css, hammasi `[data-skin="r2"]` ostida). Ikkalasi
 *  ham kunduzgi/tungi mavzu bilan mustaqil birlashadi → 4 kombinatsiya. */
export type Skin = 'r1' | 'r2'

interface UIState {
  lang: Lang
  theme: Theme
  skin: Skin
  grade: Grade
  viewMode: ViewMode
  navStyle: NavStyleKey
  setLang: (lang: Lang) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setSkin: (skin: Skin) => void
  setGrade: (grade: Grade) => void
  setViewMode: (mode: ViewMode) => void
  setNavStyle: (style: NavStyleKey) => void
}

// Brauzer UI rangi (Android manzil paneli, PWA) — har bir rejimning o'z
// topbar foniga mos keladi, shuning uchun mavzu va uslub birga o'qiladi.
const THEME_COLOR: Record<Skin, Record<Theme, string>> = {
  r1: { light: '#12212E', dark: '#0E1620' },
  r2: { light: '#6A73FA', dark: '#1A1D2E' },
}

function applyTheme(theme: Theme, skin: Skin) {
  document.documentElement.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[skin][theme])
}

// 2-rejim Robotoda yozilgan. Shriftni index.html'ga qo'shish 1-rejim
// foydalanuvchilariga ham qo'shimcha so'rov qo'shardi (standart rejim —
// 1-rejim, ya'ni ko'pchilikka), shuning uchun u faqat 2-rejim yoqilganda
// bir marta qo'shiladi.
const SKIN_FONT_ID = 'skin-r2-font'

function loadSkinFont() {
  if (document.getElementById(SKIN_FONT_ID)) return
  const link = document.createElement('link')
  link.id = SKIN_FONT_ID
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Condensed:wght@700&display=swap'
  document.head.appendChild(link)
}

function applySkin(skin: Skin) {
  document.documentElement.setAttribute('data-skin', skin)
  if (skin === 'r2') loadSkinFont()
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      lang: 'uz',
      theme: 'light',
      skin: 'r2',
      grade: '1-2',
      viewMode: 'admin',
      navStyle: 'raised',
      setGrade: (grade) => set({ grade }),
      setViewMode: (viewMode) => set({ viewMode }),
      setNavStyle: (navStyle) => set({ navStyle }),
      setLang: (lang) => {
        i18n.changeLanguage(lang)
        document.documentElement.lang = lang
        set({ lang })
      },
      setTheme: (theme) => {
        applyTheme(theme, get().skin)
        set({ theme })
      },
      toggleTheme: () => {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
        applyTheme(next, get().skin)
        set({ theme: next })
      },
      setSkin: (skin) => {
        applySkin(skin)
        applyTheme(get().theme, skin)
        set({ skin })
      },
    }),
    {
      name: 'afmd-ui',
      // v1: default nav style changed to 'raised' — force it once for
      // anyone whose browser already had 'orbit' (the old default) saved,
      // not just fresh installs. A user who deliberately picks a different
      // style afterward saves under version 1 and won't be migrated again.
      // v2: `grade` changed from a bare physics grade number (7/8/9) to a
      // grade-band code ('1-2'…'9') — map any old persisted number onto
      // its nearest band so a returning browser doesn't carry an invalid
      // grade into the new picker.
      // v3: the '7-8' and '9' bands merged into one '7-8-9' band.
      // v4: `skin` added (the EDUMIN second look). Anyone with a saved
      // state predates the choice, so they stay on 'r1' — switching an
      // existing user's whole platform look without them asking would be
      // the opposite of an opt-in preference.
      // v5: 1-rejim retired. 'r2' is now the platform's only look, so the
      // picker is gone from Sozlamalar and everyone — including anyone who
      // had deliberately chosen 'r1' — moves over. The 'r1' branch in
      // AppShell and the r1-only rules in legacy.css are left in place for
      // now and get removed in a follow-up, once this has settled in
      // production.
      // v6: the '7-8-9' band splits into '7' (Elektronika) and '8-9'
      // (Amaliy loyihalar). A browser still holding '7-8-9' would otherwise
      // select a grade the picker no longer offers and show an empty list;
      // it lands on '7', which is where every existing lesson from the old
      // band went (see lessons/migrations/0011).
      version: 6,
      migrate: (persisted, version) => {
        const state = persisted as UIState
        if (version < 1) state.navStyle = 'raised'
        if (version < 2) {
          const oldGrade = state.grade as unknown
          state.grade = (oldGrade === 9 || oldGrade === '9' ? '9' : oldGrade === 7 || oldGrade === 8 || oldGrade === '7' || oldGrade === '8' ? '7-8' : '1-2') as UIState['grade']
        }
        if (version < 3) {
          const oldGrade = state.grade as unknown
          // '7-8-9' is no longer a band of its own (see v6), but this step
          // still writes it so the chain stays faithful to what a v2
          // browser actually held — v6 below then maps it onto '7'.
          state.grade = (oldGrade === '7-8' || oldGrade === '9' ? '7-8-9' : oldGrade) as UIState['grade']
        }
        if (version < 5) state.skin = 'r2'
        if (version < 6 && (state.grade as unknown) === '7-8-9') state.grade = '7'
        return state
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        applySkin(state.skin)
        applyTheme(state.theme, state.skin)
        i18n.changeLanguage(state.lang)
        document.documentElement.lang = state.lang
      },
    },
  ),
)

// Apply immediately on load too (before any React render / rehydration callback).
if (typeof document !== 'undefined') {
  const { theme, skin } = useUIStore.getState()
  applySkin(skin)
  applyTheme(theme, skin)
}
