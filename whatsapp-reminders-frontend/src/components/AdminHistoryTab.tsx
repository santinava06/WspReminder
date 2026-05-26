import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, isAbortError, parseApiError } from '../api'
import { useToast } from './Toast'

type HistoryEntry = {
  id: string; createdAt: string; username: string; message: string
  total: number; sent: number; failed: number; hasMedia: boolean; mode: string
  results: { id: string; name: string; ok: boolean; error: string | null }[]
}

type Props = { apiBaseUrl: string; formatDate: (d: string) => string }

const ghostButton = 'ui-btn pressable ui-btn-ghost'
const pageSize = 20

export default function AdminHistoryTab({ apiBaseUrl, formatDate }: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const { toast } = useToast()

  const fetchHistory = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/admin/history`, { signal: abortRef.current?.signal })
      if (res.ok) { setHistory((await res.json()).entries || []); setError('') }
      else setError(await parseApiError(res, 'Error al cargar historial'))
    } catch (err) { if (!isAbortError(err)) setError(err instanceof Error ? err.message : 'Error de red') }
  }, [apiBaseUrl])

  useEffect(() => {
    const c = new AbortController(); abortRef.current = c
    fetchHistory()
    return () => { c.abort(); abortRef.current = null }
  }, [fetchHistory])

  const filtered = useMemo(() => {
    let f = detail ? history.filter(e => e.username === detail) : history
    if (search.trim()) { const q = search.trim().toLowerCase(); f = f.filter(e => e.message.toLowerCase().includes(q)) }
    if (dateFrom) { const from = new Date(dateFrom).getTime(); f = f.filter(e => new Date(e.createdAt).getTime() >= from) }
    if (dateTo) { const to = new Date(dateTo).getTime() + 86400000; f = f.filter(e => new Date(e.createdAt).getTime() <= to) }
    return f.slice(0, (page + 1) * pageSize)
  }, [history, page, detail, search, dateFrom, dateTo])

  return (
    <div>
      {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] items-end">
        <input className="ui-field px-3 text-sm" placeholder="Buscar en mensajes..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }} />
        <label className="text-xs text-slate-500">
          Desde
          <input type="date" className="ui-field ml-2 px-2 py-1 text-xs"
            value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0) }} />
        </label>
        <label className="text-xs text-slate-500">
          Hasta
          <input type="date" className="ui-field ml-2 px-2 py-1 text-xs"
            value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0) }} />
        </label>
        <div className="flex flex-wrap gap-1">
          {[...new Set(history.map(e => e.username))].map(name => (
            <button key={name}
              className={`rounded-lg px-2 py-1 text-xs font-medium transition ${detail === name ? 'bg-slate-950 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
              onClick={() => { setDetail(detail === name ? null : name); setPage(0) }}>{name}</button>
          ))}
          {detail && <button className={ghostButton} onClick={() => { setDetail(null); setPage(0) }}>Limpiar</button>}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="surface-card bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-500">No hay envios registrados{search || dateFrom || dateTo || detail ? ' con esos filtros' : ''}.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map(e => (
            <div key={e.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{e.username}</span>
                    <span className="text-xs text-slate-400">{formatDate(e.createdAt)}</span>
                    <span className="text-xs text-slate-400">{e.mode}</span>
                    {e.hasMedia && <span className="text-xs text-slate-400">📎</span>}
                    {e.failed > 0 && (
                      <button className="rounded-lg bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 transition hover:bg-rose-200 disabled:opacity-50"
                        disabled={retryingId === e.id}
                        onClick={async () => {
                          setRetryingId(e.id)
                          try {
                            const res = await apiFetch(`${apiBaseUrl}/admin/retry`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              signal: abortRef.current?.signal, body: JSON.stringify({ historyId: e.id }),
                            })
                            if (res.ok) { toast('Reintentando envios fallidos...', 'info'); await fetchHistory() }
                            else toast(await parseApiError(res, 'Error al reintentar'), 'error')
                          } catch (err) { toast(err instanceof Error ? err.message : 'Error de red', 'error') }
                          setRetryingId(null)
                        }}
                      >{retryingId === e.id ? '...' : 'Reintentar'}</button>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-900">{e.message}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-center">
                    <strong className="block text-xs text-slate-950">{e.total}</strong>
                    <small className="text-[10px] text-slate-500">Total</small>
                  </span>
                  <span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-center">
                    <strong className="block text-xs text-emerald-800">{e.sent}</strong>
                    <small className="text-[10px] text-emerald-600">OK</small>
                  </span>
                  <span className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-center">
                    <strong className="block text-xs text-rose-700">{e.failed}</strong>
                    <small className="text-[10px] text-rose-600">Fallos</small>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {filtered.length < history.length && (
        <button className={`${ghostButton} mt-3 w-full`} onClick={() => setPage(p => p + 1)}>
          Cargar mas ({history.length - filtered.length} restantes)
        </button>
      )}
    </div>
  )
}
