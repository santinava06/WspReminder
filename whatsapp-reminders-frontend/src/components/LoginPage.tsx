import { useState } from 'react'
import { setToken } from '../api'

type Props = {
  apiBaseUrl: string
  onLogin: () => void
}

export default function LoginPage({ apiBaseUrl, onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState<'user' | 'pass' | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${apiBaseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
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
      setError(err instanceof Error ? err.message : 'Error al iniciar sesion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f5f0] px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#e8e4d9_0%,_transparent_60%)]" />
      <div className="pointer-events-none absolute -left-40 -top-40 h-80 w-80 rounded-full border border-[#d4d0c5]/50" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-64 w-64 rounded-full border border-[#d4d0c5]/50" />

      <div className="relative w-full max-w-sm">
        <div className="rounded-2xl border border-[#e2ddd2] bg-white/90 px-10 py-12 shadow-[0_0_0_1px_rgba(0,0,0,0.02),0_8px_40px_rgba(0,0,0,0.04)] backdrop-blur-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#1a1a1a] text-base font-semibold tracking-tight text-white shadow-sm">
              WR
            </div>
            <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a1a]">WhatsApp Reminders</h1>
            <p className="mt-1.5 text-sm text-[#8a8678]">Ingresa tus credenciales</p>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-[#8a8678]">Usuario</label>
              <div className={`rounded-xl border bg-white px-4 py-0.5 transition-all duration-200 ${
                focused === 'user' ? 'border-[#1a1a1a] shadow-[0_0_0_2px_rgba(26,26,26,0.06)]' : 'border-[#e2ddd2] hover:border-[#c8c4b8]'
              }`}>
                <input
                  className="h-11 w-full border-none bg-transparent text-sm text-[#1a1a1a] outline-none placeholder:text-[#c8c4b8]"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onFocus={() => setFocused('user')}
                  onBlur={() => setFocused(null)}
                  placeholder="admin, comercial1..."
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-[#8a8678]">Contrasena</label>
              <div className={`rounded-xl border bg-white px-4 py-0.5 transition-all duration-200 ${
                focused === 'pass' ? 'border-[#1a1a1a] shadow-[0_0_0_2px_rgba(26,26,26,0.06)]' : 'border-[#e2ddd2] hover:border-[#c8c4b8]'
              }`}>
                <input
                  className="h-11 w-full border-none bg-transparent text-sm text-[#1a1a1a] outline-none placeholder:text-[#c8c4b8]"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocused('pass')}
                  onBlur={() => setFocused(null)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2.5 rounded-xl border border-[#f0d0d0] bg-[#fdf5f5] px-4 py-3">
                <span className="text-sm leading-5 text-[#c0392b]">{error}</span>
              </div>
            )}

            <button
              className={`mt-1 h-12 w-full rounded-xl text-sm font-medium tracking-wide text-white transition-all duration-200 ${
                loading || !username || !password
                  ? 'cursor-not-allowed bg-[#c8c4b8]'
                  : 'bg-[#1a1a1a] shadow-[0_2px_8px_rgba(26,26,26,0.12)] hover:bg-[#2a2a2a] hover:shadow-[0_4px_16px_rgba(26,26,26,0.16)] active:scale-[0.98]'
              }`}
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

        <p className="mt-6 text-center text-xs text-[#b8b4a8]">
          Acceso autorizado unicamente para administradores
        </p>
      </div>
    </div>
  )
}
