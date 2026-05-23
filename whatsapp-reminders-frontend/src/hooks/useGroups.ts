import { useCallback, useState } from 'react'
import type { Group } from '../components/GroupList'

const GROUPS_CACHE_STORAGE_KEY = 'whatsapp-reminders-groups-cache'

function loadCachedGroups() {
  try {
    const rawGroups = localStorage.getItem(GROUPS_CACHE_STORAGE_KEY)
    if (!rawGroups) return []

    const parsedGroups = JSON.parse(rawGroups)
    return Array.isArray(parsedGroups) ? parsedGroups as Group[] : []
  } catch {
    return []
  }
}

export default function useGroups() {
  const [groups, setGroupsState] = useState<Group[]>(() => loadCachedGroups())

  const setGroups = useCallback((nextGroups: Group[]) => {
    setGroupsState(nextGroups)
    localStorage.setItem(GROUPS_CACHE_STORAGE_KEY, JSON.stringify(nextGroups))
  }, [])

  const clearGroups = useCallback(() => {
    setGroupsState([])
    localStorage.removeItem(GROUPS_CACHE_STORAGE_KEY)
  }, [])

  return {
    groups,
    setGroups,
    clearGroups,
  }
}
