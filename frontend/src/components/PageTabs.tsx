import { type ReactNode, Suspense, useEffect, useRef } from 'react'
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

/** Sibling pages under one menu item: tabs on top, the open one in
 * ?bolim=<key> — the pages keep their own ?tab= and other params. `keep`:
 * params that stay when the tab changes (a filter shared by the tabs);
 * `toolbar`: shown between the tabs and the page. */
export function PageTabs({ tabs, keep = [], toolbar, aside }: { tabs: PageTab[]; keep?: string[]; toolbar?: ReactNode; aside?: ReactNode }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const shown = tabs.filter((x) => x.show !== false)
  const current = shown.find((x) => x.key === params.get('bolim')) ?? shown[0]
  // On a phone the tabs are one row that scrolls sideways: bring the open
  // one into view (sideways only — the page itself doesn't move).
  const barRef = useRef<HTMLDivElement>(null)
  const currentKey = current?.key
  useEffect(() => {
    const bar = barRef.current
    const on = bar?.querySelector<HTMLElement>('.is-on')
    if (!bar || !on || bar.scrollWidth <= bar.clientWidth) return
    bar.scrollLeft = Math.max(0, on.offsetLeft - bar.offsetLeft - 8)
  }, [currentKey])
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
