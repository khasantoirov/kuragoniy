let ctx: AudioContext | null = null

/**
 * Plays a short two-tone chime for an in-tab notification arrival — no
 * audio asset needed, synthesized directly via the Web Audio API. Reuses
 * one AudioContext across calls since browsers cap how many can exist.
 */
export function playNotifySound() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})

    const now = ctx.currentTime
    ;[[880, now, 0.09], [1320, now + 0.1, 0.12]].forEach(([freq, start, dur]) => {
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.18, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(start)
      osc.stop(start + dur + 0.02)
    })
  } catch {
    // Audio unsupported/blocked — a missed chime isn't worth surfacing an error for.
  }
}
