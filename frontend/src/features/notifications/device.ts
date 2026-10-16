/** Per-device notification settings (popups, sounds) — "faqat shu
 *  qurilmada saqlanadi": they depend on this browser's permission and
 *  speakers, so they live in localStorage, not on the server. */

import { useSyncExternalStore } from 'react'

import type { NotifyKind } from './api'

export type SoundKey = 'bell' | 'short' | 'alert' | 'signal' | 'soft' | 'custom' | 'none'

export interface DeviceSettings {
  popup: boolean
  sound: boolean
  volume: number // 0..1
  sounds: Partial<Record<NotifyKind, SoundKey>>
  custom: string | null // data: URL of the user's own sound
  customName: string | null
}

const KEY = 'af-notify-device'

export const DEFAULT_SOUNDS: Record<NotifyKind, SoundKey> = {
  elon: 'bell',
  hisobot: 'short',
  ragbat: 'signal',
  oquvchi: 'soft',
  vazifa: 'bell',
  tugilgan: 'soft',
  xavfsizlik: 'alert',
  dokon: 'short',
  jamoa: 'soft',
  tizim: 'signal',
}

const DEFAULTS: DeviceSettings = { popup: false, sound: true, volume: 0.6, sounds: {}, custom: null, customName: null }

let cached: DeviceSettings | null = null
const listeners = new Set<() => void>()

function read(): DeviceSettings {
  if (cached) return cached
  try {
    cached = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || 'null') ?? {}) }
  } catch {
    cached = { ...DEFAULTS }
  }
  return cached!
}

export function getDeviceSettings(): DeviceSettings {
  return read()
}

export function setDeviceSettings(patch: Partial<DeviceSettings>): boolean {
  const next = { ...read(), ...patch }
  cached = next
  let saved = true
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    saved = false // e.g. a custom sound too big for this browser's storage
  }
  listeners.forEach((fn) => fn())
  return saved
}

export function soundFor(kind: NotifyKind): SoundKey {
  const s = read()
  const key = s.sounds[kind] ?? DEFAULT_SOUNDS[kind]
  return key === 'custom' && !s.custom ? DEFAULT_SOUNDS[kind] : key
}

export function useDeviceSettings(): DeviceSettings {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    read,
  )
}
