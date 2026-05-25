import { Calendar, Clock, Image, Trash2 } from 'lucide-react'
import type { ScheduledMessage, ScheduledStatus } from '../hooks/useScheduledMessages'

type ScheduledPanelProps = {
  messages: ScheduledMessage[]
  loadState: 'idle' | 'loading' | 'success' | 'error'
  statusLabel: Record<ScheduledStatus, string>
  panelClass: string
  formatDate: (value: string) => string
  onCancel: (id: string) => void
}

export default function ScheduledPanel({
  messages,
  loadState,
  statusLabel,
  panelClass,
  formatDate,
  onCancel,
}: ScheduledPanelProps) {
  const activeCount = messages.filter(
    (message) => message.status === 'pending' || message.status === 'waiting_connection',
  ).length

  return (
    <section className={`${panelClass} min-h-0 overflow-hidden p-0`}>
      <div className="border-b !border-slate-200/70 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-slate-400" />
            <h2 className="section-title">Programados</h2>
          </div>
          <span className="status-pill min-h-0 px-2 py-0.5 text-xs">{activeCount}</span>
        </div>
      </div>

      {loadState === 'loading' && messages.length === 0 ? (
        <div className="p-4 text-center text-sm text-slate-500">Cargando...</div>
      ) : messages.length === 0 ? (
        <div className="p-2">
          <p className="surface-card border-dashed px-3 py-3 text-sm text-slate-500">
            Sin mensajes programados.
          </p>
        </div>
      ) : (
        <div className="scroll-area max-h-64 overflow-auto p-2">
          {messages.map((message) => (
            <ScheduledMessageCard
              formatDate={formatDate}
              key={message.id}
              message={message}
              onCancel={onCancel}
              statusLabel={statusLabel}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ScheduledMessageCard({
  message,
  statusLabel,
  formatDate,
  onCancel,
}: {
  message: ScheduledMessage
  statusLabel: Record<ScheduledStatus, string>
  formatDate: (value: string) => string
  onCancel: (id: string) => void
}) {
  const canCancel = message.status === 'pending' || message.status === 'waiting_connection'
  const statusTone = {
    pending: 'bg-amber-50 text-amber-800',
    waiting_connection: 'bg-sky-50 text-sky-800',
    sending: 'bg-blue-50 text-blue-800',
    sent: 'bg-emerald-50 text-emerald-800',
    failed: 'bg-rose-50 text-rose-700',
    cancelled: 'bg-slate-100 text-slate-500',
  }[message.status]

  return (
    <article className="interactive-row animate-list-item group rounded-lg border border-transparent p-2 transition hover:border-slate-200 hover:bg-slate-50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone}`}>
            {statusLabel[message.status]}
          </span>
          {message.title && (
            <p className="mt-1.5 truncate text-sm font-semibold text-slate-950">{message.title}</p>
          )}
          <p className={`${message.title ? 'mt-0.5 truncate text-xs text-slate-500' : 'mt-1.5 truncate text-sm font-medium text-slate-950'}`}>{message.message}</p>
          {message.media && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
              <Image size={11} />
              <span>Con foto{message.media.filename ? ` (${message.media.filename})` : ''}</span>
            </p>
          )}
          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <Clock size={11} />
            <span>{formatDate(message.scheduledAt)}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {message.lastError || `${message.groups.length} grupo${message.groups.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {canCancel && (
          <button
            className="shrink-0 rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
            type="button"
            title="Cancelar"
            onClick={() => onCancel(message.id)}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </article>
  )
}
