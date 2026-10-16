/** Appearance settings follow the user across devices ("barcha
 *  qurilmalaringizda bir xil"): on start the server copy wins, after that
 *  every change is saved back (debounced). Mounted once in AppShell. */

import { useEffect, useRef } from 'react'

import { usePrefs, useSavePrefs } from '@/features/notifications/api'
import { NAV_STYLE_KEYS, type NavStyleKey } from '@/layouts/navStyles'
import { MAX_NAV_ITEMS, useUIStore, type Lang, type NavDock, type ThemeMode } from '@/store/uiStore'

type Synced = { themeMode: ThemeMode; lang: Lang; navStyle: NavStyleKey; navDock: NavDock; navLabels: boolean; navItems: string[] }

function pick(): Synced {
  const s = useUIStore.getState()
  return { themeMode: s.themeMode, lang: s.lang, navStyle: s.navStyle, navDock: s.navDock, navLabels: s.navLabels, navItems: s.navItems }
}

function applyServer(ui: Record<string, unknown>) {
  const s = useUIStore.getState()
  if (ui.themeMode === 'system' || ui.themeMode === 'light' || ui.themeMode === 'dark') {
    if (ui.themeMode !== s.themeMode) s.setThemeMode(ui.themeMode)
  }
  if ((ui.lang === 'uz' || ui.lang === 'ru' || ui.lang === 'en') && ui.lang !== s.lang) s.setLang(ui.lang)
  if (typeof ui.navStyle === 'string' && (NAV_STYLE_KEYS as readonly string[]).includes(ui.navStyle)) s.setNavStyle(ui.navStyle as NavStyleKey)
  if (ui.navDock === 'float' || ui.navDock === 'full') s.setNavDock(ui.navDock)
  if (typeof ui.navLabels === 'boolean') s.setNavLabels(ui.navLabels)
  if (Array.isArray(ui.navItems) && ui.navItems.every((x) => typeof x === 'string')) {
    s.setNavItems((ui.navItems as string[]).slice(0, MAX_NAV_ITEMS))
  }
}

export function usePrefsSync(enabled: boolean) {
  const { data } = usePrefs(enabled)
  const save = useSavePrefs()
  const ready = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!data || ready.current) return
    applyServer(data.ui ?? {})
    ready.current = true
  }, [data])

  useEffect(() => {
    if (!enabled) return
    let prev = JSON.stringify(pick())
    return useUIStore.subscribe(() => {
      const next = JSON.stringify(pick())
      if (next === prev || !ready.current) {
        prev = next
        return
      }
      prev = next
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => save.mutate({ ui: pick() }), 800)
    })
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps
}
