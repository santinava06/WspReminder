import type { AppSettings } from '../hooks/useSettings'

type Props = {
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

const secondaryButton = 'ui-btn pressable ui-btn-secondary'

export default function AdminConfigTab({
  settings, delaySeconds, updateApiBaseUrl, updateDelaySeconds, resetSettings,
  updateTheme, updateAccentColor, updateDensity, updateBlurIntensity,
}: Props) {
  return (
    <div className="grid gap-6">
      <label className="grid gap-2 text-sm font-medium text-slate-950">
        URL del backend
        <input className="ui-field bg-white px-3 text-sm font-normal" value={settings.apiBaseUrl}
          onChange={(e) => updateApiBaseUrl(e.target.value)} placeholder="http://localhost:3000" />
        <span className="text-xs font-normal text-slate-500">Cambialo si tu backend corre en otro puerto.</span>
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-950">
        Delay por defecto (segundos)
        <input className="ui-field bg-white px-3 text-sm font-normal" min={0} max={60} type="number"
          value={delaySeconds} onChange={(e) => updateDelaySeconds(Number(e.target.value) || 0)} />
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
            <select className="ui-field min-h-10 bg-white px-3 text-sm font-normal" value={settings.theme}
              onChange={(e) => updateTheme(e.target.value as AppSettings['theme'])}>
              <option value="light">Claro</option><option value="dark">Oscuro</option><option value="system">Sistema</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-950">
            Densidad
            <select className="ui-field min-h-10 bg-white px-3 text-sm font-normal" value={settings.density}
              onChange={(e) => updateDensity(e.target.value as AppSettings['density'])}>
              <option value="comfortable">Comoda</option><option value="compact">Compacta</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-950">
            Color accent
            <select className="ui-field min-h-10 bg-white px-3 text-sm font-normal" value={settings.accentColor}
              onChange={(e) => updateAccentColor(e.target.value as AppSettings['accentColor'])}>
              <option value="emerald">Emerald</option><option value="blue">Blue</option><option value="violet">Violet</option>
              <option value="rose">Rose</option><option value="amber">Amber</option><option value="slate">Slate</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-950">
            Blur
            <select className="ui-field min-h-10 bg-white px-3 text-sm font-normal" value={settings.blurIntensity}
              onChange={(e) => updateBlurIntensity(e.target.value as AppSettings['blurIntensity'])}>
              <option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option>
            </select>
          </label>
        </div>
      </section>
      <div className="flex justify-end">
        <button className={secondaryButton} type="button" onClick={resetSettings}>Restaurar defaults</button>
      </div>
    </div>
  )
}
