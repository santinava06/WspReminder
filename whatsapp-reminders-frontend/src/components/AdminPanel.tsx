import { useState } from 'react'
import type { AppSettings } from '../hooks/useSettings'
import AdminUsersTab from './AdminUsersTab'
import AdminHistoryTab from './AdminHistoryTab'
import AdminScheduledTab from './AdminScheduledTab'
import AdminStatsTab from './AdminStatsTab'
import AdminConfigTab from './AdminConfigTab'

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

type Tab = 'users' | 'history' | 'scheduled' | 'stats' | 'config'

const primaryButton = 'ui-btn pressable ui-btn-primary'

export default function AdminPanel(props: Props) {
  const { formatDate, onClose, apiBaseUrl, ...rest } = props
  const [tab, setTab] = useState<Tab>('users')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'users', label: 'Usuarios' },
    { key: 'history', label: 'Historial' },
    { key: 'scheduled', label: 'Programados' },
    { key: 'stats', label: 'Estadisticas' },
    { key: 'config', label: 'Configuracion' },
  ]

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6 backdrop-blur-md" onClick={onClose}>
      <section className="surface-panel max-h-[calc(100vh-3rem)] w-full max-w-5xl overflow-hidden"
        role="dialog" aria-modal="true" aria-labelledby="admin-title"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b !border-slate-200/70 bg-slate-50/80 px-5 py-4">
          <div>
            <p className="section-kicker">Admin</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950" id="admin-title">Panel de gestion</h2>
          </div>
          <button className="icon-btn" type="button" aria-label="Cerrar admin" onClick={onClose}>X</button>
        </div>
        <div className="flex gap-1 border-b !border-slate-200/70 bg-slate-50/60 px-4 py-2 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === t.key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-950'}`}
              onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="scroll-area max-h-[calc(100vh-14rem)] overflow-auto p-5">
          {tab === 'users' && <AdminUsersTab apiBaseUrl={apiBaseUrl} formatDate={formatDate} />}
          {tab === 'history' && <AdminHistoryTab apiBaseUrl={apiBaseUrl} formatDate={formatDate} />}
          {tab === 'scheduled' && <AdminScheduledTab apiBaseUrl={apiBaseUrl} formatDate={formatDate} />}
          {tab === 'stats' && <AdminStatsTab apiBaseUrl={apiBaseUrl} formatDate={formatDate} />}
          {tab === 'config' && <AdminConfigTab {...rest} />}
        </div>
        <div className="flex justify-end border-t !border-slate-200/70 bg-slate-50/80 px-5 py-4">
          <button className={primaryButton} type="button" onClick={onClose}>Cerrar</button>
        </div>
      </section>
    </div>
  )
}
