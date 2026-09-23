import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'

import { IC } from '@/icons'

/** Full-size image viewer — the "click a thumbnail to see it big" half of
 * a gallery pattern; the caller keeps the thumbnail itself always visible
 * inline and only mounts this on click. Closes on backdrop click, the
 * close button, or Escape; never on a click on the image itself. */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('is-locked')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('is-locked')
    }
  }, [onClose])

  return createPortal(
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox__close" onClick={onClose} aria-label={t('Yopish')}>
        {IC.close}
      </button>
      <img className="lightbox__img" src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  )
}
