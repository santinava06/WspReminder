const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs')
const { join } = require('path')

const MAX_ENTRIES = 1000

function getHistoryFile(sessionId) {
  return join(process.cwd(), '.data', 'sessions', sessionId, 'send-history.json')
}

function ensureDir(filePath) {
  const dir = require('path').dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function loadHistory(sessionId) {
  const file = getHistoryFile(sessionId)
  try {
    if (!existsSync(file)) return []
    const raw = readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveHistory(sessionId, entries) {
  const file = getHistoryFile(sessionId)
  ensureDir(file)
  writeFileSync(file, JSON.stringify(entries, null, 2), 'utf8')
}

function logSend(sessionId, username, { message, results, hasMedia, mode }) {
  const history = loadHistory(sessionId)
  const sent = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  history.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    username,
    sessionId,
    message: (message || '').slice(0, 500),
    total: results.length,
    sent,
    failed,
    hasMedia: !!hasMedia,
    mode: mode || 'single',
    results: results.map(r => ({ id: r.id, name: r.name, ok: r.ok, error: r.error || null })),
  })

  if (history.length > MAX_ENTRIES) {
    history.length = MAX_ENTRIES
  }

  saveHistory(sessionId, history)
  return history[0]
}

function getHistory(sessionId) {
  return loadHistory(sessionId)
}

function getAllHistory() {
  const { listSessions } = require('./sessionManager')
  const all = []
  for (const session of listSessions()) {
    const entries = loadHistory(session.id)
    all.push(...entries)
  }
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  return all.slice(0, MAX_ENTRIES)
}

function getHistoryByUsername(username) {
  const { listSessions } = require('./sessionManager')
  const all = []
  for (const session of listSessions()) {
    const entries = loadHistory(session.id).filter(e => e.username === username)
    all.push(...entries)
  }
  all.sort((a, b) => new Date(b.createdAt) - a.createdAt)
  return all
}

function getAllStats() {
  const history = getAllHistory()
  const totalSends = history.length
  const totalSent = history.reduce((sum, e) => sum + e.sent, 0)
  const totalFailed = history.reduce((sum, e) => sum + e.failed, 0)
  const users = [...new Set(history.map(e => e.username))]
  const userStats = users.map(username => {
    const userEntries = history.filter(e => e.username === username)
    return {
      username,
      totalSends: userEntries.length,
      totalSent: userEntries.reduce((s, e) => s + e.sent, 0),
      totalFailed: userEntries.reduce((s, e) => s + e.failed, 0),
      lastSend: userEntries[0]?.createdAt || null,
    }
  })

  return {
    totalSends,
    totalSent,
    totalFailed,
    successRate: totalSends > 0 ? ((totalSent / (totalSent + totalFailed)) * 100).toFixed(1) : '0',
    users: userStats,
  }
}

module.exports = { logSend, getHistory, getAllHistory, getHistoryByUsername, getAllStats }
