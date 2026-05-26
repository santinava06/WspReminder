import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, isAbortError, parseApiError } from '../api'

type ScheduledMessage = {
  id: string; createdAt: string; scheduledAt: string; username: string | null
  sessionId: string; message: string; status: string
  groups: { id: string; name: string }[]
  results: { groupId: string; groupName: string; ok: boolean; error?: string }[]
}

type Props = { apiBaseUrl: string; formatDate: (d: string) => string }

export default function AdminScheduledTab({ apiBaseUrl, formatDate }: Props) {
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>([])
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const fetchScheduled = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/admin/scheduled`, { signal: abortRef.current?.signal })
      if (res.ok) { setScheduled((await res.json()).messages || []); setError('') }
      else setError(await parseApiError(res, 'Error al cargar programados'))
    } catch (err) { if (!isAbortError(err)) setError(err instanceof Error ? err.message : 'Error de red') }
  }, [apiBaseUrl])

  useEffect(() => {
    const c = new AbortController(); abortRef.current = c
    fetchScheduled()
    return () => { c.abort(); abortRef.current = null }
  }, [fetchScheduled])

  return (
    <div>
      {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {scheduled.length === 0 ? (
        <div className="surface-card bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-500">No hay mensajes programados.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {scheduled.map(m => (
            <div key={m.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{m.username || m.sessionId}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      m.status === 'sent' ? 'bg-emerald-50 text-emerald-800'
                      : m.status === 'pending' ? 'bg-amber-50 text-amber-800'
                      : m.status === 'cancelled' ? 'bg-rose-50 text-rose-700'
                      : 'bg-slate-100 text-slate-600'
                    }`}>{m.status}</span>
                    <span className="text-xs text-slate-400">Creado: {formatDate(m.createdAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-900">{m.message}</p>
                  {m.groups && m.groups.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">{m.groups.length} grupos: {m.groups.slice(0, 3).map(g => g.name).join(', ')}{m.groups.length > 3 ? ` +${m.groups.length - 3} mas` : ''}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-500">Programado</p>
                  <p className="text-sm font-medium text-slate-950">{formatDate(m.scheduledAt)}</p>
                  {m.results && m.results.length > 0 && (
                    <p className="text-xs text-slate-500 mt-1">{m.results.filter(r => r.ok).length}/{m.results.length} enviados</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
