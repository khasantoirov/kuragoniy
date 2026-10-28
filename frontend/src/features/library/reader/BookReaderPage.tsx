import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { IC } from '@/icons'

import { useLibraryItems } from '../api'
import type { LibraryItem } from '../types'
import { COLORS, drawAll, loadInk, MARKER_SIZES, PEN_SIZES, saveInk, touches, type Ink, type Stroke, type Tool } from './ink'
import { clearPageCache, openPdf, peekPage, renderPage, type PDFDocumentProxy } from './pdf'
import { pdfSource } from './source'
import './reader.css'

const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2, 2.5, 3]
const FLIP_MS = 700
const EMPTY: Stroke[] = []

type Flip = { dir: 'next' | 'prev'; from: number; to: number }
type Pen = { tool: Tool; color: string; size: number }

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
const I = {
  prev: svg(<path d="m15 18-6-6 6-6" />),
  next: svg(<path d="m9 18 6-6-6-6" />),
  pen: svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>),
  marker: svg(<><path d="m9 11-6 6v3h9l3-3" /><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" /></>),
  eraser: svg(<><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></>),
  zoomIn: svg(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M11 8v6M8 11h6" /></>),
  zoomOut: svg(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M8 11h6" /></>),
  full: svg(<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />),
  fullExit: svg(<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />),
  one: svg(<rect x="6" y="3" width="12" height="18" rx="2" />),
  two: svg(<><rect x="2" y="4" width="9" height="16" rx="1.5" /><rect x="13" y="4" width="9" height="16" rx="1.5" /></>),
}

function readStore(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked — the reader just won't remember.
  }
}

// ── One page: the rendered PDF page plus its pen layer ────────────────

function PageView({ doc, pageNo, width, height, strokes, pen, onInk }: {
  doc: PDFDocumentProxy
  pageNo: number
  width: number
  height: number
  strokes: Stroke[]
  pen: Pen | null
  onInk: (pageNo: number, strokes: Stroke[]) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLCanvasElement>(null)
  const inkRef = useRef<HTMLCanvasElement>(null)
  const live = useRef<Stroke | null>(null)
  const erasing = useRef(false)
  const frame = useRef(0)

  // Cached pages are drawn before paint, so a page handed over by the
  // turning leaf never blinks white.
  useLayoutEffect(() => {
    let alive = true
    const paint = (src: HTMLCanvasElement) => {
      const c = pageRef.current
      if (!alive || !c) return
      c.width = src.width
      c.height = src.height
      c.getContext('2d')?.drawImage(src, 0, 0)
      boxRef.current?.classList.add('is-ready')
    }
    const cached = peekPage(doc, pageNo, width)
    if (cached) paint(cached)
    else renderPage(doc, pageNo, width).then(paint).catch(() => {})
    return () => {
      alive = false
    }
  }, [doc, pageNo, width])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  useEffect(() => {
    const c = inkRef.current
    if (!c) return
    const pr = Math.min(2, window.devicePixelRatio || 1)
    c.width = Math.round(width * pr)
    c.height = Math.round(height * pr)
    drawAll(c, strokes)
  }, [strokes, width, height])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    const y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height))
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000] as const
  }
  const erase = (x: number, y: number) => {
    const rest = strokes.filter((s) => !touches(s, x, y, 10 / width, height / width))
    if (rest.length !== strokes.length) onInk(pageNo, rest)
  }
  const redrawLive = () => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => inkRef.current && drawAll(inkRef.current, strokes, live.current))
  }

  const handlers = pen ? {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // No capture (e.g. the pointer already left) — drawing still works.
      }
      const [x, y] = point(e)
      if (pen.tool === 'eraser') {
        erasing.current = true
        erase(x, y)
      } else {
        live.current = { t: pen.tool, c: pen.color, s: pen.size / width, p: [x, y] }
        redrawLive()
      }
    },
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!live.current && !erasing.current) return
      const [x, y] = point(e)
      if (erasing.current) return erase(x, y)
      const p = live.current!.p
      const dx = x - p[p.length - 2]
      const dy = y - p[p.length - 1]
      if (dx * dx + dy * dy < 0.000004) return
      p.push(x, y)
      redrawLive()
    },
    onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.stopPropagation()
      // A frame still queued from the last move would repaint the old
      // strokes over the committed one.
      cancelAnimationFrame(frame.current)
      erasing.current = false
      if (live.current) onInk(pageNo, [...strokes, live.current])
      live.current = null
    },
  } : {}

  return (
    <div ref={boxRef} className="bkr-page" style={{ width, height }}>
      <canvas ref={pageRef} className="bkr-page__img" />
      <canvas ref={inkRef} className={`bkr-page__ink ${pen ? `is-on is-${pen.tool}` : ''}`} {...handlers} />
    </div>
  )
}

// ── The reader ─────────────────────────────────────────────────────────

function Reader({ item, src, onClose }: { item: LibraryItem; src: string; onClose: () => void }) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const reduced = useRef(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const pageKey = `af-book-${item.id}-page`
  const inkKey = `af-book-${item.id}-ink`

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [ratio, setRatio] = useState(1.414)
  const [progress, setProgress] = useState(0)
  const [failed, setFailed] = useState(false)
  const [page, setPage] = useState(() => Number(readStore(pageKey)) || 1)
  const [spread, setSpread] = useState(() => {
    const saved = readStore('af-book-layout')
    return saved ? saved === 'spread' : window.innerWidth >= 900 && window.innerWidth > window.innerHeight
  })
  const [zoom, setZoom] = useState(1)
  const [flip, setFlip] = useState<Flip | null>(null)
  const [penOn, setPenOn] = useState(false)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[1])
  const [sizeIdx, setSizeIdx] = useState(1)
  const [ink, setInk] = useState<Ink>(() => loadInk(inkKey))
  const [history, setHistory] = useState<Ink[]>([])
  const [draft, setDraft] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const [stage, setStage] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const task = openPdf(src, setProgress)
    let alive = true
    task.promise
      .then(async (d) => {
        const first = await d.getPage(1)
        const v = first.getViewport({ scale: 1 })
        if (!alive) return
        setRatio(v.height / v.width)
        setDoc(d)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
      clearPageCache()
      task.close()
    }
  }, [src])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onFull = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFull)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('fullscreenchange', onFull)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
  }, [])

  const n = doc?.numPages ?? 0
  const startOf = (p: number) => (spread && p % 2 === 0 ? p - 1 : p)
  const cur = startOf(Math.min(Math.max(1, page), Math.max(1, n)))
  const step = spread ? 2 : 1

  // Page size: the whole page (or spread) fits the screen at 100%.
  const narrow = stage.w < 700
  const availW = Math.max(160, stage.w - (narrow ? 16 : 136))
  // clientHeight includes the stage padding that keeps the toolbar clear.
  const availH = Math.max(160, stage.h - (narrow ? 92 : 108))
  const fit = spread ? Math.min(availW / 2, availH / ratio) : Math.min(availW, availH / ratio)
  const pw = Math.max(80, Math.floor(fit * zoom))
  const ph = Math.round(pw * ratio)

  const go = (target: number) => {
    if (!n || flip) return
    const to = startOf(Math.min(Math.max(1, target), n))
    setDraft(null)
    if (to === cur) return
    if (reduced.current) setPage(to)
    else setFlip({ dir: to > cur ? 'next' : 'prev', from: cur, to })
  }

  useEffect(() => {
    if (!flip) return
    const id = setTimeout(() => {
      setPage(flip.to)
      setFlip(null)
    }, FLIP_MS)
    return () => clearTimeout(id)
  }, [flip])

  useEffect(() => {
    if (n) writeStore(pageKey, String(cur))
  }, [cur, n, pageKey])

  // Render the neighbouring pages ahead, so turning is instant.
  useEffect(() => {
    if (!doc || flip) return
    const id = setTimeout(() => {
      for (const p of [cur + step, cur + step + 1, cur - step, cur - step + 1, cur + 2 * step]) {
        if (p >= 1 && p <= n) renderPage(doc, p, pw).catch(() => {})
      }
    }, 200)
    return () => clearTimeout(id)
  }, [doc, cur, step, pw, n, flip])

  useEffect(() => {
    const id = setTimeout(() => saveInk(inkKey, ink), 400)
    return () => clearTimeout(id)
  }, [ink, inkKey])

  const zoomBy = (d: number) => {
    const i = ZOOMS.reduce((best, z, k) => (Math.abs(z - zoom) < Math.abs(ZOOMS[best] - zoom) ? k : best), 0)
    setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + d))])
  }
  const toggleSpread = () => {
    setSpread((s) => {
      writeStore('af-book-layout', s ? 'single' : 'spread')
      return !s
    })
  }
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void rootRef.current?.requestFullscreen?.().catch(() => {})
  }

  const changeInk = (pageNo: number, strokes: Stroke[]) => {
    setHistory((h) => [...h.slice(-39), ink])
    setInk((all) => ({ ...all, [pageNo]: strokes }))
  }
  const undo = () => {
    const prev = history[history.length - 1]
    if (!prev) return
    setInk(prev)
    setHistory((h) => h.slice(0, -1))
  }
  const visible = spread ? [cur, cur + 1] : [cur]
  const hasInkHere = visible.some((p) => ink[p]?.length)
  const clearHere = () => {
    if (!hasInkHere) return
    setHistory((h) => [...h.slice(-39), ink])
    setInk((all) => ({ ...all, ...Object.fromEntries(visible.map((p) => [p, []])) }))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault()
        go(cur + step)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        go(cur - step)
      } else if (e.key === 'Home') go(1)
      else if (e.key === 'End') go(n)
      else if (e.key === '+' || e.key === '=') zoomBy(1)
      else if (e.key === '-') zoomBy(-1)
      else if (e.key === 'Escape' && !document.fullscreenElement) {
        if (penOn) setPenOn(false)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pen: Pen | null = penOn && !flip ? { tool, color, size: (tool === 'marker' ? MARKER_SIZES : PEN_SIZES)[sizeIdx] } : null
  const face = (p: number, live = false) =>
    doc && p >= 1 && p <= n ? (
      <PageView key={p} doc={doc} pageNo={p} width={pw} height={ph} strokes={ink[p] ?? EMPTY} pen={live ? pen : null} onInk={changeInk} />
    ) : (
      <div className="bkr-page bkr-page--blank" style={{ width: pw, height: ph }} />
    )

  let book: ReactNode = null
  if (doc && stage.w) {
    if (spread) {
      const [l, r] = !flip ? [cur, cur + 1] : flip.dir === 'next' ? [flip.from, flip.to + 1] : [flip.to, flip.from + 1]
      book = (
        <div className="bkr-book is-spread" style={{ width: pw * 2, height: ph }}>
          <div className="bkr-book__half">{face(l, !flip)}</div>
          <div className="bkr-book__half">{face(r, !flip)}</div>
          {flip && (
            <div className={`bkr-leaf bkr-leaf--${flip.dir}`}
              style={{ width: pw, height: ph, left: flip.dir === 'next' ? pw : 0, animationDuration: `${FLIP_MS}ms` }}>
              <div className="bkr-face">{face(flip.dir === 'next' ? flip.from + 1 : flip.from)}</div>
              <div className="bkr-face bkr-face--back">{face(flip.dir === 'next' ? flip.to : flip.to + 1)}</div>
            </div>
          )}
          <span className="bkr-book__spine" aria-hidden="true" />
        </div>
      )
    } else {
      const under = !flip ? cur : flip.dir === 'next' ? flip.to : flip.from
      book = (
        <div className="bkr-book" style={{ width: pw, height: ph }}>
          {face(under, !flip)}
          {flip && (
            <div className={`bkr-leaf bkr-leaf--single-${flip.dir}`} style={{ width: pw, height: ph, left: 0, animationDuration: `${FLIP_MS}ms` }}>
              <div className="bkr-face">{face(flip.dir === 'next' ? flip.from : flip.to)}</div>
              <div className="bkr-face bkr-face--back"><div className="bkr-page bkr-page--blank" style={{ width: pw, height: ph }} /></div>
            </div>
          )}
        </div>
      )
    }
  }

  const sizes = tool === 'marker' ? MARKER_SIZES : PEN_SIZES

  return (
    <div ref={rootRef} className={`bkr ${penOn ? 'is-pen' : ''}`} role="dialog" aria-label={item.title}>
      <header className="bkr__top">
        <span className="bkr__brand">{IC.book}</span>
        <h1 className="bkr__title">{item.title}</h1>
        <div className="bkr__topacts">
          {item.file && (
            <a className="bkr__ibtn" href={item.file} download title={t('Yuklab olish')} aria-label={t('Yuklab olish')}>{IC.download}</a>
          )}
          <button type="button" className="bkr__close" onClick={onClose}>{IC.close} <span>{t('Yopish')}</span></button>
        </div>
      </header>

      <div
        ref={stageRef}
        className={`bkr__stage ${zoom > 1 ? 'is-zoomed' : ''}`}
        onPointerDown={(e) => { swipe.current = !penOn && zoom <= 1 ? { x: e.clientX, y: e.clientY } : null }}
        onPointerUp={(e) => {
          const s = swipe.current
          swipe.current = null
          if (!s) return
          const dx = e.clientX - s.x
          if (Math.abs(dx) > 70 && Math.abs(e.clientY - s.y) < 90) go(dx < 0 ? cur + step : cur - step)
        }}
      >
        {book}
        {!doc && !failed && (
          <div className="bkr__msg">
            <span className="bkr__spin" aria-hidden="true" />
            <span>{t('Kitob yuklanmoqda…')}{progress > 0.01 ? ` ${Math.round(progress * 100)}%` : ''}</span>
          </div>
        )}
        {failed && (
          <div className="bkr__msg bkr__msg--err">
            <span>{t("Kitobni ochib bo'lmadi.")}</span>
            {item.file && <a className="bkr__close" href={item.file} download>{IC.download} {t('Yuklab olish')}</a>}
          </div>
        )}
      </div>

      {doc && (
        <>
          <button type="button" className="bkr__side bkr__side--prev" onClick={() => go(cur - step)} disabled={cur <= 1} aria-label={t('Oldingi sahifa')}>{I.prev}</button>
          <button type="button" className="bkr__side bkr__side--next" onClick={() => go(cur + step)} disabled={cur + step > n} aria-label={t('Keyingi sahifa')}>{I.next}</button>
        </>
      )}

      {penOn && (
        <div className="bkr-pen" role="toolbar" aria-label={t('Qalam')}>
          {(['pen', 'marker', 'eraser'] as Tool[]).map((k) => (
            <button key={k} type="button" className={`bkr-pen__b ${tool === k ? 'is-on' : ''}`} onClick={() => setTool(k)}
              title={t({ pen: 'Qalam', marker: 'Marker', eraser: "O'chirg'ich" }[k])}>{I[k]}</button>
          ))}
          <span className="bkr-pen__sep" />
          {sizes.map((s, i) => (
            <button key={s} type="button" className={`bkr-pen__b ${sizeIdx === i ? 'is-on' : ''}`} onClick={() => setSizeIdx(i)} title={t("Qalinlik")}>
              <span className="bkr-pen__dot" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
            </button>
          ))}
          <span className="bkr-pen__sep" />
          {COLORS.map((c) => (
            <button key={c} type="button" className={`bkr-pen__c ${color === c ? 'is-on' : ''}`} style={{ background: c }}
              onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen') }} aria-label={c} />
          ))}
          <label className="bkr-pen__c bkr-pen__c--any" title={t('Boshqa rang')}>
            <input type="color" value={color} onChange={(e) => { setColor(e.target.value); if (tool === 'eraser') setTool('pen') }} />
          </label>
          <span className="bkr-pen__sep" />
          <button type="button" className="bkr-pen__b" onClick={undo} disabled={!history.length} title={t('Ortga qaytarish')}>{IC.undo}</button>
          <button type="button" className="bkr-pen__b bkr-pen__b--danger" onClick={clearHere} disabled={!hasInkHere} title={t('Sahifadagi chizmalarni tozalash')}>{IC.trash}</button>
        </div>
      )}

      <nav className="bkr-bar" aria-label={t('Kitob boshqaruvi')}>
        <div className="bkr-bar__pager">
          <button type="button" className="bkr-bar__nav" onClick={() => go(cur - step)} disabled={!doc || cur <= 1} aria-label={t('Oldingi sahifa')}>{I.prev}</button>
          <input
            className="bkr-bar__pin"
            inputMode="numeric"
            aria-label={t('Sahifa')}
            value={draft ?? String(doc ? cur : '')}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                go(Number(draft) || cur)
                e.currentTarget.blur()
              }
            }}
          />
          <span className="bkr-bar__of">/ {n || '…'}</span>
          <button type="button" className="bkr-bar__nav" onClick={() => go(cur + step)} disabled={!doc || cur + step > n} aria-label={t('Keyingi sahifa')}>{I.next}</button>
        </div>
        <span className="bkr-bar__sep" />
        <button type="button" className="bkr-bar__b" onClick={toggleSpread} title={spread ? t('Bitta sahifa') : t('Ikki sahifa')}>
          {spread ? I.two : I.one}
        </button>
        <button type="button" className={`bkr-bar__b ${penOn ? 'is-on' : ''}`} onClick={() => setPenOn((v) => !v)} title={t('Qalam')} aria-pressed={penOn}>{I.pen}</button>
        <span className="bkr-bar__sep" />
        <button type="button" className="bkr-bar__b bkr-bar__z" onClick={() => zoomBy(-1)} disabled={zoom <= ZOOMS[0]} title={t('Kichiklashtirish')}>{I.zoomOut}</button>
        <button type="button" className="bkr-bar__zoom" onClick={() => setZoom(1)} title={t('Asl o\'lcham')}>{Math.round(zoom * 100)}%</button>
        <button type="button" className="bkr-bar__b bkr-bar__z" onClick={() => zoomBy(1)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} title={t('Kattalashtirish')}>{I.zoomIn}</button>
        {document.fullscreenEnabled && (
          <>
            <span className="bkr-bar__sep" />
            <button type="button" className="bkr-bar__b" onClick={toggleFull} title={t("To'liq ekran")}>{full ? I.fullExit : I.full}</button>
          </>
        )}
      </nav>
    </div>
  )
}

/** /library/:id/read — a library PDF as a book: two-page spreads with a
 * page-turn animation, page jump, zoom, full screen and pen notes. */
export function BookReaderPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: items, isLoading } = useLibraryItems()
  const close = useCallback(() => navigate('/library'), [navigate])
  const item = items?.find((x) => String(x.id) === id)
  const src = item ? pdfSource(item) : null

  if (item && src) return <Reader key={item.id} item={item} src={src} onClose={close} />
  return (
    <div className="bkr">
      <header className="bkr__top">
        <span className="bkr__brand">{IC.book}</span>
        <h1 className="bkr__title">{item?.title ?? t('Kutubxona')}</h1>
        <div className="bkr__topacts">
          <button type="button" className="bkr__close" onClick={close}>{IC.close} <span>{t('Yopish')}</span></button>
        </div>
      </header>
      <div className="bkr__stage">
        <div className={`bkr__msg ${isLoading ? '' : 'bkr__msg--err'}`}>
          {isLoading ? (
            <><span className="bkr__spin" aria-hidden="true" /><span>{t('Yuklanmoqda…')}</span></>
          ) : (
            <span>{item ? t("Bu material PDF emas — uni varaqlab bo'lmaydi.") : t('Material topilmadi.')}</span>
          )}
        </div>
      </div>
    </div>
  )
}
