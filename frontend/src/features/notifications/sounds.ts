/** Short notification tones synthesised with WebAudio (no audio files to
 *  ship), plus the user's own sound when they've added one. */

import { getDeviceSettings, type SoundKey } from './device'

export const SOUND_LABELS: Record<Exclude<SoundKey, 'custom'>, string> & { custom: string } = {
  bell: "Qo'ng'iroq",
  short: 'Qisqa',
  alert: 'Ogohlantirish',
  signal: 'Signal',
  soft: 'Yumshoq',
  custom: "O'z ovozim",
  none: "O'chiq",
}

type Note = { f: number; at: number; dur: number; type?: OscillatorType; to?: number }

const PATTERNS: Record<Exclude<SoundKey, 'custom' | 'none'>, Note[]> = {
  bell: [{ f: 880, at: 0, dur: 0.45 }, { f: 1320, at: 0.12, dur: 0.6 }],
  short: [{ f: 1046, at: 0, dur: 0.12 }],
  alert: [{ f: 740, at: 0, dur: 0.1, type: 'square' }, { f: 740, at: 0.16, dur: 0.1, type: 'square' }, { f: 988, at: 0.32, dur: 0.16, type: 'square' }],
  signal: [{ f: 520, at: 0, dur: 0.32, to: 1040, type: 'triangle' }],
  soft: [{ f: 523, at: 0, dur: 0.6, type: 'triangle' }, { f: 659, at: 0.05, dur: 0.6, type: 'triangle' }, { f: 784, at: 0.1, dur: 0.7, type: 'triangle' }],
}

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function playSound(key: SoundKey, volume = getDeviceSettings().volume): void {
  if (key === 'none' || volume <= 0) return
  if (key === 'custom') {
    const src = getDeviceSettings().custom
    if (!src) return
    const el = new Audio(src)
    el.volume = Math.min(1, Math.max(0, volume))
    void el.play().catch(() => {})
    return
  }
  const ac = audio()
  if (!ac) return
  const now = ac.currentTime + 0.02
  for (const n of PATTERNS[key]) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = n.type ?? 'sine'
    osc.frequency.setValueAtTime(n.f, now + n.at)
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, now + n.at + n.dur)
    const peak = 0.22 * volume
    gain.gain.setValueAtTime(0.0001, now + n.at)
    gain.gain.exponentialRampToValueAtTime(peak, now + n.at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.dur)
    osc.connect(gain).connect(ac.destination)
    osc.start(now + n.at)
    osc.stop(now + n.at + n.dur + 0.05)
  }
}
