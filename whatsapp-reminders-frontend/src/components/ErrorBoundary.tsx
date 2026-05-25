import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const err = this.state.error
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-lg">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-100 text-xl">
            !
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-950">Algo salio mal</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Se produjo un error inesperado en la aplicacion.
          </p>
          {err && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 font-mono text-left break-all leading-relaxed">
              {err.name}: {err.message}
            </p>
          )}
          <button
            className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            type="button"
            onClick={() => window.location.reload()}
          >
            Recargar pagina
          </button>
        </div>
      </div>
    )
  }
}
