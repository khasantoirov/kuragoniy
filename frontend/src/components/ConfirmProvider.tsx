import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from './Button'
import { Modal } from './Modal'

interface ConfirmOptions {
  title: string
  text?: string
  danger?: boolean
}

type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ options, resolve })
    })
  }, [])

  const close = (result: boolean) => {
    state?.resolve(result)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          title={state.options.title}
          onClose={() => close(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => close(false)}>
                {t('Bekor qilish')}
              </Button>
              <Button variant={state.options.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
                {t('Tasdiqlash')}
              </Button>
            </>
          }
        >
          {state.options.text && <p className="prose">{state.options.text}</p>}
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}
