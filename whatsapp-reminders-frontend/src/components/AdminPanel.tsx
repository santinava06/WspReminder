import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppSettings } from '../hooks/useSettings'
import { apiFetch, parseApiError } from '../api'
import { useToast } from './Toast'

type Props = {
  apiBaseUrl: string
  formatDate: (date: string) => string
  onClose: () => void
  settings: AppSettings
  delaySeconds: number
  updateApiBaseUrl: (url: string) => void
  updateDelaySeconds: (s: number) => void
  resetSettings: () => void
  updateTheme: (t: AppSettings['theme']) => void
  updateAccentColor: (c: AppSettings['accentColor']) => void
  updateDensity: (d: AppSettings['density']) => void
  updateBlurIntensity: (b: AppSettings['blurIntensity']) => void
}

type UserInfo = {
  username: string
  displayName: string
  sessionId: string
  connected: boolean
  status: string
  message: string | null
  qrAvailable: boolean
}

type HistoryEntry = {
  id: string
  createdAt: string
  username: string
  message: string
  total: number
  sent: number
  failed: number
  hasMedia: boolean
  mode: string
  results: { id: string; name: string; ok: boolean; error: string | null }[]
}

type ScheduledMessage = {
  id: string
  createdAt: string
  scheduledAt: string
  username: string | null
  sessionId: string
  message: string
  status: string
  groups: { id: string; name: string }[]
  results: { groupId: string; groupName: string; ok: boolean; error?: string }[]
}

type Stats = {
  totalSends: number
  totalSent: number
  totalFailed: number
  successRate: string
  users: { username: string; totalSends: number; totalSent: number; totalFailed: number; lastSend: string | null }[]
}

type Tab = 'users' | 'history' | 'scheduled' | 'stats' | 'config'

const buttonBase = 'ui-btn pressable'
const primaryButton = `${buttonBase} ui-btn-primary`
const secondaryButton = `${buttonBase} ui-btn-secondary`
const ghostButton = `${buttonBase} ui-btn-ghost`

export default function AdminPanel({
  apiBaseUrl,
  formatDate,
  onClose,
  settings,
  delaySeconds,
  updateApiBaseUrl,
  updateDelaySeconds,
  resetSettings,
  updateTheme,
  updateAccentColor,
  updateDensity,
  updateBlurIntensity,
}: Props) {
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<UserInfo[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const { toast } = useToast()
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [historyPage, setHistoryPage] = useState(0)
  const [historyDetail, setHistoryDetail] = useState<string | null>(null)
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({})
  const pageSize = 20

  const fetchUsers = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/admin/users`)
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
        setLoadErrors((e) => { const n = { ...e }; delete n.users; return n })
      } else {
        const msg = await parseApiError(res, 'Error al cargar usuarios')
        setLoadErrors((e) => ({ ...e, users: msg }))
      }
    } catch (err) {
      setLoadErrors((e) => ({ ...e, users: err instanceof Error ? err.message : 'Error de red' }))
    }
  }, [apiBaseUrl])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/admin/history`)
      if (res.ok) {
        const data = await res.json()
        setHistory(data.entries || [])
        setLoadErrors((e) => { const n = { ...e }; delete n.history; return n })
      } else {
        const msg = await parseApiError(res, 'Error al cargar historial')
        setLoadErrors((e) => ({ ...e, history: msg }))
      }
    } catch (err) {
      setLoadErrors((e) => ({ ...e, history: err instanceof Error ? err.message : 'Error de red' }))
    }
  }, [apiBaseUrl])

  const fetchScheduled = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/admin/scheduled`)
      if (res.ok) {
        const data = await res.json()
        setScheduled(data.messages || [])
        setLoadErrors((e) => { const n = { ...e }; delete n.scheduled; return n })
      } else {
        const msg = await parseApiError(res, 'Error al cargar programados')
        setLoadErrors((e) => ({ ...e, scheduled: msg }))
      }
    } catch (err) {
      setLoadErrors((e) => ({ ...e, scheduled: err instanceof Error ? err.message : 'Error de red' }))
    }
  }, [apiBaseUrl])

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/admin/stats`)
      if (res.ok) {
        const data = await res.json()
        setStats(data.stats || null)
        setLoadErrors((e) => { const n = { ...e }; delete n.stats; return n })
      } else {
        const msg = await parseApiError(res, 'Error al cargar estadisticas')
        setLoadErrors((e) => ({ ...e, stats: msg }))
      }
    } catch (err) {
      setLoadErrors((e) => ({ ...e, stats: err instanceof Error ? err.message : 'Error de red' }))
    }
  }, [apiBaseUrl])

  useEffect(() => {
    fetchUsers(); fetchHistory(); fetchScheduled(); fetchStats()
  }, [fetchUsers, fetchHistory, fetchScheduled, fetchStats])

  const paginatedHistory = useMemo(() => {
    const filtered = historyDetail
      ? history.filter(e => e.username === historyDetail)
      : history
    return filtered.slice(0, (historyPage + 1) * pageSize)
  }, [history, historyPage, historyDetail])

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'users', label: 'Usuarios', count: users.length },
    { key: 'history', label: 'Historial', count: history.length },
    { key: 'scheduled', label: 'Programados', count: scheduled.length },
    { key: 'stats', label: 'Estadisticas' },
    { key: 'config', label: 'Configuracion' },
  ]

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6 backdrop-blur-md" onClick={onClose}>
      <section
        className="surface-panel max-h-[calc(100vh-3rem)] w-full max-w-5xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b !border-slate-200/70 bg-slate-50/80 px-5 py-4">
          <div>
            <p className="section-kicker">Admin</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950" id="admin-title">Panel de gestion</h2>
          </div>
          <button className="icon-btn" type="button" aria-label="Cerrar admin" onClick={onClose}>X</button>
        </div>

        <div className="flex gap-1 border-b !border-slate-200/70 bg-slate-50/60 px-4 py-2 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === t.key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-950'
              }`}
              onClick={() => { setTab(t.key); setHistoryPage(0); setHistoryDetail(null) }}
            >
              {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        <div className="scroll-area max-h-[calc(100vh-14rem)] overflow-auto p-5">
          {loadErrors[tab] && (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {loadErrors[tab]}
            </div>
          )}
          {tab === 'users' && (
            <div className="grid gap-2">
              <div className="grid grid-cols-[120px_1fr_100px_80px_90px] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span>Usuario</span>
                <span>Sesion</span>
                <span>Estado</span>
                <span>QR</span>
                <span className="text-right">Accion</span>
              </div>
              {users.map(u => (
                <div key={u.username} className="grid grid-cols-[120px_1fr_100px_80px_90px] gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm items-center">
                  <div>
                    <p className="font-medium text-slate-950">{u.displayName}</p>
                    <p className="text-xs text-slate-500">{u.username}</p>
                  </div>
                  <div>
                    <p className="text-slate-700">{u.sessionId}</p>
                    {u.message && <p className="text-xs text-slate-400 truncate">{u.message}</p>}
                  </div>
                  <div>
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
                      u.connected ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                    }`}>
                      {u.connected ? 'Conectado' : u.status}
                    </span>
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
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                          })
                          if (res.ok) {
                            toast(`Sesion de ${u.displayName} desconectada`, 'success')
                            await fetchUsers()
                          } else {
                            toast(await parseApiError(res, 'No se pudo desconectar'), 'error')
                          }
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Error de red al desconectar', 'error')
                        }
                        setDisconnecting(null)
                      }}
                    >
                      {disconnecting === u.sessionId ? '...' : 'Desconectar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'history' && (
            <div>
              {historyDetail && (
                <div className="mb-4 flex items-center gap-2">
                  <button className={ghostButton} onClick={() => { setHistoryDetail(null); setHistoryPage(0) }}>
                    ← Todos los usuarios
                  </button>
                  <span className="text-sm font-medium text-slate-700">Filtrando: {historyDetail}</span>
                </div>
              )}
              {!historyDetail && (
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="text-xs font-medium text-slate-500 self-center">Filtrar por usuario:</span>
                  {[...new Set(history.map(e => e.username))].map(name => (
                    <button
                      key={name}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => { setHistoryDetail(name); setHistoryPage(0) }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              {paginatedHistory.length === 0 ? (
                <div className="surface-card bg-slate-50 p-8 text-center">
                  <p className="text-sm text-slate-500">No hay envios registrados.</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {paginatedHistory.map(e => (
                    <div key={e.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{e.username}</span>
                            <span className="text-xs text-slate-400">{formatDate(e.createdAt)}</span>
                            <span className="text-xs text-slate-400">{e.mode}</span>
                            {e.hasMedia && <span className="text-xs text-slate-400">📎</span>}
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
              {paginatedHistory.length < (historyDetail ? history.filter(e => e.username === historyDetail).length : history.length) && (
                <button className={`${ghostButton} mt-3 w-full`} onClick={() => setHistoryPage(p => p + 1)}>
                  Cargar mas ({((historyDetail ? history.filter(e => e.username === historyDetail).length : history.length) - paginatedHistory.length)} restantes)
                </button>
              )}
            </div>
          )}

          {tab === 'scheduled' && (
            <div>
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
                              m.status === 'sent' ? 'bg-emerald-50 text-emerald-800' :
                              m.status === 'pending' ? 'bg-amber-50 text-amber-800' :
                              m.status === 'cancelled' ? 'bg-rose-50 text-rose-700' :
                              'bg-slate-100 text-slate-600'
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
          )}

          {tab === 'stats' && stats && (
            <div>
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
                    <span>Usuario</span>
                    <span className="text-right">Envios</span>
                    <span className="text-right">Enviados</span>
                    <span className="text-right">Fallidos</span>
                    <span className="text-right">Ultimo envio</span>
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
            </div>
          )}

          {tab === 'config' && (
            <div className="grid gap-6">
              <label className="grid gap-2 text-sm font-medium text-slate-950">
                URL del backend
                <input
                  className="ui-field bg-white px-3 text-sm font-normal"
                  value={settings.apiBaseUrl}
                  onChange={(e) => updateApiBaseUrl(e.target.value)}
                  placeholder="http://localhost:3000"
                />
                <span className="text-xs font-normal text-slate-500">Cambialo si tu backend corre en otro puerto.</span>
              </label>

              <label className="grid gap-2 text-sm font-medium text-slate-950">
                Delay por defecto (segundos)
                <input
                  className="ui-field bg-white px-3 text-sm font-normal"
                  min={0}
                  max={60}
                  type="number"
                  value={delaySeconds}
                  onChange={(e) => updateDelaySeconds(Number(e.target.value) || 0)}
                />
                <span className="text-xs font-normal text-slate-500">Pausa entre envios a cada grupo (0 a 60).</span>
              </label>

              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Apariencia</p>
                  <p className="mt-1 text-xs text-slate-500">Personaliza densidad, color y profundidad visual.</p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium text-slate-950">
                    Tema
                    <select
                      className="ui-field min-h-10 bg-white px-3 text-sm font-normal"
                      value={settings.theme}
                      onChange={(e) => updateTheme(e.target.value as AppSettings['theme'])}
                    >
                      <option value="light">Claro</option>
                      <option value="dark">Oscuro</option>
                      <option value="system">Sistema</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-950">
                    Densidad
                    <select
                      className="ui-field min-h-10 bg-white px-3 text-sm font-normal"
                      value={settings.density}
                      onChange={(e) => updateDensity(e.target.value as AppSettings['density'])}
                    >
                      <option value="comfortable">Comoda</option>
                      <option value="compact">Compacta</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-950">
                    Color accent
                    <select
                      className="ui-field min-h-10 bg-white px-3 text-sm font-normal"
                      value={settings.accentColor}
                      onChange={(e) => updateAccentColor(e.target.value as AppSettings['accentColor'])}
                    >
                      <option value="emerald">Emerald</option>
                      <option value="blue">Blue</option>
                      <option value="violet">Violet</option>
                      <option value="rose">Rose</option>
                      <option value="amber">Amber</option>
                      <option value="slate">Slate</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-950">
                    Blur
                    <select
                      className="ui-field min-h-10 bg-white px-3 text-sm font-normal"
                      value={settings.blurIntensity}
                      onChange={(e) => updateBlurIntensity(e.target.value as AppSettings['blurIntensity'])}
                    >
                      <option value="low">Bajo</option>
                      <option value="medium">Medio</option>
                      <option value="high">Alto</option>
                    </select>
                  </label>
                </div>
              </section>

              <div className="flex justify-end">
                <button className={secondaryButton} type="button" onClick={resetSettings}>
                  Restaurar defaults
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t !border-slate-200/70 bg-slate-50/80 px-5 py-4">
          <button className={primaryButton} type="button" onClick={onClose}>Cerrar</button>
        </div>
      </section>
    </div>
  )
}
