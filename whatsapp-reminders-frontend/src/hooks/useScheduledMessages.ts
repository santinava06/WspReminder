import { useCallback, useEffect, useRef, useState } from 'react'
import type { Group } from '../components/GroupList'
import { apiFetch, getToken, isAbortError } from '../api'

export type ScheduledStatus = 'pending' | 'waiting_connection' | 'sending' | 'sent' | 'failed' | 'cancelled'

export type MediaAttachment = {
  mimetype: string
  data: string
  filename?: string
  filesize?: number
}

export type ScheduledMessage = {
  id: string
  groups: { id: string; name: string }[]
  title?: string
  message: string
  scheduledAt: string
  status: ScheduledStatus
  lastError?: string | null
  results: { groupId: string; groupName: string; ok: boolean; error?: string }[]
  createdAt: string
  updatedAt: string
  media?: MediaAttachment
}

type ScheduledResponse = {
  ok: boolean
  total?: number
  messages?: ScheduledMessage[]
  error?: string
}

export default function useScheduledMessages(apiBaseUrl: string, sessionId: string, connected?: boolean) {
  const [messages, setMessages] = useState<ScheduledMessage[]>([])
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const connectedRef = useRef(connected)
  const abortRef = useRef<AbortController | null>(null)
  connectedRef.current = connected
  const scheduledBaseUrl = `${apiBaseUrl}/sessions/${sessionId}/scheduled`

  const fetchScheduled = useCallback(async () => {
    if (!getToken()) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const response = await apiFetch(scheduledBaseUrl, { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as ScheduledResponse
      if (!data.ok) throw new Error(data.error || 'Error al obtener programados')
      setMessages(data.messages ?? [])
      setLoadState('success')
    } catch (err) {
      if (isAbortError(err)) return
      setError(err instanceof Error ? err.message : 'Error de conexion')
      setLoadState('error')
    }
  }, [scheduledBaseUrl])

  const createScheduled = useCallback(
    async (groups: Group[], message: string, scheduledAt: string, media?: MediaAttachment, title?: string) => {
      const response = await apiFetch(scheduledBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current?.signal,
        body: JSON.stringify({
          groups: groups.map((g) => ({ id: g.id, name: g.name })),
          message,
          scheduledAt,
          media,
          title,
        }),
      })
      const data = (await response.json()) as ScheduledResponse & { scheduled?: ScheduledMessage }
      if (!response.ok || !data.ok) throw new Error(data.error || 'Error al programar')
      await fetchScheduled()
      return data.scheduled!
    },
    [scheduledBaseUrl, fetchScheduled],
  )

  const cancelScheduled = useCallback(
    async (id: string) => {
      const response = await apiFetch(`${scheduledBaseUrl}/${id}`, {
        method: 'DELETE',
        signal: abortRef.current?.signal,
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Error al cancelar')
      await fetchScheduled()
    },
    [scheduledBaseUrl, fetchScheduled],
  )

  const deleteScheduled = useCallback(
    async (id: string) => {
      const response = await apiFetch(`${scheduledBaseUrl}/${id}/remove`, {
        method: 'DELETE',
        signal: abortRef.current?.signal,
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Error al eliminar')
      await fetchScheduled()
    },
    [scheduledBaseUrl, fetchScheduled],
  )

  const sendScheduledNow = useCallback(
    async (id: string) => {
      const response = await apiFetch(`${scheduledBaseUrl}/${id}/send-now`, {
        method: 'POST',
        signal: abortRef.current?.signal,
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Error al enviar ahora')
      await fetchScheduled()
      return data.scheduled
    },
    [scheduledBaseUrl, fetchScheduled],
  )

  useEffect(() => {
    if (!connectedRef.current) {
      setMessages([])
      setLoadState('idle')
      return
    }
    queueMicrotask(() => {
      fetchScheduled()
    })
    intervalRef.current = setInterval(fetchScheduled, 10_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      abortRef.current?.abort()
    }
  }, [fetchScheduled, connected])

  const statusLabel: Record<ScheduledStatus, string> = {
    pending: 'Pendiente',
    waiting_connection: 'Esperando conexion',
    sending: 'Enviando',
    sent: 'Enviado',
    failed: 'Fallido',
    cancelled: 'Cancelado',
  }

  const clearMessages = useCallback(() => {
    setMessages([])
    setLoadState('idle')
  }, [])

  return { messages, loadState, error, fetchScheduled, createScheduled, cancelScheduled, deleteScheduled, sendScheduledNow, clearMessages, statusLabel }
}
