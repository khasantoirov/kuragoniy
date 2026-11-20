import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { IC } from '@/icons'

import { usePortraitPhone } from './useLandscape'

/** The frame around the scene: plain while closed, the sideways layer while open. */
export function LandscapeFrame({ on, onClose, className = '', children }: {
  on: boolean
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className={`landv ${on ? 'is-on' : ''} ${className}`} role={on ? 'dialog' : undefined} aria-modal={on || undefined}>
      <div className="landv__in">
        {children}
        {on && (
          <button type="button" className="landv__x" onClick={onClose} aria-label={t('Yopish')} title={t('Yopish')}>
            {IC.close}
          </button>
        )}
      </div>
    </div>
  )
}

/** The button that opens it: "turn sideways" on an upright phone, "full screen" elsewhere. */
export function LandscapeButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  const { t } = useTranslation()
  const portrait = usePortraitPhone()
  const label = portrait ? t('Yon tomonga burish') : t("To'liq ekran")
  return (
    <button type="button" className={`landbtn ${className}`} onClick={onClick} title={label}>
      {IC.rotate} <span>{label}</span>
    </button>
  )
}
