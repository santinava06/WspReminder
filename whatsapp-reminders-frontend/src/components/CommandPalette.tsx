import { Command } from 'cmdk'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  CheckSquare,
  History,
  Moon,
  Shield,
  RefreshCw,
  Search,
  SidebarClose,
  SidebarOpen,
  Sparkles,
  Sun,
  Trash2,
  Users,
} from 'lucide-react'
import type { Group } from './GroupList'

type CommandPaletteProps = {
  open: boolean
  groups: Group[]
  isDark: boolean
  sidebarCollapsed: boolean
  onOpenChange: (open: boolean) => void
  onRefresh: () => void
  onOpenHistory: () => void
  onToggleTheme: () => void
  onToggleSidebar: () => void
  onSelectAllFiltered: () => void
  onClearSelection: () => void
  onSelectGroup: (group: Group) => void
  isAdmin?: boolean
  onOpenAdmin?: () => void
}

export default function CommandPalette({
  open,
  groups,
  isDark,
  sidebarCollapsed,
  onOpenChange,
  onRefresh,
  onOpenHistory,
  onToggleTheme,
  onToggleSidebar,
  onSelectAllFiltered,
  onClearSelection,
  onSelectGroup,
  isAdmin,
  onOpenAdmin,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('')
  const visibleGroups = useMemo(() => groups.slice(0, 80), [groups])

  const runCommand = (callback: () => void) => {
    callback()
    onOpenChange(false)
  }

  return (
    <>
    {open && <div className="modal-overlay fixed inset-0 z-[65] bg-slate-950/25 backdrop-blur-sm" onClick={() => onOpenChange(false)} />}
    <Command.Dialog
      className="modal-surface command-palette surface-panel fixed left-1/2 top-[10vh] z-[70] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden"
      label="Command palette"
      onOpenChange={onOpenChange}
      open={open}
      shouldFilter
    >
      <div className="border-b !border-slate-200/70 bg-white px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-950 text-white">
              <Sparkles size={15} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">Comandos rapidos</p>
              <p className="truncate text-xs text-slate-500">Acciones, ajustes y grupos visibles</p>
            </div>
          </div>
          <kbd className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">Esc</kbd>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3">
          <Search className="shrink-0 text-slate-400" size={18} strokeWidth={1.8} />
          <Command.Input
            className="h-11 w-full bg-transparent text-sm font-medium text-slate-950 outline-none placeholder:font-normal placeholder:text-slate-400"
            placeholder="Buscar accion o grupo..."
            value={search}
            onValueChange={setSearch}
          />
          {search && (
            <button
              className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-950"
              type="button"
              onClick={() => setSearch('')}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      <Command.List className="scroll-area max-h-[28rem] overflow-auto bg-slate-50/75 p-2">
        <Command.Empty className="px-4 py-10 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-white text-slate-400 shadow-sm">
            <Search size={18} />
          </span>
          <span className="mt-3 block text-sm font-semibold text-slate-950">Sin resultados</span>
          <span className="mx-auto mt-1 block max-w-sm text-sm leading-6 text-slate-500">
            Proba con otra palabra o abri una accion desde la lista.
          </span>
        </Command.Empty>

        <Command.Group className="command-group pb-2" heading="Acciones frecuentes">
          <CommandItem
            icon={<RefreshCw size={16} />}
            meta="R"
            subtitle="Actualiza estado, grupos y datos visibles."
            title="Recargar datos"
            onSelect={() => runCommand(onRefresh)}
          />
          {isAdmin && onOpenAdmin && (
            <CommandItem
              icon={<Shield size={16} />}
              meta="Admin"
              subtitle="Usuarios, historial, programados, estadisticas y config."
              title="Panel de administracion"
              onSelect={() => runCommand(onOpenAdmin)}
            />
          )}
          <CommandItem
            icon={<History size={16} />}
            meta="Historial"
            subtitle="Revisa envios recientes y resultados por grupo."
            title="Abrir historial"
            onSelect={() => runCommand(onOpenHistory)}
          />
          <CommandItem
            icon={isDark ? <Sun size={16} /> : <Moon size={16} />}
            meta={isDark ? 'Claro' : 'Oscuro'}
            subtitle="Alterna el tema de la interfaz."
            title={`Cambiar a modo ${isDark ? 'claro' : 'oscuro'}`}
            onSelect={() => runCommand(onToggleTheme)}
          />
          <CommandItem
            icon={sidebarCollapsed ? <SidebarOpen size={16} /> : <SidebarClose size={16} />}
            meta="Layout"
            subtitle="Muestra u oculta el panel lateral de grupos."
            title={sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
            onSelect={() => runCommand(onToggleSidebar)}
          />
          <CommandItem
            icon={<CheckSquare size={16} />}
            meta={`${groups.length}`}
            subtitle="Agrega todos los grupos filtrados actualmente."
            title="Seleccionar grupos visibles"
            onSelect={() => runCommand(onSelectAllFiltered)}
          />
          <CommandItem
            icon={<Trash2 size={16} />}
            meta="Reset"
            subtitle="Vacía la seleccion de grupos actual."
            title="Limpiar seleccion"
            tone="danger"
            onSelect={() => runCommand(onClearSelection)}
          />
        </Command.Group>

        {groups.length > 0 && (
          <Command.Group className="command-group" heading={`Grupos visibles (${groups.length})`}>
            {visibleGroups.map((group) => (
              <CommandItem
                icon={<Users size={16} />}
                key={group.id}
                meta="Enviar"
                subtitle={group.id}
                title={group.name}
                value={`${group.name} ${group.id}`}
                onSelect={() => runCommand(() => onSelectGroup(group))}
              />
            ))}
            {groups.length > visibleGroups.length && (
              <div className="px-3 py-3 text-center text-xs font-medium text-slate-500">
                Mostrando los primeros {visibleGroups.length} grupos. Usa la busqueda para afinar.
              </div>
            )}
          </Command.Group>
        )}
      </Command.List>

      <div className="flex items-center justify-between gap-3 border-t !border-slate-200/70 bg-white px-4 py-2.5 text-xs text-slate-500">
        <span className="truncate">{groups.length} grupos visibles disponibles</span>
        <span className="hidden items-center gap-2 sm:flex">
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-semibold">Enter</kbd>
          Ejecutar
        </span>
      </div>
    </Command.Dialog>
    </>
  )
}

function CommandItem({
  icon,
  meta,
  onSelect,
  subtitle,
  title,
  tone = 'neutral',
  value,
}: {
  icon: ReactNode
  meta?: string
  onSelect: () => void
  subtitle?: string
  title: string
  tone?: 'neutral' | 'danger'
  value?: string
}) {
  return (
    <Command.Item
      className="group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left outline-none transition data-[selected=true]:border-slate-200 data-[selected=true]:bg-white data-[selected=true]:shadow-sm"
      onSelect={onSelect}
      value={value ?? title}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-md transition ${
          tone === 'danger'
            ? 'bg-rose-50 text-rose-600 group-data-[selected=true]:bg-rose-100'
            : 'bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 group-data-[selected=true]:bg-slate-950 group-data-[selected=true]:text-white group-data-[selected=true]:ring-slate-950'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-800 group-data-[selected=true]:text-slate-950">
          {title}
        </span>
        {subtitle && <span className="mt-0.5 block truncate text-xs text-slate-500">{subtitle}</span>}
      </span>
      {meta && (
        <span className="max-w-24 truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
          {meta}
        </span>
      )}
    </Command.Item>
  )
}
