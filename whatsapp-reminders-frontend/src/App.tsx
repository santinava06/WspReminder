import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Calendar, Command as CommandIcon, History, Image, PanelLeftClose, PanelLeftOpen, RefreshCw, Send, Settings, SunMoon } from 'lucide-react'
import CommandPalette from './components/CommandPalette'
import GroupList from './components/GroupList'
import type { Group } from './components/GroupList'
import ScheduleModal from './components/ScheduleModal'
import ScheduledPanel from './components/ScheduledPanel'
import SendConfirmationModal from './components/SendConfirmationModal'
import Titlebar from './components/Titlebar'
import useDebouncedValue from './hooks/useDebouncedValue'
import useGroups from './hooks/useGroups'
import useSendHistory from './hooks/useSendHistory'
import type { SendHistoryItem, SendProgressResult } from './hooks/useSendHistory'
import type { MediaAttachment } from './hooks/useScheduledMessages'
import useScheduledMessages from './hooks/useScheduledMessages'
import useSettings from './hooks/useSettings'
import { apiFetch, getToken, getStoredSessionId } from './api'
import LoginPage from './components/LoginPage'

type StatusResponse = {
  ready: boolean
  status?: string
  message?: string
  state?: string | null
  info: {
    pushname?: string
    wid?: {
      user?: string
    }
  } | null
  qr?: {
    available: boolean
    dataUrl: string | null
  }
  chromeProfile?: boolean
  chromeRunning?: boolean
}

type GroupsResponse = {
  ok: boolean
  ready?: boolean
  syncing?: boolean
  cached?: boolean
  refreshing?: boolean
  total?: number
  groups?: Group[]
  error?: string
}

type SendResponse = {
  ok: boolean
  message?: string
  error?: string
}

type DestinationMode = 'single' | 'selected' | 'all'
type LoadState = 'idle' | 'loading' | 'success' | 'error'
type SelectionView = 'all' | 'favorites' | 'selected' | 'unselected'
type PendingSendConfirmation = {
  destinationGroups: Group[]
  reminderMessage: string
  title: string
  hasMedia?: boolean
  mediaPreview?: string | null
  mediaName?: string | null
}
type SavedGroupList = {
  id: string
  name: string
  groupIds: string[]
  createdAt: string
}

type SessionSummary = {
  id: string
  status: string
  ready: boolean
  message?: string
  qrAvailable: boolean
  createdAt: string
  updatedAt: string
}

const SAVED_GROUP_LISTS_STORAGE_KEY = 'whatsapp-reminders-saved-group-lists'
const FAVORITE_GROUPS_STORAGE_KEY = 'whatsapp-reminders-favorite-groups'
const RECENT_GROUPS_STORAGE_KEY = 'whatsapp-reminders-recent-groups'

const DISCONNECT_RELOAD_KEY = 'whatsapp-reminders-disconnect-reloaded'

function normalizeText(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getConnectionStatus({
  status,
  statusState,
  groupState,
  groupsRefreshing,
}: {
  status: StatusResponse | null
  statusState: LoadState
  groupState: LoadState
  groupsRefreshing: boolean
}) {
  if (statusState === 'error') {
    return {
      label: 'Backend no disponible',
      detail: 'No se pudo consultar el backend',
      tone: 'error' as const,
    }
  }

  if (statusState === 'loading' && !status) {
    return {
      label: 'Conectando WhatsApp',
      detail: 'Consultando estado de la sesion',
      tone: 'pending' as const,
    }
  }

  if (!status) {
    return {
      label: 'Conectando WhatsApp',
      detail: 'Sin consultar todavia',
      tone: 'pending' as const,
    }
  }

  if (status.ready && (groupState === 'loading' || groupsRefreshing)) {
    return {
      label: 'Sincronizando grupos',
      detail: groupsRefreshing ? 'Actualizando lista de grupos' : 'Cargando grupos disponibles',
      tone: 'pending' as const,
    }
  }

  if (status.ready) {
    return {
      label: 'Listo para enviar',
      detail: status.message || 'WhatsApp conectado correctamente',
      tone: 'ready' as const,
    }
  }

  if (status.qr?.available || status.status === 'qr') {
    return {
      label: 'Esperando QR',
      detail: 'Escanea el codigo para iniciar sesion',
      tone: 'pending' as const,
    }
  }

  if (status.status === 'starting' || status.status === 'authenticated') {
    return {
      label: 'Conectando WhatsApp',
      detail: status.message || 'Preparando WhatsApp Web',
      tone: 'pending' as const,
    }
  }

  if (status.status === 'disconnected') {
    return {
      label: 'Reconectando',
      detail: status.message || 'Reconectando WhatsApp Web',
      tone: 'pending' as const,
    }
  }

  if (status.status === 'auth_failure' || status.status === 'initialization_failure') {
    return {
      label: 'Error de conexion',
      detail: status.message || 'No se pudo iniciar WhatsApp',
      tone: 'error' as const,
    }
  }

  return {
    label: 'Conectando WhatsApp',
    detail: status.message || 'Preparando WhatsApp Web',
    tone: 'pending' as const,
  }
}

function loadSavedGroupLists() {
  try {
    const rawLists = localStorage.getItem(SAVED_GROUP_LISTS_STORAGE_KEY)
    if (!rawLists) return []

    const parsedLists = JSON.parse(rawLists)
    return Array.isArray(parsedLists) ? parsedLists as SavedGroupList[] : []
  } catch {
    return []
  }
}

function loadStoredStringArray(storageKey: string) {
  try {
    const rawItems = localStorage.getItem(storageKey)
    if (!rawItems) return []

    const parsedItems = JSON.parse(rawItems)
    return Array.isArray(parsedItems) ? parsedItems.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function loadRecentGroups() {
  try {
    const rawItems = localStorage.getItem(RECENT_GROUPS_STORAGE_KEY)
    if (!rawItems) return {} as Record<string, number>

    const parsedItems = JSON.parse(rawItems)
    if (!parsedItems || typeof parsedItems !== 'object' || Array.isArray(parsedItems)) return {}

    return Object.fromEntries(
      Object.entries(parsedItems)
        .filter((entry): entry is [string, number] => typeof entry[0] === 'string' && typeof entry[1] === 'number'),
    )
  } catch {
    return {}
  }
}

const buttonBase = 'ui-btn pressable'
const primaryButton = `${buttonBase} ui-btn-primary`
const secondaryButton = `${buttonBase} ui-btn-secondary`
const dangerButton = `${buttonBase} ui-btn-danger`
const ghostButton = `${buttonBase} ui-btn-ghost`
const panelClass = 'app-panel surface-panel p-5'
const sidebarPanelClass = 'app-panel surface-panel shrink-0 p-4'

const accentRgbByColor = {
  emerald: '5 150 105',
  blue: '37 99 235',
  violet: '124 58 237',
  rose: '225 29 72',
  amber: '217 119 6',
  slate: '15 23 42',
}

function App() {
  const {
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
  } = useSettings()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [statusState, setStatusState] = useState<LoadState>('idle')
  const [statusError, setStatusError] = useState('')
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 140)
  const [selectionView, setSelectionView] = useState<SelectionView>('all')
  const { groups, setGroups, clearGroups } = useGroups()
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => new Set())
  const [favoriteGroupIds, setFavoriteGroupIds] = useState<Set<string>>(() => new Set(loadStoredStringArray(FAVORITE_GROUPS_STORAGE_KEY)))
  const [recentGroups, setRecentGroups] = useState<Record<string, number>>(() => loadRecentGroups())
  const [savedGroupLists, setSavedGroupLists] = useState<SavedGroupList[]>(() => loadSavedGroupLists())
  const [newListName, setNewListName] = useState('')
  const [selectionFeedback, setSelectionFeedback] = useState('')
  const [destinationMode, setDestinationMode] = useState<DestinationMode>('single')
  const [groupState, setGroupState] = useState<LoadState>('idle')
  const [groupError, setGroupError] = useState('')
  const [groupsRefreshing, setGroupsRefreshing] = useState(false)
  const groupsCountRef = useRef(groups.length)
  const [message, setMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [mediaAttachment, setMediaAttachment] = useState<MediaAttachment | null>(null)
  const [sessions] = useState<SessionSummary[]>(() => [{ id: getStoredSessionId(), status: '', ready: false, qrAvailable: false, createdAt: '', updatedAt: '' }])
  const selectedSessionId = sessions[0]?.id ?? 'default'
  const [authenticated, setAuthenticated] = useState(() => !!getToken())

  const handleFileSelect = useCallback((file: File | null) => {
    setSelectedFile(file)
    if (!file) {
      setImagePreview(null)
      setMediaAttachment(null)
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImagePreview(dataUrl)
      const parts = dataUrl.split(',')
      const mimeMatch = parts[0].match(/:(.*?);/)
      setMediaAttachment({
        mimetype: mimeMatch ? mimeMatch[1] : 'image/jpeg',
        data: parts[1] || '',
        filename: file.name,
        filesize: file.size,
      })
    }
    reader.readAsDataURL(file)
  }, [])

  const [sendState, setSendState] = useState<LoadState>('idle')
  const [sendFeedback, setSendFeedback] = useState('')
  const [sendResults, setSendResults] = useState<SendProgressResult[]>([])
  const [currentSendIndex, setCurrentSendIndex] = useState(0)
  const [currentGroupName, setCurrentGroupName] = useState('')
  const { sendHistory, openHistoryId, setOpenHistoryId, addSendHistoryItem, clearSendHistory } = useSendHistory()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingSendConfirmation | null>(null)
  const cancelSendRef = useRef(false)

  const {
    messages: scheduledMessages,
    loadState: scheduledLoadState,
    createScheduled,
    cancelScheduled,
    statusLabel,
  } = useScheduledMessages(apiBaseUrl, selectedSessionId)
  const [isScheduleOpen, setIsScheduleOpen] = useState(false)

  const selectedSession = sessions[0] ?? null
  const sessionBaseUrl = `${apiBaseUrl}/sessions/${selectedSessionId}`
  const isReady = Boolean(status?.ready)

  useEffect(() => {
    groupsCountRef.current = groups.length
  }, [groups.length])

  const searchedGroups = useMemo(() => {
    const search = normalizeText(debouncedQuery.trim())

    return [...groups]
      .filter((group) => !search || normalizeText(group.name).includes(search))
      .sort((a, b) => {
        const favoriteDelta = Number(favoriteGroupIds.has(b.id)) - Number(favoriteGroupIds.has(a.id))
        if (favoriteDelta !== 0) return favoriteDelta

        const recentDelta = (recentGroups[b.id] ?? 0) - (recentGroups[a.id] ?? 0)
        if (recentDelta !== 0) return recentDelta

        return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      })
  }, [debouncedQuery, favoriteGroupIds, groups, recentGroups])
  const filteredGroups = useMemo(() => {
    if (selectionView === 'favorites') {
      return searchedGroups.filter((group) => favoriteGroupIds.has(group.id))
    }

    if (selectionView === 'selected') {
      return searchedGroups.filter((group) => selectedGroupIds.has(group.id))
    }

    if (selectionView === 'unselected') {
      return searchedGroups.filter((group) => !selectedGroupIds.has(group.id))
    }

    return searchedGroups
  }, [favoriteGroupIds, searchedGroups, selectedGroupIds, selectionView])
  const selectedCount = selectedGroupIds.size
  const favoriteCount = favoriteGroupIds.size
  const recentGroupIds = useMemo(
    () => new Set(Object.entries(recentGroups).sort(([, a], [, b]) => b - a).slice(0, 30).map(([groupId]) => groupId)),
    [recentGroups],
  )
  const unselectedCount = Math.max(groups.length - selectedCount, 0)
  const destinationGroupsPreview = destinationMode === 'all'
    ? groups
    : destinationMode === 'selected'
      ? groups.filter((group) => selectedGroupIds.has(group.id))
      : selectedGroup
        ? [selectedGroup]
        : []
  const destinationCount = destinationGroupsPreview.length
  const estimatedSeconds = destinationCount > 1 ? (destinationCount - 1) * delaySeconds : 0
  const estimatedMinutes = Math.floor(estimatedSeconds / 60)
  const estimatedRemainderSeconds = estimatedSeconds % 60
  const estimatedLabel = estimatedSeconds > 0
    ? `${estimatedMinutes > 0 ? `${estimatedMinutes}m ` : ''}${estimatedRemainderSeconds}s`
    : 'Inmediato'
  const selectedLabel = destinationMode === 'all'
    ? `Todos los grupos (${groups.length})`
    : destinationMode === 'selected'
      ? `${selectedCount} grupos seleccionados`
      : selectedGroup?.name ?? 'Ningun grupo seleccionado'
  const canSendSingle = destinationMode === 'single' && selectedGroup
  const canSendSelected = destinationMode === 'selected' && selectedCount > 0
  const canSendAll = destinationMode === 'all' && groups.length > 0
  const canSend = isReady && (message.trim() || mediaAttachment) && sendState !== 'loading' && (canSendSingle || canSendSelected || canSendAll)
  const failedResults = sendResults.filter((result) => result.error)
  const progressDone = sendResults.filter((result) => result.ok || result.error).length
  const progressTotal = sendResults.length
  const progressPercent = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0
  const lastHistoryItem = sendHistory[0]
  const qrDataUrl = status?.qr?.available ? status.qr.dataUrl : null
  const connectionStatus = useMemo(
    () => getConnectionStatus({ status, statusState, groupState, groupsRefreshing }),
    [groupState, groupsRefreshing, status, statusState],
  )
  const statusDetail = connectionStatus.detail
  const isConnectionProblem = connectionStatus.tone === 'error'
  const isConnectionReady = connectionStatus.tone === 'ready'

  const userName = status?.info?.pushname ?? null
  const userPhone = status?.info?.wid?.user ?? null

  const fetchStatus = useCallback(async () => {
    if (!selectedSessionId || !getToken()) return null
    setStatusState('loading')
    setStatusError('')

    const url = `${apiBaseUrl}/sessions/${selectedSessionId}/status`

    try {
      const response = await apiFetch(url)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = (await response.json()) as StatusResponse
      setStatus(data)
      setStatusState('success')
      return data
    } catch (error) {
      setStatus(null)
      setStatusState('error')
      setStatusError(error instanceof Error ? error.message : 'No se pudo consultar el estado')
      return null
    }
  }, [apiBaseUrl, selectedSessionId])

  const loadGroups = useCallback(async ({ force = false } = {}) => {
    if (!getToken()) return
    const hasGroups = groupsCountRef.current > 0
    const base = `${apiBaseUrl}/sessions/${selectedSessionId}`
    const nextUrl = force
      ? `${base}/groups?refresh=1`
      : `${base}/groups`

    if (force && hasGroups) {
      setGroupsRefreshing(true)
    } else {
      setGroupState('loading')
    }

    setGroupError('')
    setSendFeedback('')
    performance.mark('groups-load-start')

    try {
      const response = await apiFetch(nextUrl)
      const data = (await response.json()) as GroupsResponse

      if (response.status === 503 && data.ready === false) {
        setGroupState('idle')
        setGroupError('')
        return
      }

      if (response.status === 202 && data.syncing) {
        setGroupState(groupsCountRef.current > 0 ? 'success' : 'loading')
        setGroupError(data.error || 'WhatsApp todavia esta sincronizando los grupos')
        return
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      const nextGroups = data.groups ?? []
      setGroups(nextGroups)
      setGroupState('success')

      setSelectedGroup((currentGroup) =>
        currentGroup && !nextGroups.some((group) => group.id === currentGroup.id)
          ? null
          : currentGroup,
      )
      setSelectedGroupIds((currentIds) => {
        const nextGroupIds = new Set(nextGroups.map((group) => group.id))
        return new Set([...currentIds].filter((id) => nextGroupIds.has(id)))
      })
      performance.mark('groups-load-success')
      performance.measure('groups-load', 'groups-load-start', 'groups-load-success')
    } catch (error) {
      setSelectedGroup(null)
      setGroupState('error')
      setGroupError(error instanceof Error ? error.message : 'No se pudieron cargar los grupos')
      performance.mark('groups-load-error')
      performance.measure('groups-load', 'groups-load-start', 'groups-load-error')
    } finally {
      setGroupsRefreshing(false)
    }
  }, [apiBaseUrl, selectedSessionId, setGroups])

  const refreshGroups = useCallback(() => {
    loadGroups({ force: true })
  }, [loadGroups])

  const refreshData = useCallback(async () => {
    const nextStatus = await fetchStatus()

    if (nextStatus?.ready) {
      await loadGroups()
    } else {
      setGroupState('idle')
      setGroupError('')
    }
  }, [fetchStatus, loadGroups])

  const filterGroups = (event: FormEvent) => {
    event.preventDefault()
  }

  const markGroupsAsUsed = useCallback((groupIds: string[]) => {
    if (groupIds.length === 0) return

    setRecentGroups((currentRecentGroups) => {
      const now = Date.now()
      const nextRecentGroups = { ...currentRecentGroups }
      groupIds.forEach((groupId) => {
        nextRecentGroups[groupId] = now
      })

      const compactRecentGroups = Object.fromEntries(
        Object.entries(nextRecentGroups)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 80),
      )
      localStorage.setItem(RECENT_GROUPS_STORAGE_KEY, JSON.stringify(compactRecentGroups))
      return compactRecentGroups
    })
  }, [])

  const selectSingleGroup = useCallback((group: Group) => {
    setDestinationMode('single')
    setSelectedGroup(group)
    markGroupsAsUsed([group.id])
  }, [markGroupsAsUsed])

  const persistSavedGroupLists = (nextLists: SavedGroupList[]) => {
    localStorage.setItem(SAVED_GROUP_LISTS_STORAGE_KEY, JSON.stringify(nextLists))
  }

  const persistFavoriteGroups = (nextIds: Set<string>) => {
    localStorage.setItem(FAVORITE_GROUPS_STORAGE_KEY, JSON.stringify([...nextIds]))
  }

  const toggleFavoriteGroup = useCallback((group: Group) => {
    setFavoriteGroupIds((currentIds) => {
      const nextIds = new Set(currentIds)

      if (nextIds.has(group.id)) {
        nextIds.delete(group.id)
      } else {
        nextIds.add(group.id)
      }

      persistFavoriteGroups(nextIds)
      return nextIds
    })
  }, [])

  const toggleSelectedGroup = useCallback((group: Group) => {
    setDestinationMode('selected')
    setSelectedGroup(null)
    markGroupsAsUsed([group.id])
    setSelectedGroupIds((currentIds) => {
      const nextIds = new Set(currentIds)

      if (nextIds.has(group.id)) {
        nextIds.delete(group.id)
      } else {
        nextIds.add(group.id)
      }

      return nextIds
    })
  }, [markGroupsAsUsed])

  const selectFilteredGroups = () => {
    setDestinationMode('selected')
    setSelectedGroup(null)
    setSelectionFeedback('')
    setSelectedGroupIds((currentIds) => {
      const nextIds = new Set(currentIds)
      filteredGroups.forEach((group) => nextIds.add(group.id))
      return nextIds
    })
  }

  const clearFilteredGroups = () => {
    setDestinationMode('selected')
    setSelectedGroup(null)
    setSelectionFeedback('')
    setSelectedGroupIds((currentIds) => {
      const nextIds = new Set(currentIds)
      filteredGroups.forEach((group) => nextIds.delete(group.id))
      return nextIds
    })
  }

  const clearSelectedGroups = () => {
    setSelectedGroupIds(new Set())
    setSelectionFeedback('')
  }

  const saveCurrentGroupList = () => {
    const listName = newListName.trim()

    if (!listName || selectedCount === 0) return

    const nextList: SavedGroupList = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: listName,
      groupIds: [...selectedGroupIds],
      createdAt: new Date().toISOString(),
    }

    setSavedGroupLists((currentLists) => {
      const listsWithoutSameName = currentLists.filter(
        (list) => normalizeText(list.name) !== normalizeText(listName),
      )
      const nextLists = [nextList, ...listsWithoutSameName].slice(0, 20)
      persistSavedGroupLists(nextLists)
      return nextLists
    })
    setNewListName('')
    setSelectionFeedback(`Lista "${listName}" guardada con ${selectedCount} grupos.`)
  }

  const applySavedGroupList = (list: SavedGroupList) => {
    const availableGroupIds = new Set(groups.map((group) => group.id))
    const nextIds = list.groupIds.filter((id) => availableGroupIds.has(id))

    setDestinationMode('selected')
    setSelectedGroup(null)
    setSelectionView('selected')
    setSelectedGroupIds(new Set(nextIds))
    setSelectionFeedback(`Lista "${list.name}" aplicada: ${nextIds.length} grupos disponibles.`)
  }

  const deleteSavedGroupList = (listId: string) => {
    setSavedGroupLists((currentLists) => {
      const nextLists = currentLists.filter((list) => list.id !== listId)
      persistSavedGroupLists(nextLists)
      return nextLists
    })
    setSelectionFeedback('Lista eliminada.')
  }

  const createHistoryItem = (
    destinationGroups: Group[],
    reminderMessage: string,
    results: SendProgressResult[],
    cancelled: boolean,
  ): SendHistoryItem => {
    const processedResults = results.filter((result) => result.ok || result.error)
    const sent = processedResults.filter((result) => result.ok).length
    const failed = processedResults.filter((result) => result.error).length

    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      mode: destinationMode,
      message: reminderMessage,
      total: destinationGroups.length,
      sent,
      failed,
      cancelled,
      results,
    }
  }

  const getDestinationGroups = () => {
    if (destinationMode === 'all') return groups

    if (destinationMode === 'selected') {
      return groups.filter((group) => selectedGroupIds.has(group.id))
    }

    return selectedGroup ? [selectedGroup] : []
  }

  const sendGroupReminder = async (group: Group, reminderMessage: string, media?: MediaAttachment | null) => {
    const body: Record<string, unknown> = {
      groupId: group.id,
      message: reminderMessage,
    }
    if (media) {
      body.media = media
    }
    const response = await apiFetch(`${sessionBaseUrl}/send-group-reminder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = (await response.json()) as SendResponse

    if (!response.ok || !data.ok) {
      throw new Error(data.error || data.message || `HTTP ${response.status}`)
    }
  }

  const runSequentialSend = async (destinationGroups: Group[], reminderMessage: string, media?: MediaAttachment | null) => {
    markGroupsAsUsed(destinationGroups.map((group) => group.id))
    cancelSendRef.current = false
    setSendState('loading')
    setSendFeedback('')
    setCurrentSendIndex(0)
    setCurrentGroupName('')
    setSendResults(destinationGroups.map((group) => ({ ...group, ok: false })))

    const nextResults: SendProgressResult[] = destinationGroups.map((group) => ({ ...group, ok: false }))

    for (const [index, group] of destinationGroups.entries()) {
      if (cancelSendRef.current) {
        setCurrentGroupName('')
        setSendState('error')
        setSendFeedback(`Envio cancelado. Se procesaron ${index} de ${destinationGroups.length} grupos.`)
        addSendHistoryItem(createHistoryItem(destinationGroups, reminderMessage, nextResults, true))
        return
      }

      setCurrentSendIndex(index + 1)
      setCurrentGroupName(group.name)

      try {
        await sendGroupReminder(group, reminderMessage, media)
        nextResults[index] = { ...group, ok: true }
      } catch (error) {
        nextResults[index] = {
          ...group,
          ok: false,
          error: error instanceof Error ? error.message : 'No se pudo enviar',
        }
      }

      setSendResults([...nextResults])

      if (index < destinationGroups.length - 1 && delaySeconds > 0) {
        await wait(delaySeconds * 1000)
      }
    }

    const failed = nextResults.filter((result) => result.error)

    setCurrentGroupName('')

    if (failed.length > 0) {
      setSendState('error')
      setSendFeedback(`Envio terminado con ${failed.length} fallos de ${destinationGroups.length}.`)
      addSendHistoryItem(createHistoryItem(destinationGroups, reminderMessage, nextResults, false))
      return
    }

    setSendState('success')
    setSendFeedback(`Recordatorio enviado a ${destinationGroups.length} grupos.`)
    addSendHistoryItem(createHistoryItem(destinationGroups, reminderMessage, nextResults, false))
    setMessage('')
    setSelectedFile(null)
    setImagePreview(null)
    setMediaAttachment(null)
  }

  const requestSend = async () => {
    const reminderMessage = message.trim()

    if (!reminderMessage) return
    if (destinationMode === 'single' && !selectedGroup) return
    if (destinationMode === 'selected' && selectedCount === 0) return

    const destinationGroups = getDestinationGroups()

    if (destinationGroups.length === 0) return

    if (destinationGroups.length > 1) {
      setPendingConfirmation({
        destinationGroups,
        reminderMessage,
        title: 'Confirmar envio multiple',
        hasMedia: !!mediaAttachment,
        mediaPreview: imagePreview,
        mediaName: selectedFile?.name,
      })
      return
    }

    await runSequentialSend(destinationGroups, reminderMessage, mediaAttachment)
  }

  const sendReminder = async (event: FormEvent) => {
    event.preventDefault()
    await requestSend()
  }

  const cancelSending = () => {
    cancelSendRef.current = true
  }

  const retryFailed = async () => {
    const reminderMessage = message.trim()

    if (!reminderMessage || failedResults.length === 0) return

    if (failedResults.length > 1) {
      setPendingConfirmation({
        destinationGroups: failedResults,
        reminderMessage,
        title: 'Reintentar grupos fallidos',
        hasMedia: !!mediaAttachment,
        mediaPreview: imagePreview,
        mediaName: selectedFile?.name,
      })
      return
    }

    await runSequentialSend(failedResults, reminderMessage, mediaAttachment)
  }

  const cancelPendingConfirmation = () => {
    if (sendState === 'loading') return
    setPendingConfirmation(null)
  }

  const confirmPendingSend = async () => {
    if (!pendingConfirmation || sendState === 'loading') return

    const { destinationGroups, reminderMessage } = pendingConfirmation
    setPendingConfirmation(null)
    await runSequentialSend(destinationGroups, reminderMessage, mediaAttachment)
  }

  const clearSendResults = () => {
    if (sendState === 'loading') return

    setSendResults([])
    setCurrentSendIndex(0)
    setCurrentGroupName('')
    setSendFeedback('')
    setSendState('idle')
  }

  const [disconnectState, setDisconnectState] = useState<LoadState>('idle')
  const [pendingDisconnect, setPendingDisconnect] = useState(false)

  const requestDisconnect = () => {
    setPendingDisconnect(true)
  }

  const resetAfterDisconnect = () => {
    clearGroups()
    setStatus({
      ready: false,
      status: 'starting',
      message: 'Sesion desconectada. Generando un nuevo QR...',
      state: null,
      info: null,
      qr: { available: false, dataUrl: null },
    })
    setStatusState('success')
    setStatusError('')
    setGroupState('idle')
    setGroupError('')
    setGroupsRefreshing(false)
    setQuery('')
    setSelectionView('all')
    setSelectedGroup(null)
    setSelectedGroupIds(new Set())
    setSelectionFeedback('')
    setDestinationMode('single')
    setSendResults([])
    setCurrentSendIndex(0)
    setCurrentGroupName('')
    setSendFeedback('')
    setSendState('idle')
    setPendingConfirmation(null)
    setSelectedFile(null)
    setImagePreview(null)
    setMediaAttachment(null)
  }

  const confirmDisconnect = async () => {
    setPendingDisconnect(false)
    setDisconnectState('loading')

    try {
      const response = await apiFetch(`${sessionBaseUrl}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      setDisconnectState('success')
      resetAfterDisconnect()
      await fetchStatus()
    } catch (error) {
      console.error('Error al desconectar:', error)
      setDisconnectState('error')
    }
  }

  useEffect(() => {
    if (!selectedSessionId) return
    refreshData()
  }, [refreshData, selectedSessionId])

  useEffect(() => {
    const statusInterval = window.setInterval(() => {
      fetchStatus()
    }, 5000)

    return () => window.clearInterval(statusInterval)
  }, [fetchStatus])

  useEffect(() => {
    if (status?.status === 'ready') {
      sessionStorage.removeItem(DISCONNECT_RELOAD_KEY)
      return
    }

    if (status?.status !== 'disconnected') return

    const reloadKey = `${status.status}:${status.message || 'sin-detalle'}`

    if (sessionStorage.getItem(DISCONNECT_RELOAD_KEY) === reloadKey) return

    sessionStorage.setItem(DISCONNECT_RELOAD_KEY, reloadKey)
    window.setTimeout(() => {
      window.location.reload()
    }, 750)
  }, [status?.message, status?.status])

  useEffect(() => {
    const closeTopLayer = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (pendingConfirmation) {
        if (sendState !== 'loading') setPendingConfirmation(null)
        return
      }

      if (isHistoryOpen) {
        setIsHistoryOpen(false)
        return
      }

      if (isSettingsOpen) {
        setIsSettingsOpen(false)
      }
    }

    window.addEventListener('keydown', closeTopLayer)
    return () => window.removeEventListener('keydown', closeTopLayer)
  }, [isHistoryOpen, isSettingsOpen, pendingConfirmation, sendState])

  useEffect(() => {
    const openCommandPalette = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey)) return

      event.preventDefault()
      setIsCommandPaletteOpen((currentOpen) => !currentOpen)
    }

    window.addEventListener('keydown', openCommandPalette)
    return () => window.removeEventListener('keydown', openCommandPalette)
  }, [])

  if (!authenticated) {
    return <LoginPage apiBaseUrl={apiBaseUrl} onLogin={() => setAuthenticated(true)} />
  }

  return (
    <div
      data-accent={settings.accentColor}
      data-blur={settings.blurIntensity}
      data-density={settings.density}
      data-theme={resolvedTheme}
      className="app-shell flex h-screen flex-col overflow-hidden"
      style={{ '--accent-rgb': accentRgbByColor[settings.accentColor] } as CSSProperties}
    >
      <Titlebar />
    <main className="mx-auto flex min-h-0 w-full max-w-[1540px] flex-1 flex-col px-3 py-3 sm:px-5 lg:overflow-hidden lg:px-6">
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
          <button className={secondaryButton} type="button" onClick={() => setIsCommandPaletteOpen(true)}>
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
          <button className={ghostButton} type="button" onClick={refreshData}>
            <RefreshCw size={16} />
            <span>Actualizar</span>
          </button>
          <button className={ghostButton} type="button" onClick={toggleTheme}>
            <SunMoon size={16} />
            <span>{resolvedTheme === 'dark' ? 'Claro' : 'Oscuro'}</span>
          </button>
          <button className={secondaryButton} type="button" onClick={() => setIsSettingsOpen(true)}>
            <Settings size={16} />
            <span>Ajustes</span>
          </button>
        </div>
      </header>

      <div
        className="grid min-h-0 flex-1 gap-3 transition-[grid-template-columns] duration-300 lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)_390px]"
        style={{ '--sidebar-width': settings.sidebarCollapsed ? '76px' : '260px' } as CSSProperties}
      >
        <aside className="scroll-area flex min-h-0 flex-col gap-3 overflow-y-auto pr-1 pb-1">
          <section className={sidebarPanelClass}>
            <div className="flex items-start justify-between gap-3">
              {!settings.sidebarCollapsed && (
                <div>
                  <p className="section-kicker">Sesion</p>
                  <h2 className="mt-1 text-base font-semibold text-slate-950">
                    {connectionStatus.label}
                  </h2>
                </div>
              )}
              <span className={`mt-1 h-2.5 w-2.5 rounded-full ${isConnectionReady ? 'bg-emerald-500' : isConnectionProblem ? 'bg-rose-500' : 'bg-amber-500'}`} />
              <button className="icon-btn h-8 w-8" type="button" onClick={toggleSidebar}>
                {settings.sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
            </div>
            {!settings.sidebarCollapsed && status?.chromeRunning && !status?.ready && !status?.qr?.available && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-sm font-medium text-amber-900">Chrome esta abierto</p>
                <p className="mt-0.5 text-xs text-amber-800">Cerralo completamente y reinicia la app para conectar sin QR.</p>
              </div>
            )}
            {!settings.sidebarCollapsed && statusState === 'error' && <p className="mt-3 text-sm text-rose-700">{statusError}</p>}
            {!settings.sidebarCollapsed && (userName || userPhone ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-emerald-700">Autenticado</p>
                    <p className="mt-0.5 text-sm font-semibold text-emerald-900">{userName}</p>
                    {userPhone && <p className="text-xs font-medium text-emerald-600">+{userPhone}</p>}
                  </div>
                  <button
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      disconnectState === 'loading'
                        ? 'bg-rose-200 text-rose-400 cursor-not-allowed'
                        : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                    }`}
                    type="button"
                    disabled={disconnectState === 'loading'}
                    onClick={requestDisconnect}
                  >
                    {disconnectState === 'loading' ? 'Desconectando...' : 'Desconectar'}
                  </button>
                </div>
              </div>
            ) : (
              isReady && <p className="mt-3 text-sm text-slate-600">{statusDetail}</p>
            ))}
            {!settings.sidebarCollapsed && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Sesión</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{selectedSession?.id ?? 'Cargando...'}</p>
                    <p className="mt-1 text-xs text-slate-500">{selectedSession?.message ?? 'Esperando conexion.'}</p>
                  </div>
                  <span className={`status-pill ${selectedSession?.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                    {selectedSession?.ready ? 'Listo' : 'Pendiente'}
                  </span>
                </div>
              </div>
            )}
            <dl className={`mt-4 grid gap-2 text-center ${settings.sidebarCollapsed ? 'grid-cols-1' : 'grid-cols-3'}`}>
              <div className="surface-card px-2 py-2.5">
                <dt className="text-[11px] font-semibold text-slate-500">{settings.sidebarCollapsed ? 'G' : 'Grupos'}</dt>
                <dd className="mt-1 text-base font-semibold text-slate-950">{groups.length}</dd>
              </div>
              <div className="surface-card px-2 py-2.5">
                <dt className="text-[11px] font-semibold text-slate-500">{settings.sidebarCollapsed ? 'V' : 'Vista'}</dt>
                <dd className="mt-1 text-base font-semibold text-slate-950">{filteredGroups.length}</dd>
              </div>
              <div className="surface-card px-2 py-2.5">
                <dt className="text-[11px] font-semibold text-slate-500">{settings.sidebarCollapsed ? 'S' : 'Sel.'}</dt>
                <dd className="mt-1 text-base font-semibold text-slate-950">{selectedCount}</dd>
              </div>
            </dl>
          </section>

          {!settings.sidebarCollapsed && <section className={`${sidebarPanelClass} overflow-hidden p-0`}>
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
                  onChange={(event) => setNewListName(event.target.value)}
                  placeholder="Nueva lista"
                />
                <button
                  className={secondaryButton}
                  type="button"
                  disabled={!newListName.trim() || selectedCount === 0}
                  onClick={saveCurrentGroupList}
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
                    <button className="w-full text-left" type="button" onClick={() => applySavedGroupList(list)}>
                      <span className="block truncate text-sm font-medium text-slate-950">{list.name}</span>
                      <span className="text-xs text-slate-500">{list.groupIds.length} grupos</span>
                    </button>
                    <button
                      className="mt-2 text-xs font-medium text-rose-600 opacity-70 transition hover:opacity-100"
                      type="button"
                      onClick={() => deleteSavedGroupList(list.id)}
                    >
                      Borrar
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>}

          <section className={`${sidebarPanelClass} p-4`}>
            <div className="flex items-center justify-between gap-3">
              {!settings.sidebarCollapsed && <h2 className="section-title">Historial</h2>}
              <button className="ui-btn ui-btn-ghost min-h-8 px-2 text-xs" type="button" onClick={() => setIsHistoryOpen(true)}>
                {settings.sidebarCollapsed ? <History size={16} /> : 'Ver todo'}
              </button>
            </div>
            {!settings.sidebarCollapsed && (lastHistoryItem ? (
              <button className="surface-card pressable mt-3 w-full p-3 text-left transition hover:bg-slate-100" type="button" onClick={() => setIsHistoryOpen(true)}>
                <span className="block text-xs font-medium text-slate-500">{formatDate(lastHistoryItem.createdAt)}</span>
                <span className="mt-1 block truncate text-sm font-semibold text-slate-950">{lastHistoryItem.message}</span>
                <span className="mt-2 block text-xs text-slate-500">{lastHistoryItem.sent}/{lastHistoryItem.total} enviados</span>
              </button>
            ) : (
              <p className="surface-card mt-3 border-dashed px-3 py-3 text-sm text-slate-500">Todavia no hay envios.</p>
            ))}
          </section>

          {!settings.sidebarCollapsed && (
            <ScheduledPanel
              formatDate={formatDate}
              loadState={scheduledLoadState}
              messages={scheduledMessages}
              onCancel={cancelScheduled}
              panelClass={sidebarPanelClass}
              statusLabel={statusLabel}
            />
          )}
        </aside>

        <section className={`${panelClass} grid min-h-[36rem] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-4 overflow-hidden p-0`}>
          <div className="border-b !border-slate-200/70 px-5 py-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="section-kicker">Grupos</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Elegir destinatarios</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="status-pill">{groups.length} grupos</span>
                <span className="status-pill">{filteredGroups.length} visibles</span>
                <span className="status-pill border-amber-200 bg-amber-50 text-amber-700">{favoriteCount} favoritos</span>
                <span className="status-pill border-slate-950 bg-slate-950 text-white">{selectedCount} seleccionados</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 px-5 lg:grid-cols-[minmax(0,1fr)_auto]">
            <form onSubmit={filterGroups}>
              <label className="sr-only" htmlFor="group-search">Buscar grupos</label>
              <input
                className="ui-field px-3 text-sm"
                id="group-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  selectionView === 'selected'
                    ? 'Buscar dentro de seleccionados'
                    : selectionView === 'favorites'
                      ? 'Buscar favoritos'
                    : selectionView === 'unselected'
                      ? 'Buscar dentro de no seleccionados'
                      : 'Buscar grupos'
                }
              />
            </form>
            <button className={secondaryButton} type="button" disabled={!isReady || groupState === 'loading' || groupsRefreshing} onClick={refreshGroups}>
              {groupsRefreshing ? 'Actualizando...' : groupState === 'loading' ? 'Cargando...' : 'Recargar'}
            </button>

            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 lg:col-span-2" role="group" aria-label="Filtro de seleccion">
              {([
                ['all', `Todos ${searchedGroups.length}`],
                ['favorites', `Favoritos ${favoriteCount}`],
                ['selected', `Seleccionados ${selectedCount}`],
                ['unselected', `No seleccionados ${unselectedCount}`],
              ] as const).map(([value, label]) => (
                <button
                  className={`min-h-9 flex-1 rounded-md px-2 text-sm font-medium transition ${
                    selectionView === value
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-500 hover:text-slate-950'
                  }`}
                  key={value}
                  type="button"
                  onClick={() => setSelectionView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <GroupList
            groups={filteredGroups}
            groupState={groupState}
            groupError={groupError}
            favoriteGroupIds={favoriteGroupIds}
            isReady={isReady}
            recentGroupIds={recentGroupIds}
            query={debouncedQuery}
            selectedGroupId={selectedGroup?.id}
            selectedGroupIds={selectedGroupIds}
            hasQuery={debouncedQuery.trim().length > 0}
            onClearQuery={() => setQuery('')}
            onRefresh={loadGroups}
            onSelectSingle={selectSingleGroup}
            onToggleFavorite={toggleFavoriteGroup}
            onToggleSelected={toggleSelectedGroup}
          />

          {selectedCount > 0 && (
            <div className="animate-slide-up border-t !border-slate-200/70 bg-white/85 px-5 py-3 backdrop-blur-xl">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-slate-700">{selectedCount} grupos seleccionados</p>
                <div className="flex flex-wrap gap-2">
                  <button className={secondaryButton} type="button" onClick={selectFilteredGroups}>
                    Seleccionar visibles
                  </button>
                  <button className={secondaryButton} type="button" onClick={clearFilteredGroups}>
                    Quitar visibles
                  </button>
                  <button className={ghostButton} type="button" onClick={clearSelectedGroups}>
                    Limpiar
                  </button>
                  <button
                    className={primaryButton}
                    type="button"
                    onClick={() => {
                      setDestinationMode('selected')
                      setSelectedGroup(null)
                    }}
                  >
                    Usar seleccion
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className={`${panelClass} grid min-h-[36rem] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0`}>
          <div className="border-b !border-slate-200/70 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-kicker">Composer</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">Mensaje</h2>
              </div>
              <span className="status-pill min-h-0 px-3 py-1 text-xs">
                {destinationMode === 'all'
                  ? 'Masivo'
                  : destinationMode === 'selected'
                    ? 'Multiple'
                    : 'Individual'}
              </span>
            </div>
          </div>

          <div className="scroll-area min-h-0 overflow-auto px-5 py-4">
            {qrDataUrl && (
              <section className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <img className="mx-auto h-44 w-44 rounded-lg bg-white p-2 shadow-sm" src={qrDataUrl} alt="QR de WhatsApp para iniciar sesion" />
                <h3 className="mt-3 text-sm font-semibold text-slate-950">Vincular WhatsApp</h3>
                <p className="mt-1 text-sm text-slate-600">Escanea el codigo desde dispositivos vinculados.</p>
              </section>
            )}

            <div className="surface-card bg-slate-50 p-4">
              <p className="section-kicker">Destino</p>
              <strong className="mt-1 block text-base text-slate-950">{selectedLabel}</strong>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <button
                  className={`rounded-md px-2 py-2 text-xs font-medium transition ${destinationMode === 'single' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:bg-white'}`}
                  type="button"
                  onClick={() => setDestinationMode('single')}
                >
                  Uno
                </button>
                <button
                  className={`rounded-md px-2 py-2 text-xs font-medium transition disabled:opacity-40 ${destinationMode === 'selected' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:bg-white'}`}
                  type="button"
                  disabled={selectedCount === 0}
                  onClick={() => {
                    setDestinationMode('selected')
                    setSelectedGroup(null)
                  }}
                >
                  Seleccion
                </button>
                <button
                  className={`rounded-md px-2 py-2 text-xs font-medium transition disabled:opacity-40 ${destinationMode === 'all' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:bg-white'}`}
                  type="button"
                  disabled={groups.length === 0}
                  onClick={() => {
                    setDestinationMode('all')
                    setSelectedGroup(null)
                  }}
                >
                  Todos
                </button>
              </div>
            </div>

            <form className="mt-4 grid gap-4" onSubmit={sendReminder}>
              <label className="grid gap-2 text-sm font-medium text-slate-950" htmlFor="message">
                Mensaje
                <textarea
                  className="ui-field min-h-44 resize-none p-4 text-sm leading-6"
                  id="message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Escribir mensaje..."
                  rows={7}
                />
              </label>

              <div className="flex items-center gap-3">
                <label className="ui-btn ui-btn-secondary pressable cursor-pointer">
                  <Image size={16} />
                  <span>{selectedFile ? 'Cambiar foto' : 'Adjuntar foto'}</span>
                  <input
                    accept="image/*"
                    className="sr-only"
                    type="file"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                  />
                </label>
                {selectedFile && (
                  <button
                    className="pressable text-sm font-medium text-rose-600 hover:text-rose-800"
                    type="button"
                    onClick={() => handleFileSelect(null)}
                  >
                    Quitar foto
                  </button>
                )}
              </div>

              {imagePreview && (
                <div className="surface-card bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">{selectedFile?.name}</p>
                      <p className="text-xs text-slate-400">
                        {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : ''}
                      </p>
                    </div>
                  </div>
                  <img
                    className="mt-2 max-h-40 w-full rounded-lg object-contain bg-white"
                    src={imagePreview}
                    alt={selectedFile?.name || 'Preview'}
                  />
                </div>
              )}


              <label className="grid gap-2 text-sm font-medium text-slate-950" htmlFor="delay-seconds">
                Pausa entre grupos
                <div className="surface-card grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3 px-3 py-2">
                  <input
                    className="accent-slate-950"
                    min={0}
                    max={60}
                    type="range"
                    value={delaySeconds}
                    onChange={(event) => updateDelaySeconds(Number(event.target.value) || 0)}
                  />
                  <input
                    className="ui-field h-9 min-h-9 px-2 text-center text-sm font-medium"
                    id="delay-seconds"
                    min={0}
                    max={60}
                    type="number"
                    value={delaySeconds}
                    onChange={(event) => updateDelaySeconds(Number(event.target.value) || 0)}
                  />
                </div>
              </label>

              <div className="surface-card grid grid-cols-2 gap-2 bg-slate-50 p-3 text-sm">
                <div>
                  <span className="block text-xs text-slate-500">Destinos</span>
                  <strong className="text-slate-950">{destinationCount}</strong>
                </div>
                <div>
                  <span className="block text-xs text-slate-500">Estimado</span>
                  <strong className="text-slate-950">{estimatedLabel}</strong>
                </div>
              </div>
            </form>

            {progressTotal > 0 && (
              <section className="surface-card animate-slide-up mt-5 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Progreso de envio</p>
                  <p className="text-sm text-slate-600">
                    {currentGroupName
                      ? `Enviando ${currentSendIndex} de ${progressTotal}: ${currentGroupName}`
                      : `${progressDone} de ${progressTotal} procesados`}
                  </p>
                </div>
                <strong className="text-lg text-slate-950">{progressPercent}%</strong>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button className={secondaryButton} type="button" disabled={failedResults.length === 0 || sendState === 'loading' || !message.trim()} onClick={retryFailed}>
                  Reintentar fallidos ({failedResults.length})
                </button>
                <button className={secondaryButton} type="button" disabled={sendState === 'loading'} onClick={clearSendResults}>
                  Limpiar resultados
                </button>
              </div>

              <div className="scroll-area mt-4 max-h-52 overflow-auto rounded-md border border-slate-200 bg-white">
                {sendResults.map((result) => (
                  <div className="animate-list-item grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0" key={result.id}>
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${result.ok ? 'bg-emerald-500' : result.error ? 'bg-rose-500' : 'bg-slate-300'}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-950">{result.name}</p>
                      <p className={`truncate text-xs ${result.error ? 'text-rose-700' : 'text-slate-500'}`}>
                        {result.ok ? 'Enviado' : result.error ?? 'Pendiente'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {sendFeedback && (
            <p
              className={`mt-4 rounded-xl px-3 py-2 text-sm ${
                sendState === 'success'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-rose-50 text-rose-700'
              }`}
            >
              {sendFeedback}
            </p>
          )}
          </div>

          <div className="border-t !border-slate-200/70 bg-white/85 px-5 py-4 backdrop-blur-xl">
            <div className="grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <button className={secondaryButton} type="button" disabled={!canSend} onClick={() => setIsScheduleOpen(true)}>
                  <Calendar size={14} />
                  <span className="ml-1.5">Programar</span>
                </button>
                <button className={primaryButton} type="button" disabled={!canSend} onClick={requestSend}>
                  {sendState === 'loading' ? 'Enviando...' : `Enviar${destinationCount > 0 ? ` a ${destinationCount}` : ''}`}
                </button>
              </div>
              <button className={dangerButton} type="button" disabled={sendState !== 'loading'} onClick={cancelSending}>
                Cancelar envio
              </button>
            </div>
          </div>
        </aside>
      </div>
    </main>
    <CommandPalette
      open={isCommandPaletteOpen}
      groups={filteredGroups}
      isDark={resolvedTheme === 'dark'}
      sidebarCollapsed={settings.sidebarCollapsed}
      onOpenChange={setIsCommandPaletteOpen}
      onRefresh={refreshData}
      onOpenSettings={() => setIsSettingsOpen(true)}
      onOpenHistory={() => setIsHistoryOpen(true)}
      onToggleTheme={toggleTheme}
      onToggleSidebar={toggleSidebar}
      onSelectAllFiltered={selectFilteredGroups}
      onClearSelection={clearSelectedGroups}
      onSelectGroup={selectSingleGroup}
    />
    {isSettingsOpen && (
      <div className="modal-overlay fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6 backdrop-blur-md" onClick={() => setIsSettingsOpen(false)}>
        <section
          className="modal-surface surface-panel max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b !border-slate-200/70 bg-slate-50/80 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker">Ajustes</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950" id="settings-title">Configuracion local</h2>
              </div>
              <button
                className="icon-btn"
                type="button"
                aria-label="Cerrar ajustes"
                onClick={() => setIsSettingsOpen(false)}
              >
                X
              </button>
            </div>
          </div>

          <div className="grid gap-4 p-5">
            <label className="grid gap-2 text-sm font-medium text-slate-950" htmlFor="api-base-url">
              URL del backend
              <input
                className="ui-field bg-slate-50 px-3 text-sm font-normal"
                id="api-base-url"
                value={settings.apiBaseUrl}
                onChange={(event) => updateApiBaseUrl(event.target.value)}
                placeholder="http://localhost:3000"
              />
              <span className="text-xs font-normal text-slate-500">Cambialo si tu backend corre en otro puerto.</span>
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-950" htmlFor="settings-delay-seconds">
              Delay por defecto
              <input
                className="ui-field bg-slate-50 px-3 text-sm font-normal"
                id="settings-delay-seconds"
                min={0}
                max={60}
                type="number"
                value={delaySeconds}
                onChange={(event) => updateDelaySeconds(Number(event.target.value) || 0)}
              />
              <span className="text-xs font-normal text-slate-500">0 a 60 segundos.</span>
            </label>

            <section className="surface-card bg-slate-50 p-4">
              <div>
                <p className="text-sm font-medium text-slate-950">Apariencia</p>
                <p className="mt-1 text-xs text-slate-500">Personaliza densidad, color y profundidad visual.</p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-950">
                  Tema
                  <select
                    className="ui-field min-h-10 px-3 text-sm font-normal"
                    value={settings.theme}
                    onChange={(event) => updateTheme(event.target.value as typeof settings.theme)}
                  >
                    <option value="light">Claro</option>
                    <option value="dark">Oscuro</option>
                    <option value="system">Sistema</option>
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-950">
                  Densidad
                  <select
                    className="ui-field min-h-10 px-3 text-sm font-normal"
                    value={settings.density}
                    onChange={(event) => updateDensity(event.target.value as typeof settings.density)}
                  >
                    <option value="comfortable">Comoda</option>
                    <option value="compact">Compacta</option>
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-950">
                  Color accent
                  <select
                    className="ui-field min-h-10 px-3 text-sm font-normal"
                    value={settings.accentColor}
                    onChange={(event) => updateAccentColor(event.target.value as typeof settings.accentColor)}
                  >
                    <option value="emerald">Emerald</option>
                    <option value="blue">Blue</option>
                    <option value="violet">Violet</option>
                    <option value="rose">Rose</option>
                    <option value="amber">Amber</option>
                    <option value="slate">Slate</option>
                  </select>
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-950">
                  Blur
                  <select
                    className="ui-field min-h-10 px-3 text-sm font-normal"
                    value={settings.blurIntensity}
                    onChange={(event) => updateBlurIntensity(event.target.value as typeof settings.blurIntensity)}
                  >
                    <option value="low">Bajo</option>
                    <option value="medium">Medio</option>
                    <option value="high">Alto</option>
                  </select>
                </label>
              </div>
            </section>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t !border-slate-200/70 bg-slate-50/80 px-5 py-4 sm:flex-row sm:justify-between">
            <button className={secondaryButton} type="button" onClick={resetSettings}>
              Restaurar defaults
            </button>
            <button className={primaryButton} type="button" onClick={() => setIsSettingsOpen(false)}>
              Guardar ajustes
            </button>
          </div>
        </section>
      </div>
    )}

    {isHistoryOpen && (
      <div className="modal-overlay fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6 backdrop-blur-md" onClick={() => setIsHistoryOpen(false)}>
        <section
          className="modal-surface surface-panel max-h-[calc(100vh-3rem)] w-full max-w-4xl overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b !border-slate-200/70 bg-slate-50/80 px-5 py-4">
            <div>
              <p className="section-kicker">Historial</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950" id="history-title">Envios recientes</h2>
              <p className="mt-1 text-sm text-slate-500">{sendHistory.length} registros guardados localmente</p>
            </div>
            <div className="flex gap-2">
              <button className={dangerButton} type="button" disabled={sendHistory.length === 0} onClick={clearSendHistory}>
                Borrar todo
              </button>
              <button
                className="icon-btn"
                type="button"
                aria-label="Cerrar historial"
                onClick={() => setIsHistoryOpen(false)}
              >
                X
              </button>
            </div>
          </div>

          <div className="scroll-area max-h-[calc(100vh-12rem)] overflow-auto p-5">
            {sendHistory.length === 0 ? (
              <div className="surface-card bg-slate-50 p-8 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-white text-slate-500 shadow-sm">
                  <Send size={22} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-950">Todavia no hay envios</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Cuando termines o canceles un envio, vas a ver aca el resumen completo y el detalle por grupo.
                </p>
                <button className={`${primaryButton} mt-4`} type="button" onClick={() => setIsHistoryOpen(false)}>
                  Crear primer envio
                </button>
              </div>
            ) : (
              <div className="grid gap-3">
                {sendHistory.map((historyItem) => {
                  const isOpen = openHistoryId === historyItem.id
                  const statusLabel = historyItem.cancelled
                    ? 'Cancelado'
                    : historyItem.failed > 0
                      ? 'Con fallos'
                      : 'Completo'

                  return (
                    <article className="surface-card animate-list-item overflow-hidden bg-white" key={historyItem.id}>
                      <button
                        className="grid w-full gap-4 p-4 text-left lg:grid-cols-[minmax(0,1fr)_260px]"
                        type="button"
                        onClick={() => setOpenHistoryId(isOpen ? null : historyItem.id)}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                historyItem.cancelled
                                  ? 'bg-amber-50 text-amber-800'
                                  : historyItem.failed > 0
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-emerald-50 text-emerald-800'
                              }`}
                            >
                              {statusLabel}
                            </span>
                            <span className="text-sm text-slate-500">{formatDate(historyItem.createdAt)}</span>
                            <span className="text-sm text-slate-500">
                              {historyItem.mode === 'all'
                                ? 'Todos'
                                : historyItem.mode === 'selected'
                                  ? 'Seleccionados'
                                  : 'Individual'}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-slate-950">{historyItem.message}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <span className="rounded-xl bg-slate-50 px-3 py-2">
                            <strong className="block text-sm text-slate-950">{historyItem.total}</strong>
                            <small className="text-xs text-slate-500">Total</small>
                          </span>
                          <span className="rounded-xl bg-emerald-50 px-3 py-2">
                            <strong className="block text-sm text-emerald-800">{historyItem.sent}</strong>
                            <small className="text-xs text-emerald-700">OK</small>
                          </span>
                          <span className="rounded-xl bg-rose-50 px-3 py-2">
                            <strong className="block text-sm text-rose-700">{historyItem.failed}</strong>
                            <small className="text-xs text-rose-600">Fallos</small>
                          </span>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t !border-slate-200/70 bg-slate-50/70 p-4">
                          <div className="scroll-area max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white">
                            {historyItem.results.map((result) => (
                              <div
                                className="animate-list-item grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0"
                                key={`${historyItem.id}-${result.id}`}
                              >
                                <span
                                  className={`mt-1 h-2.5 w-2.5 rounded-full ${
                                    result.ok ? 'bg-emerald-500' : result.error ? 'bg-rose-500' : 'bg-slate-300'
                                  }`}
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-950">{result.name}</p>
                                  <p className={`truncate text-xs ${result.error ? 'text-rose-700' : 'text-slate-500'}`}>
                                    {result.ok ? 'Enviado' : result.error ?? 'No procesado'}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    )}

    <ScheduleModal
      destinationGroups={destinationGroupsPreview}
      mediaAttachment={mediaAttachment}
      mediaPreview={imagePreview}
      mediaName={selectedFile?.name || null}
      message={message}
      onClose={() => setIsScheduleOpen(false)}
      onCreateScheduled={createScheduled}
      open={isScheduleOpen}
      primaryButton={primaryButton}
      secondaryButton={secondaryButton}
      selectedLabel={selectedLabel}
    />

    <SendConfirmationModal
      delaySeconds={delaySeconds}
      estimatedLabel={estimatedLabel}
      onCancel={cancelPendingConfirmation}
      onConfirm={confirmPendingSend}
      pendingConfirmation={pendingConfirmation}
      primaryButton={primaryButton}
      secondaryButton={secondaryButton}
      sendState={sendState}
    />

    {pendingDisconnect && (
      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6 backdrop-blur-md">
        <section
          className="surface-panel max-h-[calc(100vh-3rem)] w-full max-w-md overflow-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disconnect-title"
        >
          <div className="border-b border-rose-200/70 bg-rose-50/80 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-rose-100 text-lg">!</span>
              <div>
                <p className="text-xs font-semibold uppercase text-rose-500">Desconectar</p>
                <h2 className="mt-0.5 text-lg font-semibold text-rose-900" id="disconnect-title">
                  Cerrar sesion de WhatsApp
                </h2>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-5">
            <p className="text-sm leading-6 text-slate-700">
              Se va a cerrar la sesion actual de <strong className="text-slate-950">{userName || 'WhatsApp'}</strong>
              {userPhone && <> (<strong className="text-slate-950">+{userPhone}</strong>)</>}.
            </p>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-sm font-medium text-rose-800">Que va a pasar?</p>
              <ul className="mt-2 grid gap-1.5 text-sm text-rose-700">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">-</span>
                  <span>La sesion se cerrara y tendras que escanear el QR otra vez.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">-</span>
                  <span>Los recordatorios programados dejaran de enviarse.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">-</span>
                  <span>Para volver a usar la app, escanea el QR que aparece en pantalla.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="grid gap-2 border-t !border-slate-200/70 bg-slate-50/80 px-5 py-4 sm:grid-cols-2">
            <button className={secondaryButton} type="button" onClick={() => setPendingDisconnect(false)}>
              Cancelar
            </button>
            <button className={dangerButton} type="button" onClick={confirmDisconnect}>
              Desconectar
            </button>
          </div>
        </section>
      </div>
    )}
    </div>
  )
}

export default App
