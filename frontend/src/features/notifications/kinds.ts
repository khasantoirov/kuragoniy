import type { IC } from '@/icons'

import type { NotifyKind } from './api'

/** Icon + accent per kind — the inbox rows, filters and sound list. */
export const KIND_META: Record<NotifyKind, { label: string; icon: keyof typeof IC; tone: string }> = {
  elon: { label: "E'lonlar", icon: 'megaphone', tone: '#2f7bff' },
  hisobot: { label: 'Dars hisobotlari', icon: 'file', tone: '#7c5cff' },
  ragbat: { label: "Rag'batlantirish", icon: 'star', tone: '#e0a020' },
  oquvchi: { label: "O'quvchilar", icon: 'users', tone: '#14a37f' },
  vazifa: { label: 'Vazifalar', icon: 'list', tone: '#2f7bff' },
  tugilgan: { label: "Tug'ilgan kunlar", icon: 'calendar', tone: '#d14d9a' },
  xavfsizlik: { label: 'Kirish va xavfsizlik', icon: 'lock', tone: '#e2465a' },
  dokon: { label: "Do'kon", icon: 'cards', tone: '#f08c2e' },
  jamoa: { label: 'Jamoa', icon: 'users', tone: '#6a73fa' },
  tizim: { label: 'Tizim', icon: 'info', tone: '#7a8194' },
}

export const ALL_KINDS = Object.keys(KIND_META) as NotifyKind[]
