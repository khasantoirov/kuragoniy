import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { api } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'

/* Optional sections the administration can switch off (Boshqaruv →
   Modullar; backend common/modules.py). Off hides a section from the menu,
   the tabs, the home tiles and the student portal, and its addresses lead
   home; its data stays. */

export type ModuleKey = 'lab' | 'library' | 'timetable' | 'assignments' | 'games' | 'reports' | 'readiness' | 'shop' | 'equipment' | 'poster'

/** This platform's optional sections, in the order Modullar lists them. */
export const MODULES: { key: ModuleKey; label: string; sub: string }[] = [
  { key: 'library', label: "Kutubxona", sub: "Kitoblar, qo'llanmalar va videolar" },
  { key: 'timetable', label: "Jadval", sub: "Haftalik dars jadvali va bosh sahifadagi «Bugungi darslar»" },
  { key: 'assignments', label: "Vazifalar", sub: "Uyga vazifa: o'qituvchi beradi, o'quvchi portalida bajariladi" },
  { key: 'games', label: "O'yinlar", sub: "Jonli viktorina va mini-o'yinlar, o'quvchi portalida ham" },
  { key: 'reports', label: "Dars hisobotlari", sub: "O'qituvchi topshiradi, ma'muriyat baholaydi" },
  { key: 'readiness', label: "Darsga tayyorgarlik", sub: "O'qituvchining darsdan oldingi o'z-o'zini tekshirishi" },
  { key: 'shop', label: "Do'kon", sub: "Dars ishlanmalari va tajriba to'plamlari savdosi" },
  { key: 'equipment', label: "Jihozlar jadvali", sub: "Darslar uchun rasmli jihozlar ro'yxati" },
]

export interface ModulesState {
  modules: Record<ModuleKey, boolean>
  /** Administrators only: rows each section holds (null: nothing stored). */
  usage?: Record<ModuleKey, number | null>
  /** How marks are coloured, for everyone — the developer's pick. */
  grade_palette?: GradePalette
}

/** The four ways marks can be coloured (styles/settings.css, <html data-grades>). */
export type GradePalette = 'aralash' | 'tonal' | 'klassik' | 'chiziq'
export const GRADE_PALETTES: { key: GradePalette; label: string; sub: string }[] = [
  { key: 'aralash', label: 'Aralash', sub: "A'lo va yomon to'liq rangli, o'rtadagilari och fonda" },
  { key: 'tonal', label: 'Tonal juftlik', sub: "Har baho bir rang tusida: och fon, o'sha rangning to'q raqami" },
  { key: 'klassik', label: 'Klassik shkala', sub: "To'liq bo'yalgan bloklar, raqam oq yoki to'q" },
  { key: 'chiziq', label: 'Neytral + chiziq', sub: "Raqam neytral, darajani chapdagi rangli chiziq ko'rsatadi" },
]

/** Puts the platform's mark colours on the page (both portals call it). */
export function useGradePalette() {
  const { data } = useModules()
  const palette = data?.grade_palette ?? 'aralash'
  useEffect(() => {
    document.documentElement.dataset.grades = palette
  }, [palette])
}

export function useModules() {
  const { user } = useAuth()
  const q = useQuery({
    queryKey: ['modules'],
    queryFn: async () => (await api.get<ModulesState>('/common/modules/')).data,
    enabled: !!user,
    staleTime: 5 * 60_000,
  })
  // until it has loaded (or if it fails) everything stays on
  const on = (key: ModuleKey) => q.data?.modules?.[key] !== false
  return { on, data: q.data }
}

/** Menu items and pages that belong to modules: shown while any is on. */
const ROUTE_MODULES: Record<string, ModuleKey[]> = {
  '/timetable': ['timetable'],
  '/library': ['library'],
  '/lab': ['lab'],
  '/assignments': ['assignments', 'games'],
  '/reports': ['reports'],
  '/shop': ['shop'],
  '/manage/equipment': ['equipment'],
  '/equipment-sheet': ['equipment'],
  '/s/homework': ['assignments'],
  '/s/games': ['games'],
}

export function routeOn(to: string, on: (key: ModuleKey) => boolean) {
  const keys = ROUTE_MODULES[to]
  return !keys || keys.some(on)
}
