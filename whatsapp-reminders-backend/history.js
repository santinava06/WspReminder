const logger = require('./logger')
const { getDatabase } = require('./db')

const MAX_ENTRIES = 1000
const HISTORY_TTL_DAYS = Number(process.env.HISTORY_TTL_DAYS) || 90
const AUTO_CLEAN_INTERVAL_MS = 24 * 60 * 60 * 1000

function rowToEntry(r) {
  return {
    id: r.id,
    createdAt: r.created_at,
    username: r.username,
    sessionId: r.session_id,
    message: r.message,
    total: r.total,
    sent: r.sent,
    failed: r.failed,
    hasMedia: !!r.has_media,
    mode: r.mode,
    results: JSON.parse(r.results || '[]'),
  }
}

function logSend(sessionId, username, { message, results, hasMedia, mode }) {
  const db = getDatabase()
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    username,
    sessionId,
    message: (message || '').slice(0, 500),
    total: results.length,
    sent: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    hasMedia: !!hasMedia,
    mode: mode || 'single',
    results: results.map(r => ({ id: r.id, name: r.name, ok: r.ok, error: r.error || null })),
  }
  db.prepare(`INSERT INTO history (id, created_at, username, session_id, message, total, sent, failed, has_media, mode, results) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    entry.id, entry.createdAt, entry.username, entry.sessionId, entry.message, entry.total, entry.sent, entry.failed, entry.hasMedia ? 1 : 0, entry.mode, JSON.stringify(entry.results)
  )
  const count = db.prepare('SELECT COUNT(*) as cnt FROM history WHERE session_id = ?').get(entry.sessionId).cnt
  if (count > MAX_ENTRIES) {
    db.prepare(`DELETE FROM history WHERE session_id = ? AND id NOT IN (SELECT id FROM history WHERE session_id = ? ORDER BY created_at DESC LIMIT ?)`).run(entry.sessionId, entry.sessionId, MAX_ENTRIES)
  }
  return entry
}

function getHistory(sessionId) {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM history WHERE session_id = ? ORDER BY created_at DESC LIMIT ?').all(sessionId, MAX_ENTRIES)
  return rows.map(rowToEntry)
}

function getAllHistory() {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM history ORDER BY created_at DESC LIMIT ?').all(MAX_ENTRIES)
  return rows.map(rowToEntry)
}

function getHistoryByUsername(username) {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM history WHERE username = ? ORDER BY created_at DESC LIMIT ?').all(username, MAX_ENTRIES)
  return rows.map(rowToEntry)
}

function findHistoryById(historyId) {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM history WHERE id = ?').get(historyId)
  return row ? rowToEntry(row) : null
}

function getAllStats() {
  const db = getDatabase()
  const stats = db.prepare(`SELECT COUNT(*) as totalSends, COALESCE(SUM(sent), 0) as totalSent, COALESCE(SUM(failed), 0) as totalFailed FROM history`).get()
  const userRows = db.prepare(`SELECT username, COUNT(*) as totalSends, COALESCE(SUM(sent), 0) as totalSent, COALESCE(SUM(failed), 0) as totalFailed, MAX(created_at) as lastSend FROM history GROUP BY username`).all()
  const totalSends = stats.totalSends || 0
  const totalSent = stats.totalSent || 0
  const totalFailed = stats.totalFailed || 0
  return {
    totalSends,
    totalSent,
    totalFailed,
    successRate: totalSends > 0 ? ((totalSent / (totalSent + totalFailed)) * 100).toFixed(1) : '0',
    users: userRows.map(r => ({
      username: r.username,
      totalSends: r.totalSends,
      totalSent: r.totalSent,
      totalFailed: r.totalFailed,
      lastSend: r.lastSend || null,
    })),
  }
}

function cleanOldHistory() {
  const db = getDatabase()
  const cutoff = new Date(Date.now() - HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const result = db.prepare('DELETE FROM history WHERE created_at < ?').run(cutoff)
  if (result.changes > 0) logger.info({ purged: result.changes }, 'Old history entries cleaned')
}

let _cleanTimer = null
function startAutoClean() {
  if (_cleanTimer) return
  _cleanTimer = setInterval(cleanOldHistory, AUTO_CLEAN_INTERVAL_MS)
  setTimeout(cleanOldHistory, 60_000)
}

function stopAutoClean() {
  if (_cleanTimer) { clearInterval(_cleanTimer); _cleanTimer = null }
}

startAutoClean()

module.exports = { logSend, getHistory, getAllHistory, getHistoryByUsername, findHistoryById, getAllStats, cleanOldHistory, stopAutoClean }
