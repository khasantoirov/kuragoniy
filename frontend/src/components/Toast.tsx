import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type ToastKind = 'ok' | 'error'
interface ToastItem {
  id: number
  text: string
  kind: ToastKind
}

interface ToastContextValue {
  toast: (text: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const toast = useCallback((text: string, kind: ToastKind = 'ok') => {
    const id = nextId++
    setItems((prev) => [...prev, { id, text, kind }])
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 2600)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toasts" id="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast is-in ${t.kind === 'error' ? 'toast--error' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx.toast
}
