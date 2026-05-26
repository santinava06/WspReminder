import { memo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { MessageCircleWarning, RefreshCw, SearchX, Star } from 'lucide-react'

export type Group = {
  id: string
  name: string
}

type LoadState = 'idle' | 'loading' | 'success' | 'error'

type GroupRowProps = {
  group: Group
  isChecked: boolean
  isFavorite: boolean
  isRecent: boolean
  isSingle: boolean
  query: string
  onToggleFavorite: (group: Group) => void
  onSelectSingle: (group: Group) => void
  onToggleSelected: (group: Group) => void
}

type GroupListProps = {
  groups: Group[]
  groupState: LoadState
  groupError: string
  favoriteGroupIds: Set<string>
  isReady: boolean
  recentGroupIds: Set<string>
  query: string
  selectedGroupId?: string
  selectedGroupIds: Set<string>
  hasQuery: boolean
  onClearQuery: () => void
  onRefresh: () => void
  onSelectSingle: (group: Group) => void
  onToggleFavorite: (group: Group) => void
  onToggleSelected: (group: Group) => void
}

const GroupRow = memo(function GroupRow({
  group,
  isChecked,
  isFavorite,
  isRecent,
  isSingle,
  query,
  onSelectSingle,
  onToggleFavorite,
  onToggleSelected,
}: GroupRowProps) {
  return (
    <button
      className={`interactive-row grid w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2.5 py-2.5 text-left transition ${
        isChecked || isSingle
          ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
          : 'border-transparent text-slate-900 hover:border-slate-200 hover:bg-white'
      }`}
      type="button"
      onClick={() => onSelectSingle(group)}
    >
      <span
        className={`grid h-8 w-8 place-items-center rounded-md transition ${
          isFavorite
            ? isChecked || isSingle
              ? 'bg-white/15 text-amber-200'
              : 'bg-amber-50 text-amber-500'
            : isChecked || isSingle
              ? 'text-white/45 hover:bg-white/10 hover:text-white'
              : 'text-slate-300 hover:bg-slate-100 hover:text-amber-500'
        }`}
        role="button"
        aria-label={isFavorite ? 'Quitar favorito' : 'Marcar favorito'}
        onClick={(event) => {
          event.stopPropagation()
          onToggleFavorite(group)
        }}
      >
        <Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
      </span>
      <span
        className={`grid h-5 w-5 place-items-center rounded-md border text-[11px] transition ${
          isChecked
            ? 'border-white bg-white text-slate-950'
            : isSingle
              ? 'border-white/70 bg-white/10 text-transparent'
              : 'border-slate-300 bg-white text-transparent'
        }`}
        role="checkbox"
        aria-checked={isChecked}
        onClick={(event) => {
          event.stopPropagation()
          onToggleSelected(group)
        }}
      >
        &#10003;
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">
          <HighlightedGroupName name={group.name} query={query} active={isChecked || isSingle} />
        </span>
        <span className={`block truncate text-xs ${isChecked || isSingle ? 'text-white/55' : 'text-slate-400'}`}>
          {group.id}
        </span>
      </span>
      <span className={`hidden text-xs font-medium sm:inline ${isChecked || isRecent ? isChecked || isSingle ? 'text-white/70' : 'text-slate-400' : 'text-transparent'}`}>
        {isChecked ? 'Seleccionado' : isRecent ? 'Reciente' : 'Grupo'}
      </span>
    </button>
  )
})

function HighlightedGroupName({ name, query, active }: { name: string; query: string; active: boolean }) {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return <>{name}</>

  const normalizedName = normalizeForHighlight(name)
  const normalizedQuery = normalizeForHighlight(trimmedQuery)
  const matchIndex = normalizedName.indexOf(normalizedQuery)

  if (matchIndex === -1) return <>{name}</>

  const before = name.slice(0, matchIndex)
  const match = name.slice(matchIndex, matchIndex + trimmedQuery.length)
  const after = name.slice(matchIndex + trimmedQuery.length)

  return (
    <>
      {before}
      <mark className={`rounded px-0.5 ${active ? 'bg-white/20 text-white' : 'bg-amber-100 text-slate-950'}`}>
        {match}
      </mark>
      {after}
    </>
  )
}

function normalizeForHighlight(value: string) {
  const v = value || ''
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export default function GroupList({
  groups,
  groupState,
  groupError,
  favoriteGroupIds,
  isReady,
  recentGroupIds,
  query,
  selectedGroupId,
  selectedGroupIds,
  hasQuery,
  onClearQuery,
  onRefresh,
  onSelectSingle,
  onToggleFavorite,
  onToggleSelected,
}: GroupListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 62,
    overscan: 8,
  })

  return (
    <div className="scroll-area min-h-0 overflow-auto px-3 pb-3" ref={parentRef}>
      {!isReady && (
        <EmptyState
          description="Cuando WhatsApp este conectado, los grupos se cargan aca con busqueda y seleccion rapida."
          icon={<MessageCircleWarning size={22} />}
          title="WhatsApp no esta listo"
        />
      )}

      {isReady && groupState === 'error' && (
        <EmptyState
          actionLabel="Reintentar"
          description={groupError}
          icon={<RefreshCw size={22} />}
          onAction={onRefresh}
          tone="error"
          title="No se pudieron cargar los grupos"
        />
      )}

      {isReady && groupState === 'loading' && groups.length === 0 && (
        <div className="grid gap-2 px-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="skeleton-line h-14 rounded-lg bg-slate-100" key={index} />
          ))}
        </div>
      )}

      {groups.length > 0 && (
        <div
          className="relative"
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const group = groups[virtualRow.index]
            const isChecked = selectedGroupIds.has(group.id)
            const isFavorite = favoriteGroupIds.has(group.id)
            const isRecent = recentGroupIds.has(group.id)
            const isSingle = selectedGroupId === group.id

            return (
              <div
                className="absolute left-0 top-0 w-full px-0.5"
                key={group.id}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <GroupRow
                  group={group}
                  isChecked={isChecked}
                  isFavorite={isFavorite}
                  isRecent={isRecent}
                  isSingle={isSingle}
                  query={query}
                  onSelectSingle={onSelectSingle}
                  onToggleFavorite={onToggleFavorite}
                  onToggleSelected={onToggleSelected}
                />
              </div>
            )
          })}
        </div>
      )}

      {isReady && groupState === 'success' && groups.length === 0 && (
        <EmptyState
          actionLabel={hasQuery ? 'Limpiar busqueda' : 'Recargar grupos'}
          description={hasQuery ? 'Proba con otro termino o volve a ver todos los grupos.' : 'Todavia no hay grupos disponibles en esta sesion.'}
          icon={<SearchX size={22} />}
          onAction={hasQuery ? onClearQuery : onRefresh}
          title={hasQuery ? 'Sin resultados' : 'Sin grupos cargados'}
        />
      )}
    </div>
  )
}

function EmptyState({
  actionLabel,
  description,
  icon,
  onAction,
  title,
  tone = 'neutral',
}: {
  actionLabel?: string
  description: string
  icon: ReactNode
  onAction?: () => void
  title: string
  tone?: 'neutral' | 'error'
}) {
  return (
    <section className="surface-card mx-2 my-3 p-6 text-center backdrop-blur-xl">
      <div
        className={`mx-auto grid h-12 w-12 place-items-center rounded-lg ${
          tone === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-950">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      {actionLabel && onAction && (
        <button
          className="ui-btn ui-btn-primary pressable mt-4"
          type="button"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </section>
  )
}
