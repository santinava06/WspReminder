import { useCallback, useEffect, useState } from 'react'
import { getCurrentWindow, Effect } from '@tauri-apps/api/window'
import { Minus, Square, SquareStack, X } from 'lucide-react'

type WindowState = 'normal' | 'maximized' | 'fullscreen'

export default function Titlebar() {
  const [winState, setWinState] = useState<WindowState>('normal')
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

  const updateState = useCallback(async () => {
    if (!isTauri) return

    try {
      const appWindow = getCurrentWindow()
      const maximized = await appWindow.isMaximized()
      const fullscreen = await appWindow.isFullscreen()
      if (fullscreen) { setWinState('fullscreen'); return }
      if (maximized) { setWinState('maximized'); return }
      setWinState('normal')
    } catch {
      setWinState('normal')
    }
  }, [isTauri])

  const applyWindowEffects = useCallback(async () => {
    if (!isTauri) return

    try {
      const appWindow = getCurrentWindow()
      await appWindow.setEffects({
        effects: [Effect.Mica, Effect.Acrylic],
      })
    } catch {
      // fallback: efectos no disponibles en esta plataforma
    }
  }, [isTauri])

  useEffect(() => {
    if (!isTauri) return

    const appWindow = getCurrentWindow()
    const unlisteners: (() => void)[] = []

    appWindow.onResized(() => { updateState() }).then((fn) => unlisteners.push(fn))
    appWindow.onFocusChanged(({ payload: focused }) => {
      if (focused) updateState()
    }).then((fn) => unlisteners.push(fn))

    queueMicrotask(() => {
      updateState()
      applyWindowEffects()
    })

    return () => { unlisteners.forEach((fn) => fn()) }
  }, [applyWindowEffects, isTauri, updateState])

  async function handleMinimize() {
    const appWindow = getCurrentWindow()
    await appWindow.minimize()
  }

  async function handleToggleMaximize() {
    const appWindow = getCurrentWindow()
    await appWindow.toggleMaximize()
    await updateState()
  }

  async function handleClose() {
    const appWindow = getCurrentWindow()
    await appWindow.close()
  }

  if (!isTauri) return null

  const isMax = winState === 'maximized'

  return (
    <div
      className="group relative z-[100] flex h-10 shrink-0 select-none items-center justify-between border-b border-slate-200/60 bg-white/70 px-3 backdrop-blur-2xl"
      data-tauri-drag-region
      onDoubleClick={handleToggleMaximize}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-slate-400" data-tauri-drag-region>
        <span className="font-semibold text-slate-950/70">WhatsApp Reminders</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-600 active:bg-slate-300/50"
          type="button"
          aria-label="Minimizar"
          onClick={handleMinimize}
        >
          <Minus size={13} strokeWidth={1.8} />
        </button>

        <button
          className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-600 active:bg-slate-300/50"
          type="button"
          aria-label={isMax ? 'Restaurar' : 'Maximizar'}
          onClick={handleToggleMaximize}
        >
          {isMax ? <SquareStack size={13} strokeWidth={1.8} /> : <Square size={12} strokeWidth={1.8} />}
        </button>

        <button
          className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-red-500 hover:text-white active:bg-red-600"
          type="button"
          aria-label="Cerrar"
          onClick={handleClose}
        >
          <X size={13} strokeWidth={1.9} />
        </button>
      </div>
    </div>
  )
}
