import { Bell, Calendar, Command as CommandIcon, RefreshCw, SunMoon } from 'lucide-react'
import type { ScheduledMessage } from '../hooks/useScheduledMessages'

type ConnectionStatus = { label: string; detail: string; tone: 'ready' | 'warning' | 'error' }

type Props = {
  userName: string | null
  userPhone: string | null
  statusState: string
  statusDetail: string
  isConnectionReady: boolean
  isConnectionProblem: boolean
  connectionStatus: ConnectionStatus
  resolvedTheme: string
  isAdmin: boolean
  scheduledMessages: ScheduledMessage[]
  onOpenCommandPalette: () => void
  onRefresh: () => void
  onToggleTheme: () => void
  onOpenAdmin: () => void
  onRequestNotifyPermission: () => void
  onOpenScheduled: () => void
}

// Button classes - inline them to avoid importing from App.tsx
const secondaryButton = 'inline-flex items-center gap-1.5 min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] pressable'
const ghostButton = 'inline-flex items-center gap-1.5 min-h-9 rounded-lg px-3 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 active:scale-[0.98] pressable'

export default function Header(props: Props) {
  const {
    userName, userPhone, statusState, statusDetail,
    isConnectionReady, isConnectionProblem, connectionStatus,
    resolvedTheme, isAdmin, scheduledMessages,
    onOpenCommandPalette, onRefresh, onToggleTheme,
    onOpenAdmin, onRequestNotifyPermission, onOpenScheduled,
  } = props

  return (
    <header className="app-panel surface-panel mb-3 flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white shadow-sm ring-1 ring-white/20">
          WR
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-950">WhatsApp Reminders</h1>
          {userName || userPhone ? (
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="truncate text-base font-semibold text-slate-800">{userName}</span>
              <span className="truncate text-sm font-medium text-slate-500">{userPhone}</span>
            </div>
          ) : (
            <p className="truncate text-sm text-slate-500">
              {statusState === 'loading' ? 'Consultando estado...' : statusDetail}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className={secondaryButton} type="button" onClick={onOpenCommandPalette}>
          <CommandIcon size={16} />
          <span>Cmd K</span>
        </button>
        <span
          className={`status-pill ${
            isConnectionReady
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : isConnectionProblem
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
          aria-live="polite"
        >
          <span className={`h-2 w-2 rounded-full ${isConnectionReady ? 'bg-emerald-500' : isConnectionProblem ? 'bg-rose-500' : 'bg-amber-500'}`} />
          {connectionStatus.label}
        </span>
        <button className={ghostButton} type="button" onClick={onRefresh}>
          <RefreshCw size={16} />
          <span>Actualizar</span>
        </button>
        <button className={ghostButton} type="button" onClick={onToggleTheme}>
          <SunMoon size={16} />
          <span>{resolvedTheme === 'dark' ? 'Claro' : 'Oscuro'}</span>
        </button>
        {isAdmin && (
          <button className={secondaryButton} type="button" onClick={onOpenAdmin}>
            <span>Admin</span>
          </button>
        )}
        <button className={ghostButton} type="button" onClick={onRequestNotifyPermission} title="Activar notificaciones del navegador">
          <Bell size={16} />
        </button>
        <button className={secondaryButton} type="button" onClick={onOpenScheduled}>
          <Calendar size={16} />
          <span>Programados</span>
          {scheduledMessages.filter(m => m.status === 'pending' || m.status === 'waiting_connection').length > 0 && (
            <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-white leading-none">
              {scheduledMessages.filter(m => m.status === 'pending' || m.status === 'waiting_connection').length}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}
