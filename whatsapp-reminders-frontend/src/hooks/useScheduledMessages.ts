import { useCallback, useEffect, useRef, useState } from 'react'
import type { Group } from '../components/GroupList'
import { apiFetch } from '../api'

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

export default function useScheduledMessages(apiBaseUrl: string, sessionId: string) {
  const [messages, setMessages] = useState<ScheduledMessage[]>([])
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scheduledBaseUrl = `${apiBaseUrl}/sessions/${sessionId}/scheduled`

  const fetchScheduled = useCallback(async () => {
    try {
      const response = await apiFetch(scheduledBaseUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as ScheduledResponse
      if (!data.ok) throw new Error(data.error || 'Error al obtener programados')
      setMessages(data.messages ?? [])
      setLoadState('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexion')
      setLoadState('error')
    }
  }, [scheduledBaseUrl])

  const createScheduled = useCallback(
    async (groups: Group[], message: string, scheduledAt: string, media?: MediaAttachment) => {
      const response = await apiFetch(scheduledBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groups: groups.map((g) => ({ id: g.id, name: g.name })),
          message,
          scheduledAt,
          media,
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
      const response = await apiFetch(`${scheduledBaseUrl}/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Error al cancelar')
      await fetchScheduled()
    },
    [scheduledBaseUrl, fetchScheduled],
  )

  useEffect(() => {
    queueMicrotask(() => {
      fetchScheduled()
    })
    intervalRef.current = setInterval(fetchScheduled, 10_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchScheduled])

  const statusLabel: Record<ScheduledStatus, string> = {
    pending: 'Pendiente',
    waiting_connection: 'Esperando conexion',
    sending: 'Enviando',
    sent: 'Enviado',
    failed: 'Fallido',
    cancelled: 'Cancelado',
  }

  return { messages, loadState, error, fetchScheduled, createScheduled, cancelScheduled, statusLabel }
}
