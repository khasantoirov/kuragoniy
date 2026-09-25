import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'

import { IC } from '@/icons'

interface Props {
  title: string
  // Omit entirely for a modal the user cannot dismiss except through its
  // own footer actions (e.g. a forced app-update prompt) — no close
  // button is rendered when this is left out.
  onClose?: () => void
  children: ReactNode
  footer?: ReactNode
  // A compact, alert-style width (~420px) instead of the default form
  // width — for short, single-message dialogs (e.g. the update prompt)
  // where the usual 620px reads as mostly empty space.
  narrow?: boolean
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

export function Modal({ title, onClose, children, footer, narrow }: Props) {
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
      <div className={`modal ${narrow ? 'modal--narrow' : ''}`}>
        <div className="modal__head">
          <h2 className="modal__title">{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label={t('Yopish')}>
              {IC.close}
            </button>
          )}
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
