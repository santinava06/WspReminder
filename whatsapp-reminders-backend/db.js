const initSqlJs = require('sql.js')
const path = require('path')
const fs = require('fs')
const os = require('os')
const logger = require('./logger')

let db = null
let SQL = null

async function getSqlJs() {
  if (!SQL) SQL = await initSqlJs()
  return SQL
}

function getBaseDir() {
  if (process.env.WHATSAPP_REMINDERS_DATA_DIR) return process.env.WHATSAPP_REMINDERS_DATA_DIR
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || process.env.LOCALAPPDATA || os.homedir(), 'WhatsApp Reminders')
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'whatsapp-reminders')
}

function getDbPath() {
  const dir = getBaseDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'data.db')
}

function save() {
  if (!db) return
  const data = db.export()
  fs.writeFileSync(getDbPath(), Buffer.from(data))
}

// Mimics better-sqlite3 prepared statement API
function prepare(sql) {
  return {
    run(...params) {
      if (params.length === 1 && Array.isArray(params[0])) params = params[0]
      db.run(sql, params)
      save()
      return { changes: db.getRowsModified() }
    },
    get(...params) {
      if (params.length === 1 && Array.isArray(params[0])) params = params[0]
      const stmt = db.prepare(sql)
      if (params.length > 0) stmt.bind(params)
      const row = stmt.step() ? stmt.getAsObject() : undefined
      stmt.free()
      return row
    },
    all(...params) {
      if (params.length === 1 && Array.isArray(params[0])) params = params[0]
      const stmt = db.prepare(sql)
      if (params.length > 0) stmt.bind(params)
      const rows = []
      while (stmt.step()) rows.push(stmt.getAsObject())
      stmt.free()
      return rows
    },
  }
}

function transaction(fn) {
  return function (...args) {
    db.run('BEGIN')
    try {
      fn(...args)
      db.run('COMMIT')
      save()
    } catch (err) {
      db.run('ROLLBACK')
      save()
      throw err
    }
  }
}

async function initDatabase() {
  if (db) return db
  const dbPath = getDbPath()
  logger.info({ dbPath }, 'Initializing SQLite database')
  const Sql = await getSqlJs()
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new Sql.Database(buffer)
  } else {
    db = new Sql.Database()
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      username TEXT NOT NULL,
      session_id TEXT NOT NULL,
      message TEXT,
      total INTEGER NOT NULL DEFAULT 0,
      sent INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      has_media INTEGER NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'single',
      results TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_history_session_id ON history(session_id);
    CREATE INDEX IF NOT EXISTS idx_history_username ON history(username);
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      groups TEXT NOT NULL DEFAULT '[]',
      message TEXT,
      title TEXT NOT NULL DEFAULT '',
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      last_error TEXT,
      results TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      username TEXT,
      media TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_session_id ON scheduled_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_messages(status);
    CREATE INDEX IF NOT EXISTS idx_scheduled_scheduled_at ON scheduled_messages(scheduled_at);
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
  save()
  return db
}

function getDatabase() {
  if (!db) throw new Error('Database not initialized')
  return { prepare, transaction, run: (sql, params) => { db.run(sql, params); save() } }
}

function closeDatabase() {
  if (db) {
    save()
    db.close()
    db = null
    SQL = null
  }
}

function migrateJsonToSqlite(sessionIds) {
  if (!db) return
  const row = prepare("SELECT name FROM _migrations WHERE name = 'import_json_data'").get()
  if (row) return

  const cwdData = path.join(process.cwd(), '.data', 'sessions')
  const baseDir = getBaseDir()
  const appDataSessions = path.join(baseDir, 'sessions')

  for (const sessionId of sessionIds) {
    const candidates = [
      path.join(cwdData, sessionId, 'send-history.json'),
      path.join(appDataSessions, sessionId, 'send-history.json'),
      path.join(cwdData, sessionId, 'scheduled-messages.json'),
      path.join(appDataSessions, sessionId, 'scheduled-messages.json'),
    ]
    candidates.forEach(p => {
      if (!fs.existsSync(p)) return
      try {
        if (p.endsWith('send-history.json')) {
          const entries = JSON.parse(fs.readFileSync(p, 'utf8'))
          if (!Array.isArray(entries) || entries.length === 0) return
          const ins = prepare('INSERT OR IGNORE INTO history (id, created_at, username, session_id, message, total, sent, failed, has_media, mode, results) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          const tx = transaction(items => { for (const e of items) ins.run(e.id, e.createdAt, e.username, e.sessionId || sessionId, e.message || '', e.total || 0, e.sent || 0, e.failed || 0, e.hasMedia ? 1 : 0, e.mode || 'single', JSON.stringify(e.results || [])) })
          tx(entries)
          logger.info({ sessionId, file: p, count: entries.length }, 'Imported history from JSON')
        } else if (p.endsWith('scheduled-messages.json')) {
          const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
          const messages = Array.isArray(raw) ? raw : (Array.isArray(raw?.messages) ? raw.messages : [])
          if (messages.length === 0) return
          const ins = prepare('INSERT OR IGNORE INTO scheduled_messages (id, session_id, groups, message, title, scheduled_at, status, last_error, results, created_at, updated_at, username, media) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          const tx = transaction(items => {
            for (const m of items) ins.run(m.id, sessionId, JSON.stringify(m.groups || []), m.message || '', m.title || '', m.scheduledAt, m.status || 'pending', m.lastError || null, JSON.stringify(m.results || []), m.createdAt, m.updatedAt, m.username || null, m.media ? JSON.stringify(m.media) : null)
          })
          tx(messages)
          logger.info({ sessionId, file: p, count: messages.length }, 'Imported scheduled messages from JSON')
        }
      } catch (err) {
        logger.warn({ sessionId, file: p, err: err.message }, 'Error importing JSON data')
      }
    })
  }
  prepare("INSERT INTO _migrations (name, applied_at) VALUES ('import_json_data', ?)").run(new Date().toISOString())
  logger.info('JSON to SQLite migration completed')
}

module.exports = { initDatabase, getDatabase, closeDatabase, migrateJsonToSqlite, getBaseDir }
