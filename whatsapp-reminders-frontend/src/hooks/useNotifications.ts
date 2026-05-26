import { useCallback, useEffect, useRef } from 'react'
import type { ScheduledMessage } from './useScheduledMessages'

function checkPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return Promise.resolve('denied')
  if (Notification.permission === 'granted') return Promise.resolve('granted')
  if (Notification.permission === 'denied') return Promise.resolve('denied')
  return Notification.requestPermission()
}

export default function useNotifications(messages: ScheduledMessage[]) {
  const prevMapRef = useRef<Map<string, ScheduledMessage>>(new Map())
  const permRef = useRef<NotificationPermission>(checkPermission())

  const requestNotifyPermission = useCallback(() => {
    requestPermission().then(p => { permRef.current = p })
  }, [])

  useEffect(() => {
    if (permRef.current !== 'granted') return
    if (messages.length === 0) return

    const prevMap = prevMapRef.current
    const newMap = new Map<string, ScheduledMessage>()

    for (const msg of messages) {
      newMap.set(msg.id, msg)
      const prev = prevMap.get(msg.id)

      if (!prev) continue
      if (prev.status === msg.status) continue

      // Only notify on terminal status changes
      if (msg.status === 'sent' && prev.status !== 'sent') {
        const title = msg.title || 'Mensaje enviado'
        const body = `Enviado a ${(msg.results || []).filter(r => r.ok).length}/${(msg.groups || []).length} grupos`
        try { new Notification(title, { body, icon: '/favicon.ico' }) } catch {}
      }

      if (msg.status === 'failed') {
        const title = msg.title || 'Mensaje fallido'
        const body = (msg.lastError || 'Error al enviar el mensaje').slice(0, 100)
        try { new Notification(title, { body, icon: '/favicon.ico' }) } catch {}
      }

      if (msg.status === 'cancelled') {
        const title = msg.title || 'Mensaje cancelado'
        try { new Notification(title, { body: 'El mensaje programado fue cancelado', icon: '/favicon.ico' }) } catch {}
      }

      if (msg.status === 'sending') {
        const title = msg.title || 'Enviando mensaje'
        try { new Notification(title, { body: `Enviando a ${(msg.groups || []).length} grupos...`, icon: '/favicon.ico' }) } catch {}
      }
    }

    prevMapRef.current = newMap
  }, [messages])

  return { requestNotifyPermission, permitted: permRef.current === 'granted' }
}
