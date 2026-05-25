import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'

type ToastVariant = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  message: string
  variant: ToastVariant
}

type ToastContextType = {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = nextId++
    setItems((prev) => [...prev, { id, message, variant }])
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {items.map((item) => {
          const bg =
            item.variant === 'error' ? 'bg-rose-600' :
            item.variant === 'success' ? 'bg-emerald-600' :
            'bg-slate-800'
          return (
            <div
              key={item.id}
              className={`pointer-events-auto animate-slide-up rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${bg}`}
            >
              {item.message}
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
