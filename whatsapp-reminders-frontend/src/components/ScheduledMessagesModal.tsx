import { Calendar, Clock, Image, Trash2 } from 'lucide-react'
import type { ScheduledMessage, ScheduledStatus } from '../hooks/useScheduledMessages'

type Props = {
  messages: ScheduledMessage[]
  loadState: 'idle' | 'loading' | 'success' | 'error'
  statusLabel: Record<ScheduledStatus, string>
  formatDate: (date: string) => string
  onCancel: (id: string) => void
  onClose: () => void
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

export default function ScheduledMessagesModal({
  messages,
  loadState,
  statusLabel,
  formatDate,
  onCancel,
  onClose,
}: Props) {
  const activeCount = messages.filter(
    (m) => m.status === 'pending' || m.status === 'waiting_connection',
  ).length

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
          <button className="icon-btn" type="button" aria-label="Cerrar" onClick={onClose}>X</button>
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
              <button className={`${primaryButton} mt-4`} type="button" onClick={onClose}>
                Crear recordatorio
              </button>
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
                        <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-slate-950">{m.message}</p>
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
                          <button
                            className={dangerButton}
                            type="button"
                            onClick={() => onCancel(m.id)}
                          >
                            <Trash2 size={14} />
                            <span>Cancelar</span>
                          </button>
                        )}
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
    </div>
  )
}
