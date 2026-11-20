import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { IC } from '@/icons'

import { LandscapeButton, LandscapeFrame } from './Landscape'
import { useLandscape } from './useLandscape'
import type { Measurement } from './notebook'
import type { Sim } from './sims'

/** Sizes a canvas for the device pixel ratio, mirroring the old fit(). */
function fit(canvas: HTMLCanvasElement) {
  const ratio = window.devicePixelRatio || 1
  const W = canvas.clientWidth || 600
  const H = canvas.clientHeight || 360
  canvas.width = Math.round(W * ratio)
  canvas.height = Math.round(H * ratio)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  return { ctx, W, H }
}

/**
 * Generic engine that drives ANY of the 143 ported simulations from
 * sims.ts, replacing the old openSim()'s hand-rolled DOM/RAF wiring.
 * Owns the canvas, the RAF loop, the slider controls, and the readout
 * panel — the sim itself only supplies data (init/step/draw/read).
 */
export function SimulationCanvas({ sim, onMeasure }: { sim: Sim; onMeasure?: (m: Measurement) => void }) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const readRef = useRef<HTMLDivElement>(null)
  const resetRef = useRef<() => void>(() => {})
  // Pause freezes the physics (step) but keeps drawing, so slider changes
  // still show; the last readouts are what «O'lchash» writes down.
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const lastReadRef = useRef<{ label: string; val: string }[]>([])
  const [flash, setFlash] = useState(0)
  // The stage and its controls, turned sideways to fill a phone.
  const land = useLandscape({ auto: true })

  // Current slider values, keyed by control.k — a ref (not state) since
  // it's read every animation frame and must never trigger a re-render.
  const valsRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const vals: Record<string, number> = {}
    sim.controls.forEach((c) => {
      vals[c.k] = c.val
    })
    valsRef.current = vals
  }, [sim])

  useEffect(() => {
    const canvas = canvasRef.current
    const readEl = readRef.current
    if (!canvas || !readEl) return

    let dims = fit(canvas)
    let state = sim.init(valsRef.current)
    let raf = 0
    let last = 0

    resetRef.current = () => {
      state = sim.init(valsRef.current)
    }

    const ro = new ResizeObserver(() => {
      dims = fit(canvas)
    })
    ro.observe(canvas)

    function loop(ts: number) {
      if (!last) last = ts
      const dt = Math.min((ts - last) / 1000, 0.05)
      last = ts
      if (!pausedRef.current) sim.step(state, dt, valsRef.current)
      const { ctx, W, H } = dims
      ctx.clearRect(0, 0, W, H)
      sim.draw(ctx, W, H, state, valsRef.current)
      // Built via safe DOM APIs (textContent), not innerHTML — sim.read()'s
      // labels/values are hardcoded per-simulation, not user data, but
      // there's no reason for this to be the one HTML-injection-shaped
      // code path in the whole frontend when it doesn't need to be.
      const readings = sim.read(state, valsRef.current)
      lastReadRef.current = readings.map((r) => ({ label: t(r.label), val: String(r.val) }))
      readEl!.replaceChildren(
        ...readings.map((r) => {
          const row = document.createElement('div')
          row.className = 'sim__rb'
          const label = document.createElement('span')
          label.textContent = t(r.label)
          const value = document.createElement('b')
          value.textContent = String(r.val)
          row.append(label, value)
          return row
        }),
      )
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [sim])

  const togglePause = () => {
    pausedRef.current = !pausedRef.current
    setPaused(pausedRef.current)
  }
  const measure = () => {
    if (!onMeasure) return
    onMeasure({ at: Date.now(), vals: { ...valsRef.current }, read: lastReadRef.current })
    setFlash((n) => n + 1)
  }

  return (
    <LandscapeFrame on={land.on} onClose={land.close} className="sim-land">
      <div className="sim">
        <div className={`sim__stage ${paused ? 'is-paused' : ''}`}>
          <canvas ref={canvasRef} className="sim__cv" />
          <div ref={readRef} className="sim__read" />
          {paused && <span className="sim__paused">{IC.pause} {t("To'xtatilgan")}</span>}
          {flash > 0 && <span key={flash} className="sim__flash" aria-hidden="true" />}
          {!land.on && <LandscapeButton onClick={land.open} className="sim__land" />}
        </div>
        <div className="sim__ctrls">
          <h3 className="sim__ctrls-t">{t('Boshqaruv pulti')}</h3>
          {sim.controls.map((c) => (
            <SliderControl key={c.k} def={c} valsRef={valsRef} />
          ))}
          <div className="sim__acts">
            <button type="button" className="btn btn--sm" onClick={togglePause} aria-pressed={paused}>
              {paused ? IC.play : IC.pause} {paused ? t('Davom ettirish') : t("To'xtatish")}
            </button>
            <button type="button" className="btn btn--sm" onClick={() => resetRef.current()}>
              {IC.undo} {t('Boshidan')}
            </button>
          </div>
          {onMeasure && (
            <button type="button" className="btn btn--primary sim__measure" onClick={measure}>
              {IC.clipboard} {t("O'lchash")}
            </button>
          )}
        </div>
      </div>
    </LandscapeFrame>
  )
}

/** Snaps to the nearest step (relative to min) and clamps to range, fixing
 * the float noise repeated +/- clicks would otherwise accumulate. */
function roundToStep(n: number, def: Sim['controls'][number]) {
  const clamped = Math.min(def.max, Math.max(def.min, n))
  const snapped = Math.round((clamped - def.min) / def.step) * def.step + def.min
  const decimals = (String(def.step).split('.')[1] ?? '').length
  return Number(snapped.toFixed(decimals))
}

function SliderControl({
  def,
  valsRef,
}: {
  def: Sim['controls'][number]
  valsRef: MutableRefObject<Record<string, number>>
}) {
  const { t } = useTranslation()
  const [display, setDisplay] = useState(def.val)
  const [numText, setNumText] = useState(String(def.val))

  useEffect(() => {
    setDisplay(def.val)
    setNumText(String(def.val))
  }, [def])

  const commit = (n: number) => {
    const snapped = roundToStep(n, def)
    valsRef.current[def.k] = snapped
    setDisplay(snapped)
    setNumText(String(snapped))
  }

  return (
    <div className="simctl">
      <span className="simctl__top">
        <span>{t(def.label)}</span>
        {def.unit && <span className="simctl__unit">{def.unit}</span>}
      </span>
      <span className="simctl__row">
        <button type="button" className="simctl__btn" aria-label="−" onClick={() => commit(display - def.step)}>
          −
        </button>
        <input
          className="simctl__rng"
          type="range"
          min={def.min}
          max={def.max}
          step={def.step}
          value={display}
          onChange={(e) => commit(Number(e.target.value))}
        />
        <button type="button" className="simctl__btn" aria-label="+" onClick={() => commit(display + def.step)}>
          +
        </button>
        <input
          className="simctl__num"
          type="number"
          min={def.min}
          max={def.max}
          step={def.step}
          value={numText}
          onChange={(e) => setNumText(e.target.value)}
          onBlur={() => {
            const n = Number(numText)
            if (!Number.isNaN(n)) commit(n)
            else setNumText(String(display))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
      </span>
    </div>
  )
}
