import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Grade } from '@/features/lessons/labels'
import i18n from '@/lib/i18n'

export type Lang = 'uz' | 'ru' | 'en'
export type Theme = 'light' | 'dark'
/** What the user picked in Sozlamalar → Ko'rinish; `theme` is the
 *  resolved light/dark actually applied ('system' follows the device). */
export type ThemeMode = 'system' | Theme
export type ViewMode = 'admin' | 'teacher'
/** Butun platformaning ko'rinish uslubi: 'r1' — asl "texnik chizma"
 *  ko'rinishi (standart, legacy.css), 'r2' — EDUMIN uslubidagi ikkinchi
 *  rejim (skin-edumin.css, hammasi `[data-skin="r2"]` ostida). Ikkalasi
 *  ham kunduzgi/tungi mavzu bilan mustaqil birlashadi → 4 kombinatsiya. */
export type Skin = 'r1' | 'r2'

export const DEFAULT_NAV_ITEMS = ['/', '/lessons', '/journal', '/timetable']
export const MAX_NAV_ITEMS = 4

interface UIState {
  lang: Lang
  theme: Theme
  themeMode: ThemeMode
  // Phone bottom bar (Sozlamalar → Ko'rinish): which sections, up to 4;
  // "Menyu" (the side menu with everything) always comes last.
  navItems: string[]
  skin: Skin
  grade: Grade
  viewMode: ViewMode
  // Desktop side menu folded down to icons (the topbar's ≡ button).
  sidebarMini: boolean
  setLang: (lang: Lang) => void
  setTheme: (theme: Theme) => void
  setThemeMode: (mode: ThemeMode) => void
  setNavItems: (items: string[]) => void
  toggleTheme: () => void
  setSkin: (skin: Skin) => void
  setGrade: (grade: Grade) => void
  setViewMode: (mode: ViewMode) => void
  toggleSidebarMini: () => void
}

function applySidebarMini(mini: boolean) {
  document.documentElement.toggleAttribute('data-side-mini', mini)
}

// Brauzer UI rangi (Android manzil paneli, PWA) — har bir rejimning o'z
// topbar foniga mos keladi, shuning uchun mavzu va uslub birga o'qiladi.
const THEME_COLOR: Record<Skin, Record<Theme, string>> = {
  r1: { light: '#12212E', dark: '#0E1620' },
  r2: { light: '#6A73FA', dark: '#1A1D2E' },
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

export function resolveTheme(mode: ThemeMode): Theme {
  return mode === 'system' ? systemTheme() : mode
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
      themeMode: 'light',
      navItems: DEFAULT_NAV_ITEMS,
      setNavItems: (items) => set({ navItems: items.slice(0, MAX_NAV_ITEMS) }),
      setThemeMode: (themeMode) => {
        const theme = resolveTheme(themeMode)
        applyTheme(theme, get().skin)
        set({ themeMode, theme })
      },
      skin: 'r2',
      grade: '1-2',
      viewMode: 'admin',
      sidebarMini: false,
      setGrade: (grade) => set({ grade }),
      setViewMode: (viewMode) => set({ viewMode }),
      toggleSidebarMini: () => {
        const next = !get().sidebarMini
        applySidebarMini(next)
        set({ sidebarMini: next })
      },
      setLang: (lang) => {
        i18n.changeLanguage(lang)
        document.documentElement.lang = lang
        set({ lang })
      },
      setTheme: (theme) => {
        applyTheme(theme, get().skin)
        set({ theme, themeMode: theme })
      },
      toggleTheme: () => {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
        applyTheme(next, get().skin)
        set({ theme: next, themeMode: next })
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
      // v7: themeMode + bottom-bar layout (Sozlamalar → Ko'rinish) — start
      // from what the user already had.
      // v8: one bottom-bar look only — the style/dock/label choices are gone.
      version: 8,
      migrate: (persisted, version) => {
        const state = persisted as UIState & Record<string, unknown>
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
        if (version < 7) {
          state.themeMode = state.theme ?? 'light'
          state.navItems = DEFAULT_NAV_ITEMS
        }
        delete state.navStyle
        delete state.navDock
        delete state.navLabels
        return state
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        applySkin(state.skin)
        if (state.themeMode === 'system') state.theme = resolveTheme('system')
        applyTheme(state.theme, state.skin)
        applySidebarMini(state.sidebarMini)
        i18n.changeLanguage(state.lang)
        document.documentElement.lang = state.lang
      },
    },
  ),
)

// Apply immediately on load too (before any React render / rehydration callback).
if (typeof document !== 'undefined') {
  const { theme, skin, sidebarMini } = useUIStore.getState()
  applySkin(skin)
  applyTheme(theme, skin)
  applySidebarMini(sidebarMini)
  // 'Tizim bo'yicha' keeps following the device's light/dark switch.
  window.matchMedia?.(DARK_QUERY).addEventListener?.('change', () => {
    const state = useUIStore.getState()
    if (state.themeMode !== 'system') return
    const next = resolveTheme('system')
    applyTheme(next, state.skin)
    useUIStore.setState({ theme: next })
  })
}
