import { useCallback, useEffect, useMemo, useState } from 'react'

const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3177'
const SETTINGS_STORAGE_KEY = 'whatsapp-reminders-settings'

export type AppSettings = {
  apiBaseUrl: string
  delaySeconds: number
  theme: 'light' | 'dark' | 'system'
  accentColor: 'emerald' | 'blue' | 'violet' | 'rose' | 'amber' | 'slate'
  density: 'comfortable' | 'compact'
  blurIntensity: 'low' | 'medium' | 'high'
  sidebarCollapsed: boolean
}

const defaultSettings: AppSettings = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  delaySeconds: 3,
  theme: 'light',
  accentColor: 'emerald',
  density: 'comfortable',
  blurIntensity: 'medium',
  sidebarCollapsed: false,
}

const accentColors: AppSettings['accentColor'][] = ['emerald', 'blue', 'violet', 'rose', 'amber', 'slate']

function loadSettings(): AppSettings {
  try {
    const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!rawSettings) {
      return defaultSettings
    }

    const parsedSettings = JSON.parse(rawSettings) as Partial<AppSettings>
    const theme = parsedSettings.theme === 'dark' || parsedSettings.theme === 'system' ? parsedSettings.theme : 'light'
    const accentColor: AppSettings['accentColor'] = accentColors.includes(parsedSettings.accentColor as AppSettings['accentColor'])
      ? parsedSettings.accentColor as AppSettings['accentColor']
      : 'emerald'
    const density = parsedSettings.density === 'compact' ? 'compact' : 'comfortable'
    const blurIntensity = parsedSettings.blurIntensity === 'low' || parsedSettings.blurIntensity === 'high'
      ? parsedSettings.blurIntensity
      : 'medium'

    return {
      apiBaseUrl: parsedSettings.apiBaseUrl || DEFAULT_API_BASE_URL,
      delaySeconds: Number.isFinite(parsedSettings.delaySeconds) ? Number(parsedSettings.delaySeconds) : 3,
      theme,
      accentColor,
      density,
      blurIntensity,
      sidebarCollapsed: Boolean(parsedSettings.sidebarCollapsed),
    }
  } catch {
    return defaultSettings
  }
}

export default function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [delaySeconds, setDelaySeconds] = useState(() => settings.delaySeconds)
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const apiBaseUrl = useMemo(() => settings.apiBaseUrl.replace(/\/$/, ''), [settings.apiBaseUrl])
  const resolvedTheme = settings.theme === 'system' ? systemTheme : settings.theme

  const updateApiBaseUrl = useCallback((nextApiBaseUrl: string) => {
    setSettings((currentSettings) => ({
      ...currentSettings,
      apiBaseUrl: nextApiBaseUrl,
    }))
  }, [])

  const updateDelaySeconds = useCallback((nextDelaySeconds: number) => {
    const normalizedDelay = Math.min(60, Math.max(0, nextDelaySeconds))
    setDelaySeconds(normalizedDelay)
    setSettings((currentSettings) => ({
      ...currentSettings,
      delaySeconds: normalizedDelay,
    }))
  }, [])

  const resetSettings = useCallback(() => {
    const nextSettings = {
      ...defaultSettings,
    }
    setSettings(nextSettings)
    setDelaySeconds(nextSettings.delaySeconds)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSettings((currentSettings) => ({
      ...currentSettings,
      sidebarCollapsed: !currentSettings.sidebarCollapsed,
    }))
  }, [])

  const toggleTheme = useCallback(() => {
    const applyTheme = () => {
      setSettings((currentSettings) => ({
        ...currentSettings,
        theme: (currentSettings.theme === 'dark' ? 'light' : 'dark') as AppSettings['theme'],
      }))
    }
    const viewTransitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => void
    }

    if (viewTransitionDocument.startViewTransition) {
      viewTransitionDocument.startViewTransition(applyTheme)
      return
    }

    applyTheme()
  }, [])

  const updateTheme = useCallback((theme: AppSettings['theme']) => {
    setSettings((currentSettings) => ({ ...currentSettings, theme }))
  }, [])

  const updateAccentColor = useCallback((accentColor: AppSettings['accentColor']) => {
    setSettings((currentSettings) => ({ ...currentSettings, accentColor }))
  }, [])

  const updateDensity = useCallback((density: AppSettings['density']) => {
    setSettings((currentSettings) => ({ ...currentSettings, density }))
  }, [])

  const updateBlurIntensity = useCallback((blurIntensity: AppSettings['blurIntensity']) => {
    setSettings((currentSettings) => ({ ...currentSettings, blurIntensity }))
  }, [])

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mediaQuery) return

    const updateSystemTheme = () => setSystemTheme(mediaQuery.matches ? 'dark' : 'light')
    updateSystemTheme()
    mediaQuery.addEventListener('change', updateSystemTheme)
    return () => mediaQuery.removeEventListener('change', updateSystemTheme)
  }, [])

  return {
    settings,
    resolvedTheme,
    delaySeconds,
    apiBaseUrl,
    updateApiBaseUrl,
    updateDelaySeconds,
    resetSettings,
    toggleTheme,
    toggleSidebar,
    updateTheme,
    updateAccentColor,
    updateDensity,
    updateBlurIntensity,
  }
}
