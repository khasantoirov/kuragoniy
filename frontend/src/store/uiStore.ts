import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Grade } from '@/features/lessons/labels'
import i18n from '@/lib/i18n'
import type { NavStyleKey } from '@/layouts/navStyles'

export type Lang = 'uz' | 'ru' | 'en'
export type Theme = 'light' | 'dark'
export type ViewMode = 'admin' | 'teacher'

interface UIState {
  lang: Lang
  theme: Theme
  grade: Grade
  viewMode: ViewMode
  navStyle: NavStyleKey
  setLang: (lang: Lang) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setGrade: (grade: Grade) => void
  setViewMode: (mode: ViewMode) => void
  setNavStyle: (style: NavStyleKey) => void
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0E1620' : '#12212E')
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      lang: 'uz',
      theme: 'light',
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
        applyTheme(theme)
        set({ theme })
      },
      toggleTheme: () => {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
        applyTheme(next)
        set({ theme: next })
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
      version: 3,
      migrate: (persisted, version) => {
        const state = persisted as UIState
        if (version < 1) state.navStyle = 'raised'
        if (version < 2) {
          const oldGrade = state.grade as unknown
          state.grade = (oldGrade === 9 || oldGrade === '9' ? '9' : oldGrade === 7 || oldGrade === 8 || oldGrade === '7' || oldGrade === '8' ? '7-8' : '1-2') as UIState['grade']
        }
        if (version < 3) {
          const oldGrade = state.grade as unknown
          state.grade = oldGrade === '7-8' || oldGrade === '9' ? '7-8-9' : (oldGrade as UIState['grade'])
        }
        return state
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        applyTheme(state.theme)
        i18n.changeLanguage(state.lang)
        document.documentElement.lang = state.lang
      },
    },
  ),
)

// Apply immediately on load too (before any React render / rehydration callback).
if (typeof document !== 'undefined') {
  applyTheme(useUIStore.getState().theme)
}
