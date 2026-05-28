import { useState, useRef } from 'react'
import { setToken } from '../api'

type Props = {
  apiBaseUrl: string
  onLogin: () => void
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {open ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  )
}

export default function LoginPage({ apiBaseUrl, onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${apiBaseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Credenciales invalidas')
      }
      setToken(data.token)
      if (data.sessionId) localStorage.setItem('session_id', data.sessionId)
      if (data.displayName) localStorage.setItem('display_name', data.displayName)
      if (data.username) localStorage.setItem('username', data.username)
      onLogin()
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Error al iniciar sesion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-4">
      <div className="relative w-full max-w-sm animate-[panel-in_420ms_cubic-bezier(0.2,0.8,0.2,1)_both]">
        <div className="surface-panel px-10 py-12">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-950 text-base font-semibold tracking-tight text-white shadow-sm ring-1 ring-white/20">
              WR
            </div>
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-950">WhatsApp Reminders</h1>
            <p className="mt-1.5 text-sm text-slate-500">Ingresa tus credenciales</p>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Usuario</label>
              <input
                className="ui-field px-4 text-sm"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ingrese su usuario"
                autoFocus
                autoComplete="username"
              />
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contrasena</label>
              <div className="relative">
                <input
                  className="ui-field px-4 text-sm pr-12"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingrese su contrasena"
                  autoComplete="current-password"
                />
                <button
                  className="absolute right-1 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                <span className="text-sm leading-5 text-rose-700">{error}</span>
              </div>
            )}

            <button
              className={`ui-btn h-12 w-full text-sm font-semibold tracking-wide ${loading || !username || !password ? 'cursor-not-allowed opacity-48' : 'ui-btn-primary'}`}
              type="submit"
              disabled={loading || !username || !password}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Ingresando
                </span>
              ) : 'Ingresar'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Acceso autorizado unicamente para administradores
        </p>
      </div>
    </div>
  )
}
