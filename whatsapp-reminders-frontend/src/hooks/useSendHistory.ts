import { useCallback, useState } from 'react'
import type { Group } from '../components/GroupList'

export type SendProgressResult = Group & {
  ok: boolean
  error?: string
}

export type SendHistoryItem = {
  id: string
  createdAt: string
  mode: 'single' | 'selected' | 'all'
  message: string
  total: number
  sent: number
  failed: number
  cancelled: boolean
  results: SendProgressResult[]
}

const HISTORY_STORAGE_KEY = 'whatsapp-reminders-send-history'

function loadSendHistory() {
  try {
    const rawHistory = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!rawHistory) return []

    const parsedHistory = JSON.parse(rawHistory)
    return Array.isArray(parsedHistory) ? parsedHistory as SendHistoryItem[] : []
  } catch {
    return []
  }
}

function persistSendHistory(nextHistory: SendHistoryItem[]) {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextHistory.slice(0, 30)))
}

export default function useSendHistory() {
  const [sendHistory, setSendHistory] = useState<SendHistoryItem[]>(() => loadSendHistory())
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null)

  const addSendHistoryItem = useCallback((historyItem: SendHistoryItem) => {
    setSendHistory((currentHistory) => {
      const nextHistory = [historyItem, ...currentHistory].slice(0, 30)
      persistSendHistory(nextHistory)
      return nextHistory
    })
  }, [])

  const clearSendHistory = useCallback(() => {
    setSendHistory([])
    setOpenHistoryId(null)
    localStorage.removeItem(HISTORY_STORAGE_KEY)
  }, [])

  return {
    sendHistory,
    openHistoryId,
    setOpenHistoryId,
    addSendHistoryItem,
    clearSendHistory,
  }
}
