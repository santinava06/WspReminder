import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, isAbortError, parseApiError } from '../api'
import { useToast } from './Toast'

type UserInfo = {
  username: string; displayName: string; sessionId: string; connected: boolean
  status: string; message: string | null; qrAvailable: boolean
  connectedAt: string | null; disconnectedAt: string | null
  uptime: string | null; reconnectAttempts: number; healthCheckRunning: boolean
}

type Props = { apiBaseUrl: string; formatDate: (d: string) => string }

export default function AdminUsersTab({ apiBaseUrl, formatDate }: Props) {
  const [users, setUsers] = useState<UserInfo[]>([])
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const { toast } = useToast()

  const fetchUsers = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/admin/users`, { signal: abortRef.current?.signal })
      if (res.ok) { setUsers((await res.json()).users || []); setError('') }
      else setError(await parseApiError(res, 'Error al cargar usuarios'))
    } catch (err) { if (!isAbortError(err)) setError(err instanceof Error ? err.message : 'Error de red') }
  }, [apiBaseUrl])

  useEffect(() => {
    const c = new AbortController(); abortRef.current = c
    fetchUsers()
    return () => { c.abort(); abortRef.current = null }
  }, [fetchUsers])

  useEffect(() => {
    const i = setInterval(fetchUsers, 5000)
    return () => clearInterval(i)
  }, [fetchUsers])

  return (
    <div>
      {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <div className="grid gap-2">
        <div className="hidden lg:grid grid-cols-[140px_1fr_100px_90px_90px_80px_70px_80px] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <span>Usuario</span><span>Sesion / Estado</span><span>Conexion</span><span>Tiempo activo</span>
          <span>Reintentos</span><span>Health</span><span>QR</span><span className="text-right">Accion</span>
        </div>
        {users.map(u => (
          <div key={u.username} className="grid grid-cols-1 lg:grid-cols-[140px_1fr_100px_90px_90px_80px_70px_80px] gap-2 lg:gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <div className="flex items-center gap-2 lg:block">
              <p className="font-medium text-slate-950">{u.displayName}</p>
              <p className="text-xs text-slate-500">{u.username}</p>
            </div>
            <div className="min-w-0">
              <p className="text-slate-700 truncate">{u.sessionId}</p>
              {u.message && <p className="text-xs text-slate-400 truncate" title={u.message}>{u.message}</p>}
            </div>
            <div>
              <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${u.connected ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                {u.connected ? 'Conectado' : u.status}
              </span>
            </div>
            <div className="text-xs text-slate-600">
              {u.uptime ? <span className="font-medium text-emerald-700">{u.uptime}</span>
              : u.disconnectedAt ? <span className="text-slate-400">Cayo {formatDate(u.disconnectedAt)}</span>
              : <span className="text-slate-300">-</span>}
            </div>
            <div className="text-xs">
              {u.reconnectAttempts > 0 ? <span className="font-medium text-amber-700">{u.reconnectAttempts}x</span> : <span className="text-slate-300">0</span>}
            </div>
            <div className="text-xs">
              {u.healthCheckRunning ? <span className="text-emerald-600 font-medium">Activo</span> : <span className="text-slate-300">Inactivo</span>}
            </div>
            <div className="text-center">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${u.qrAvailable ? 'bg-amber-400 animate-pulse' : u.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            </div>
            <div className="text-right">
              <button
                className="rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-200 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={disconnecting === u.sessionId || (!u.connected && !u.qrAvailable)}
                onClick={async () => {
                  setDisconnecting(u.sessionId)
                  try {
                    const res = await apiFetch(`${apiBaseUrl}/admin/disconnect/${u.sessionId}`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abortRef.current?.signal,
                    })
                    if (res.ok) { toast(`Sesion de ${u.displayName} desconectada`, 'success'); await fetchUsers() }
                    else toast(await parseApiError(res, 'No se pudo desconectar'), 'error')
                  } catch (err) { toast(err instanceof Error ? err.message : 'Error de red al desconectar', 'error') }
                  setDisconnecting(null)
                }}
              >{disconnecting === u.sessionId ? '...' : 'Desconectar'}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
