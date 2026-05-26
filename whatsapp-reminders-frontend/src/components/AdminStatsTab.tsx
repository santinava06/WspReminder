import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, isAbortError, parseApiError } from '../api'

type Stats = {
  totalSends: number; totalSent: number; totalFailed: number; successRate: string
  users: { username: string; totalSends: number; totalSent: number; totalFailed: number; lastSend: string | null }[]
}

type Props = { apiBaseUrl: string; formatDate: (d: string) => string }

export default function AdminStatsTab({ apiBaseUrl, formatDate }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/admin/stats`, { signal: abortRef.current?.signal })
      if (res.ok) { setStats((await res.json()).stats || null); setError('') }
      else setError(await parseApiError(res, 'Error al cargar estadisticas'))
    } catch (err) { if (!isAbortError(err)) setError(err instanceof Error ? err.message : 'Error de red') }
  }, [apiBaseUrl])

  useEffect(() => {
    const c = new AbortController(); abortRef.current = c
    fetchStats()
    return () => { c.abort(); abortRef.current = null }
  }, [fetchStats])

  if (!stats && !error) return <p className="text-sm text-slate-500">Cargando estadisticas...</p>

  return (
    <div>
      {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-4 mb-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <p className="text-3xl font-bold text-slate-950">{stats.totalSends}</p>
              <p className="text-xs text-slate-500 mt-1">Envios totales</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-3xl font-bold text-emerald-800">{stats.totalSent}</p>
              <p className="text-xs text-emerald-600 mt-1">Mensajes enviados</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
              <p className="text-3xl font-bold text-rose-700">{stats.totalFailed}</p>
              <p className="text-xs text-rose-600 mt-1">Mensajes fallidos</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <p className="text-3xl font-bold text-slate-950">{stats.successRate}%</p>
              <p className="text-xs text-slate-500 mt-1">Tasa de exito</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-950">Por usuario</p>
            </div>
            <div className="grid gap-px bg-slate-100">
              <div className="grid grid-cols-[1fr_80px_80px_80px_auto] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span>Usuario</span><span className="text-right">Envios</span><span className="text-right">Enviados</span>
                <span className="text-right">Fallidos</span><span className="text-right">Ultimo envio</span>
              </div>
              {stats.users.map(u => (
                <div key={u.username} className="grid grid-cols-[1fr_80px_80px_80px_auto] gap-3 bg-white px-4 py-3 text-sm items-center">
                  <span className="font-medium text-slate-950">{u.username}</span>
                  <span className="text-right text-slate-700">{u.totalSends}</span>
                  <span className="text-right text-emerald-700">{u.totalSent}</span>
                  <span className="text-right text-rose-600">{u.totalFailed}</span>
                  <span className="text-right text-xs text-slate-500">{u.lastSend ? formatDate(u.lastSend) : '-'}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
