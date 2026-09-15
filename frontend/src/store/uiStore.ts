import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import i18n from '@/lib/i18n'
import type { NavStyleKey } from '@/layouts/navStyles'

export type Lang = 'uz' | 'ru' | 'en'
export type Theme = 'light' | 'dark'
export type ViewMode = 'admin' | 'teacher'

interface UIState {
  lang: Lang
  theme: Theme
  grade: number
  viewMode: ViewMode
  navStyle: NavStyleKey
  setLang: (lang: Lang) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setGrade: (grade: number) => void
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
      grade: 7,
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
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as UIState
        if (version < 1) state.navStyle = 'raised'
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
