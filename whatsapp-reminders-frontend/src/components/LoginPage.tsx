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
      onLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="surface-card rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-slate-950 text-lg font-bold text-white shadow-sm ring-1 ring-white/20">
              WR
            </div>
            <h1 className="text-xl font-semibold text-slate-950">WhatsApp Reminders</h1>
            <p className="mt-1 text-sm text-slate-500">Inicia sesion para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Usuario
              <input
                className="w-full rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:bg-white"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin1 — admin5"
                autoFocus
                autoComplete="username"
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Contrasena
              <input
                className="w-full rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:bg-white"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="1234"
                autoComplete="current-password"
              />
            </label>

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            )}

            <button
              className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              type="submit"
              disabled={loading || !username || !password}
            >
              {loading ? 'Iniciando sesion...' : 'Iniciar sesion'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
