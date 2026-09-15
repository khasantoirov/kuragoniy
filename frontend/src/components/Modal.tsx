import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'

import { IC } from '@/icons'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

// Tracks how many Modals are currently mounted, so the app-wide "Escape
// goes back one page" shortcut (see AppShell) can stay off while a modal
// is open — the modal itself no longer closes on Escape or a backdrop
// click, only via an explicit Save/Cancel/close button, so unsaved form
// input is never lost to a stray keypress or misclick.
let openModalCount = 0
export function isAnyModalOpen() {
  return openModalCount > 0
}

export function Modal({ title, onClose, children, footer }: Props) {
  const { t } = useTranslation()
  useEffect(() => {
    openModalCount++
    document.body.classList.add('is-locked')
    return () => {
      openModalCount--
      document.body.classList.remove('is-locked')
    }
  }, [])

  return createPortal(
    <div className="overlay is-open">
      <div className="modal">
        <div className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('Yopish')}>
            {IC.close}
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
