import { History, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { Group } from './GroupList'
import type { SendHistoryItem } from '../hooks/useSendHistory'

type ConnectionStatus = { label: string; detail: string; tone: 'ready' | 'warning' | 'error' }

type SavedGroupList = { id: string; name: string; groupIds: string[] }

type Props = {
  displayName: string
  userName: string | null
  userPhone: string | null
  isConnectionReady: boolean
  isConnectionProblem: boolean
  connectionStatus: ConnectionStatus
  groups: Group[]
  filteredGroups: Group[]
  selectedCount: number
  disconnectState: string
  disconnectError: string
  sidebarCollapsed: boolean
  savedGroupLists: SavedGroupList[]
  newListName: string
  selectionFeedback: string
  sendHistory: SendHistoryItem[]
  onToggleSidebar: () => void
  onRequestDisconnect: () => void
  onLogout: () => void
  onNewListNameChange: (name: string) => void
  onSaveCurrentGroupList: () => void
  onApplySavedGroupList: (list: SavedGroupList) => void
  onDeleteSavedGroupList: (id: string) => void
  onOpenHistory: () => void
  onOpenHistoryItem: (id: string) => void
  formatDate: (date: string) => string
}

const sidebarPanelClass = 'rounded-2xl border border-slate-100/80 bg-white/70 p-4 shadow-[0_1px_3px_-1px_rgba(0,0,0,0.04)] backdrop-blur-xl'
const secondaryButton = 'inline-flex items-center gap-1.5 min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] pressable'

export default function Sidebar(props: Props) {
  const {
    displayName, userName, userPhone,
    isConnectionReady, isConnectionProblem, connectionStatus,
    groups, filteredGroups, selectedCount,
    disconnectState, disconnectError,
    sidebarCollapsed, savedGroupLists, newListName, selectionFeedback,
    sendHistory,
    onToggleSidebar, onRequestDisconnect, onLogout,
    onNewListNameChange, onSaveCurrentGroupList,
    onApplySavedGroupList, onDeleteSavedGroupList,
    onOpenHistory, onOpenHistoryItem, formatDate,
  } = props

  return (
    <aside className="scroll-area flex min-h-0 flex-col gap-3 overflow-y-auto pr-1 pb-1">
      <section className={sidebarPanelClass}>
        <div className="flex items-start justify-between gap-3">
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="section-kicker">Sesion</p>
              <h2 className="mt-1 truncate text-base font-semibold text-slate-950">
                {displayName}
              </h2>
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <span className={`mt-0.5 inline-block h-2.5 w-2.5 rounded-full ${isConnectionReady ? 'bg-emerald-500' : isConnectionProblem ? 'bg-rose-500' : 'bg-amber-500'}`} />
            <button className="icon-btn h-8 w-8" type="button" onClick={onToggleSidebar}>
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
        </div>
        {!sidebarCollapsed && (
          <>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                {userName || userPhone ? (
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-slate-800">{userName}</span>
                    <span className="text-xs text-slate-500">{userPhone ? `+${userPhone}` : ''}</span>
                  </div>
                ) : null}
                <p className="mt-0.5 text-xs text-slate-500">{connectionStatus.detail}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                isConnectionReady ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
              }`}>
                {isConnectionReady ? 'Conectado' : connectionStatus.label}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 text-center">
              <div>
                <dd className="text-sm font-semibold text-slate-950">{groups.length}</dd>
                <dt className="text-[10px] font-medium text-slate-500">Grupos</dt>
              </div>
              <div>
                <dd className="text-sm font-semibold text-slate-950">{filteredGroups.length}</dd>
                <dt className="text-[10px] font-medium text-slate-500">Visibles</dt>
              </div>
              <div>
                <dd className="text-sm font-semibold text-slate-950">{selectedCount}</dd>
                <dt className="text-[10px] font-medium text-slate-500">Sel.</dt>
              </div>
            </dl>
            <div className="mt-3 flex gap-2">
              {(userName || userPhone) && (
                <button
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    disconnectState === 'loading'
                      ? 'bg-rose-100 text-rose-400 cursor-not-allowed'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                  }`}
                  type="button"
                  disabled={disconnectState === 'loading'}
                  onClick={onRequestDisconnect}
                >
                  {disconnectState === 'loading' ? 'Desconectando...' : 'Desconectar'}
                </button>
              )}
              <button
                className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                type="button"
                onClick={onLogout}
              >
                Cerrar sesion
              </button>
            </div>
            {disconnectError && <p className="mt-2 text-xs text-rose-600">{disconnectError}</p>}
          </>
        )}
      </section>

      {!sidebarCollapsed && <section className={`${sidebarPanelClass} overflow-hidden p-0`}>
        <div className="border-b !border-slate-200/70 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">Listas</h2>
            <span className="status-pill min-h-0 px-2 py-0.5 text-xs">{savedGroupLists.length}</span>
          </div>
          <div className="mt-3 grid gap-2">
            <input
              className="ui-field px-3 text-sm disabled:bg-slate-50"
              id="saved-list-name"
              value={newListName}
              onChange={(event) => onNewListNameChange(event.target.value)}
              placeholder="Nueva lista"
            />
            <button
              className={secondaryButton}
              type="button"
              disabled={!newListName.trim() || selectedCount === 0}
              onClick={onSaveCurrentGroupList}
            >
              Guardar seleccion
            </button>
          </div>
          {selectionFeedback && (
            <p className="surface-card mt-3 px-3 py-2 text-xs text-slate-600">{selectionFeedback}</p>
          )}
        </div>
        <div className="scroll-area max-h-56 overflow-auto p-2">
          {savedGroupLists.length === 0 ? (
            <div className="surface-card border-dashed px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-950">Sin listas guardadas</p>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">Selecciona grupos y guarda una lista frecuente.</p>
            </div>
          ) : (
            savedGroupLists.map((list) => (
              <article className="interactive-row animate-list-item group rounded-lg p-2 transition hover:bg-slate-50" key={list.id}>
                <button className="w-full text-left" type="button" onClick={() => onApplySavedGroupList(list)}>
                  <span className="block truncate text-sm font-medium text-slate-950">{list.name}</span>
                  <span className="text-xs text-slate-500">{list.groupIds.length} grupos</span>
                </button>
                <button
                  className="mt-2 text-xs font-medium text-rose-600 opacity-70 transition hover:opacity-100"
                  type="button"
                  onClick={() => onDeleteSavedGroupList(list.id)}
                >
                  Borrar
                </button>
              </article>
            ))
          )}
        </div>
      </section>}

      <section className={`${sidebarPanelClass} flex min-h-0 flex-1 flex-col p-0`}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          {!sidebarCollapsed && <h2 className="section-title">Historial</h2>}
          <button className="ui-btn ui-btn-ghost min-h-8 px-2 text-xs" type="button" onClick={onOpenHistory}>
            {sidebarCollapsed ? <History size={16} /> : `Ver todo (${sendHistory.length})`}
          </button>
        </div>
        {!sidebarCollapsed && (
          <div className="scroll-area min-h-0 flex-1 overflow-auto px-4 pb-4">
            {sendHistory.length === 0 ? (
              <p className="mt-1 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">Todavia no hay envios.</p>
            ) : (
              <div className="grid gap-1.5">
                {sendHistory.slice(0, 10).map((h) => (
                  <button
                    key={h.id}
                    className="group w-full rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-left transition hover:border-slate-200 hover:shadow-sm"
                    type="button"
                    onClick={() => { onOpenHistoryItem(h.id); onOpenHistory() }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-400">{formatDate(h.createdAt)}</span>
                      <div className="flex items-center gap-1.5">
                        {h.sent > 0 && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{h.sent} OK</span>}
                        {h.failed > 0 && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">{h.failed} err</span>}
                      </div>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm font-medium text-slate-900">{h.message}</p>
                  </button>
                ))}
                {sendHistory.length > 10 && (
                  <button className="mt-1 w-full rounded-lg py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-50" type="button" onClick={onOpenHistory}>
                    Ver {sendHistory.length - 10} mas
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </aside>
  )
}
