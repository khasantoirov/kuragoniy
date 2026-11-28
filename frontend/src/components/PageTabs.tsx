import { type ReactNode, type RefObject, Suspense, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'

import { Skeleton } from '@/components/Skeleton'

export interface PageTab {
  key: string
  label: string
  element: ReactNode
  /** false hides the tab (its role may not see it). */
  show?: boolean
}

/** A tab row that doesn't fit (a phone): it scrolls sideways, the open tab
 *  is brought into view (sideways only — the page doesn't move), and the
 *  side with more tabs fades out (data-fade, styles/settings.css). */
export function useTabScroll(ref: RefObject<HTMLElement | null>, active: unknown) {
  useEffect(() => {
    const bar = ref.current
    if (!bar) return
    const on = bar.querySelector<HTMLElement>('.is-on')
    if (on && bar.scrollWidth > bar.clientWidth) {
      bar.scrollLeft = Math.max(0, on.offsetLeft - bar.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2)
    }
    const mark = () => {
      const more = bar.scrollWidth - bar.clientWidth
      const l = bar.scrollLeft > 2
      const r = more > 2 && bar.scrollLeft < more - 2
      if (l || r) bar.dataset.fade = `${l ? 'l' : ''}${r ? 'r' : ''}`
      else delete bar.dataset.fade
    }
    mark()
    bar.addEventListener('scroll', mark, { passive: true })
    window.addEventListener('resize', mark)
    return () => {
      bar.removeEventListener('scroll', mark)
      window.removeEventListener('resize', mark)
    }
  }, [ref, active])
}

/** Sibling pages under one menu item: tabs on top, the open one in
 * ?bolim=<key> — the pages keep their own ?tab= and other params. `keep`:
 * params that stay when the tab changes (a filter shared by the tabs);
 * `toolbar`: shown between the tabs and the page. */
export function PageTabs({ tabs, keep = [], toolbar, aside }: { tabs: PageTab[]; keep?: string[]; toolbar?: ReactNode; aside?: ReactNode }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const shown = tabs.filter((x) => x.show !== false)
  const current = shown.find((x) => x.key === params.get('bolim')) ?? shown[0]
  const barRef = useRef<HTMLDivElement>(null)
  useTabScroll(barRef, current?.key)
  if (!current) return null
  const bar = shown.length > 1 && (
    <div ref={barRef} className="seg settabs" role="tablist">
      {shown.map((x) => (
        <button
          key={x.key}
          type="button"
          role="tab"
          aria-selected={x === current}
          className={`seg__b ${x === current ? 'is-on' : ''}`}
          onClick={() => setParams((prev) => {
            const next = new URLSearchParams()
            for (const k of keep) {
              const v = prev.get(k)
              if (v) next.set(k, v)
            }
            if (x !== shown[0]) next.set('bolim', x.key)
            return next
          }, { replace: true })}
        >
          {t(x.label)}
        </button>
      ))}
    </div>
  )
  return (
    <>
      {/* `aside` (e.g. the o'quv yili picker) sits at the tabs' right end */}
      {aside ? <div className="settabs-row">{bar}{aside}</div> : bar}
      {toolbar}
      {/* a tab's page is often a lazy chunk: only the page waits, not the tabs */}
      <Suspense fallback={<Skeleton lines={5} />}>{current.element}</Suspense>
    </>
  )
}

/** An old address of a page that moved into PageTabs — bookmarks and links
 * in old notifications land on the right tab, query kept. */
export function MovedTo({ to, bolim }: { to: string; bolim?: string }) {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  if (bolim && !params.has('bolim')) params.set('bolim', bolim)
  const qs = params.toString()
  return <Navigate to={`${to}${qs ? `?${qs}` : ''}`} replace />
}
