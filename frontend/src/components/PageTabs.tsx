import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'

export interface PageTab {
  key: string
  label: string
  element: ReactNode
  /** false hides the tab (its role may not see it). */
  show?: boolean
}

/** Sibling pages under one menu item: tabs on top, the open one in
 * ?bolim=<key> — the pages keep their own ?tab= and other params. */
export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const shown = tabs.filter((x) => x.show !== false)
  const current = shown.find((x) => x.key === params.get('bolim')) ?? shown[0]
  if (!current) return null
  return (
    <>
      {shown.length > 1 && (
        <div className="seg settabs" role="tablist">
          {shown.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={x === current}
              className={`seg__b ${x === current ? 'is-on' : ''}`}
              onClick={() => setParams(x === shown[0] ? {} : { bolim: x.key }, { replace: true })}
            >
              {t(x.label)}
            </button>
          ))}
        </div>
      )}
      {current.element}
    </>
  )
}

/** An old address of a page that moved into PageTabs — bookmarks and links
 * in old notifications land on the right tab, query kept. */
export function MovedTo({ to, bolim }: { to: string; bolim?: string }) {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  if (bolim) params.set('bolim', bolim)
  const qs = params.toString()
  return <Navigate to={`${to}${qs ? `?${qs}` : ''}`} replace />
}
