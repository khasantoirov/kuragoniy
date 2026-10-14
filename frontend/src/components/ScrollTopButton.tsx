import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { IC } from '@/icons'
import { pageScrollProgress, scrollPageTo, subscribePageScroll, usePageScrolled } from '@/lib/scroll'

const R = 21
const CIRCUMFERENCE = 2 * Math.PI * R

/** "Back to top" — appears once the page is scrolled a little way down;
 * the ring around the arrow fills as the reader goes further down. */
export function ScrollTopButton() {
  const { t } = useTranslation()
  const shown = usePageScrolled(320)
  const ring = useRef<SVGCircleElement>(null)

  // Written straight to the DOM — re-rendering on every scroll frame just
  // to move a stroke would be wasted work.
  useEffect(() => {
    const paint = () => ring.current?.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - pageScrollProgress())))
    paint()
    return subscribePageScroll(paint)
  }, [])

  return (
    <button
      type="button"
      className={`totop ${shown ? 'is-on' : ''}`}
      onClick={() => scrollPageTo(0, true)}
      title={t('Tepaga')}
      aria-label={t('Tepaga')}
      tabIndex={shown ? 0 : -1}
    >
      <svg className="totop__ring" viewBox="0 0 48 48" aria-hidden="true">
        <circle className="totop__track" cx="24" cy="24" r={R} />
        <circle ref={ring} className="totop__bar" cx="24" cy="24" r={R} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE} />
      </svg>
      {IC.arrowUp}
    </button>
  )
}
