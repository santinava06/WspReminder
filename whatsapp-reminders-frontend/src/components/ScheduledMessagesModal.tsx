import { useMemo, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Clock, Image, List, Send, Trash2 } from 'lucide-react'
import type { ScheduledMessage, ScheduledStatus } from '../hooks/useScheduledMessages'

type Props = {
  messages: ScheduledMessage[]
  loadState: 'idle' | 'loading' | 'success' | 'error'
  statusLabel: Record<ScheduledStatus, string>
  formatDate: (date: string) => string
  onCancel: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
  onCreateClick?: () => void
  onSendNow?: (id: string) => Promise<void>
}

const statusTone: Record<ScheduledStatus, string> = {
  pending: 'bg-amber-50 text-amber-800',
  waiting_connection: 'bg-sky-50 text-sky-800',
  sending: 'bg-blue-50 text-blue-800',
  sent: 'bg-emerald-50 text-emerald-800',
  failed: 'bg-rose-50 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

const buttonBase = 'ui-btn pressable'
const primaryButton = `${buttonBase} ui-btn-primary`
const dangerButton = `${buttonBase} ui-btn-danger`
const ghostButton = `${buttonBase} ui-btn-ghost`

const DAYS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function getDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export default function ScheduledMessagesModal({
  messages,
  loadState,
  statusLabel,
  formatDate,
  onCancel,
  onDelete,
  onClose,
  onCreateClick,
  onSendNow,
}: Props) {
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [calendarDate, setCalendarDate] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [sendingNow, setSendingNow] = useState<string | null>(null)
  const activeCount = messages.filter(
    (m) => m.status === 'pending' || m.status === 'waiting_connection',
  ).length

  const year = calendarDate.getFullYear()
  const month = calendarDate.getMonth()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const todayKey = getDayKey(new Date())

  const messagesByDay = useMemo(() => {
    const map = new Map<string, ScheduledMessage[]>()
    for (const m of messages) {
      const d = new Date(m.scheduledAt)
      const key = getDayKey(d)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    return map
  }, [messages])

  const calendarDays = useMemo(() => {
    const days: { day: number; key: string; messages: ScheduledMessage[] }[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      const key = getDayKey(date)
      days.push({ day: d, key, messages: messagesByDay.get(key) || [] })
    }
    return days
  }, [daysInMonth, year, month, messagesByDay])

  const selectedMessages = useMemo(() => {
    if (!selectedDay) return messages
    return messagesByDay.get(selectedDay) || []
  }, [messages, selectedDay, messagesByDay])

  const prevMonth = () => {
    setCalendarDate(new Date(year, month - 1, 1))
    setSelectedDay(null)
  }

  const nextMonth = () => {
    setCalendarDate(new Date(year, month + 1, 1))
    setSelectedDay(null)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6 backdrop-blur-md" onClick={onClose}>
      <section
        className="surface-panel max-h-[calc(100vh-3rem)] w-full max-w-4xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scheduled-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b !border-slate-200/70 bg-slate-50/80 px-5 py-4">
          <div>
            <p className="section-kicker">Programados</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950" id="scheduled-title">Mensajes programados</h2>
            <p className="mt-1 text-sm text-slate-500">{activeCount} activos de {messages.length} total</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
              <button
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${view === 'list' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-950'}`}
                onClick={() => setView('list')}
              >
                <List size={14} className="inline mr-1" />
                Lista
              </button>
              <button
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${view === 'calendar' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-950'}`}
                onClick={() => setView('calendar')}
              >
                <Calendar size={14} className="inline mr-1" />
                Calendario
              </button>
            </div>
            <button className="icon-btn" type="button" aria-label="Cerrar" onClick={onClose}>X</button>
          </div>
        </div>

        <div className="scroll-area max-h-[calc(100vh-12rem)] overflow-auto p-5">
          {loadState === 'loading' && messages.length === 0 ? (
            <div className="surface-card bg-slate-50 p-8 text-center">
              <p className="text-sm text-slate-500">Cargando mensajes programados...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="surface-card bg-slate-50 p-8 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-white text-slate-500 shadow-sm">
                <Calendar size={22} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-950">Sin mensajes programados</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Programa un recordatorio desde el boton Programar al lado de Enviar.
              </p>
              <button className={`${primaryButton} mt-4`} type="button" onClick={onCreateClick || onClose}>
                Crear recordatorio
              </button>
            </div>
          ) : view === 'calendar' ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <button className={ghostButton} onClick={prevMonth}>
                  <ChevronLeft size={16} />
                </button>
                <h3 className="text-base font-semibold text-slate-950">{MONTHS[month]} {year}</h3>
                <button className={ghostButton} onClick={nextMonth}>
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-px rounded-xl border border-slate-200 bg-slate-200 overflow-hidden">
                {DAYS.map((d) => (
                  <div key={d} className="bg-slate-50 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {d}
                  </div>
                ))}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-white px-2 py-3" />
                ))}
                {calendarDays.map((day) => {
                  const isToday = day.key === todayKey
                  const isSelected = day.key === selectedDay
                  const hasMessages = day.messages.length > 0
                  const pendingCount = day.messages.filter(m => m.status === 'pending' || m.status === 'waiting_connection').length
                  return (
                    <button
                      key={day.key}
                      className={`relative min-h-[70px] bg-white px-2 py-2 text-left transition hover:bg-slate-50 ${
                        isSelected ? 'ring-2 ring-inset ring-slate-950 bg-slate-50' : ''
                      }`}
                      onClick={() => setSelectedDay(day.key === selectedDay ? null : day.key)}
                    >
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                        isToday ? 'bg-slate-950 text-white' : isSelected ? 'text-slate-950' : 'text-slate-600'
                      }`}>
                        {day.day}
                      </span>
                      {hasMessages && (
                        <div className="mt-1 space-y-0.5">
                          {pendingCount > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                              <span className="text-[10px] text-slate-500 truncate">{pendingCount} pend.</span>
                            </div>
                          )}
                          {day.messages.slice(0, 2).map(m => (
                            <p key={m.id} className="text-[10px] text-slate-600 truncate leading-tight">
                              {m.title || m.message.slice(0, 20)}
                            </p>
                          ))}
                          {day.messages.length > 2 && (
                            <p className="text-[10px] text-slate-400">+{day.messages.length - 2} mas</p>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {selectedDay && selectedMessages.length > 0 && (
                <div className="mt-5">
                  <h4 className="text-sm font-semibold text-slate-950 mb-3">
                    Mensajes del {new Date(selectedDay).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h4>
                  <div className="grid gap-2">
                    {selectedMessages.map((m) => (
                      <CalendarMessageCard
                        key={m.id}
                        m={m}
                        canCancel={m.status === 'pending' || m.status === 'waiting_connection'}
                        formatDate={formatDate}
                        statusLabel={statusLabel}
                        statusTone={statusTone}
                        dangerButton={dangerButton}
                        ghostButton={ghostButton}
                        primaryButton={primaryButton}
                        onCancel={onCancel}
                        onSendNow={onSendNow}
                        sendingNow={sendingNow}
                        setConfirmDeleteId={setConfirmDeleteId}
                        setSendingNow={setSendingNow}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {messages.map((m) => {
                const canCancel = m.status === 'pending' || m.status === 'waiting_connection'
                const sentResults = m.results?.filter((r) => r.ok).length ?? 0
                const failedResults = m.results?.filter((r) => !r.ok).length ?? 0

                return (
                  <article key={m.id} className="surface-card overflow-hidden bg-white">
                    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_200px]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone[m.status]}`}>
                            {statusLabel[m.status]}
                          </span>
                          <span className="text-sm text-slate-500">
                            <Clock size={12} className="inline mr-1" />
                            {formatDate(m.scheduledAt)}
                          </span>
                          {m.media && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Image size={12} />
                              Con foto
                            </span>
                          )}
                        </div>
                        {m.title && (
                          <p className="mt-2 text-base font-semibold text-slate-950">{m.title}</p>
                        )}
                        <p className={`${m.title ? 'mt-1 text-sm text-slate-500 line-clamp-2' : 'mt-2 text-sm font-medium leading-6 text-slate-950 line-clamp-2'}`}>{m.message}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span>Creado: {formatDate(m.createdAt)}</span>
                          <span>{m.groups.length} grupo{m.groups.length !== 1 ? 's' : ''}</span>
                          {m.groups.length > 0 && (
                            <span className="truncate max-w-xs text-slate-400">
                              {m.groups.slice(0, 4).map((g) => g.name).join(', ')}
                              {m.groups.length > 4 ? ` +${m.groups.length - 4} mas` : ''}
                            </span>
                          )}
                          {m.lastError && (
                            <span className="text-rose-600">{m.lastError}</span>
                          )}
                        </div>
                        {m.results && m.results.length > 0 && (
                          <div className="mt-3 flex gap-2">
                            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs">
                              <strong className="text-emerald-800">{sentResults}</strong>
                              <small className="text-emerald-600 ml-1">enviados</small>
                            </span>
                            {failedResults > 0 && (
                              <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs">
                                <strong className="text-rose-700">{failedResults}</strong>
                                <small className="text-rose-600 ml-1">fallidos</small>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-start justify-end gap-2 lg:flex-col">
                        {canCancel && (
                          <>
                            <button
                              className={primaryButton}
                              type="button"
                              disabled={sendingNow === m.id}
                              onClick={async () => {
                                if (!onSendNow) return
                                setSendingNow(m.id)
                                try { await onSendNow(m.id) } catch {}
                                setSendingNow(null)
                              }}
                            >
                              <Send size={14} />
                              <span>{sendingNow === m.id ? 'Enviando...' : 'Enviar ahora'}</span>
                            </button>
                            <button className={dangerButton} type="button" onClick={() => onCancel(m.id)}>
                              <Trash2 size={14} />
                              <span>Cancelar</span>
                            </button>
                          </>
                        )}
                        <button className={ghostButton} type="button" onClick={() => setConfirmDeleteId(m.id)}>
                          <Trash2 size={14} />
                          <span>Eliminar</span>
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t !border-slate-200/70 bg-slate-50/80 px-5 py-4">
          <button className={primaryButton} type="button" onClick={onClose}>Cerrar</button>
        </div>
      </section>

      {confirmDeleteId && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/30 px-4 backdrop-blur-sm" onClick={() => setConfirmDeleteId(null)}>
          <section
            className="surface-panel w-full max-w-sm overflow-hidden"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-rose-200/70 bg-rose-50/80 px-5 py-4">
              <p className="text-xs font-semibold uppercase text-rose-500">Eliminar</p>
              <h3 className="mt-0.5 text-base font-semibold text-rose-900">Eliminar mensaje programado?</h3>
            </div>
            <div className="p-5">
              <p className="text-sm leading-6 text-slate-700">
                Esta accion no se puede deshacer. El mensaje se eliminara permanentemente.
              </p>
            </div>
            <div className="grid gap-2 border-t !border-slate-200/70 bg-slate-50/80 px-5 py-4 sm:grid-cols-2">
              <button className={ghostButton} type="button" onClick={() => setConfirmDeleteId(null)}>
                Cancelar
              </button>
              <button className={dangerButton} type="button" onClick={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null) }}>
                Eliminar
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function CalendarMessageCard({
  m, canCancel, formatDate, statusLabel, statusTone, dangerButton, ghostButton, primaryButton, onCancel, onSendNow, sendingNow, setConfirmDeleteId, setSendingNow,
}: {
  m: ScheduledMessage
  canCancel: boolean
  formatDate: (d: string) => string
  statusLabel: Record<ScheduledStatus, string>
  statusTone: Record<ScheduledStatus, string>
  dangerButton: string
  ghostButton: string
  primaryButton: string
  onCancel: (id: string) => void
  onSendNow?: (id: string) => Promise<void>
  sendingNow: string | null
  setConfirmDeleteId: (id: string | null) => void
  setSendingNow: (id: string | null) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone[m.status]}`}>
            {statusLabel[m.status]}
          </span>
          <span className="text-xs text-slate-500">{formatDate(m.scheduledAt)}</span>
        </div>
        {m.title && <p className="mt-1 text-sm font-semibold text-slate-950">{m.title}</p>}
        <p className={`${m.title ? 'text-xs text-slate-500' : 'mt-1 text-sm text-slate-900'} line-clamp-1`}>{m.message}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {canCancel && onSendNow && (
          <button className={primaryButton} type="button" disabled={sendingNow === m.id} onClick={async () => { setSendingNow(m.id); try { await onSendNow(m.id) } catch {}; setSendingNow(null) }}>
            <Send size={12} />
            <span className="text-xs">{sendingNow === m.id ? '...' : 'Ahora'}</span>
          </button>
        )}
        {canCancel && (
          <button className={dangerButton} type="button" onClick={() => onCancel(m.id)}>
            <Trash2 size={12} />
            <span className="text-xs">Cancelar</span>
          </button>
        )}
        <button className={ghostButton} type="button" onClick={() => setConfirmDeleteId(m.id)}>
          <Trash2 size={12} />
          <span className="text-xs">Eliminar</span>
        </button>
      </div>
    </div>
  )
}
