const logger = require('./logger')
const { getDatabase } = require('./db')
const { buildBaileysMessage } = require('./shared/baileys')

const MAX_RETRY_COUNT = 3
const RETRY_DELAY_MS = 30_000

function rowToMessage(r) {
  const msg = {
    id: r.id,
    groups: JSON.parse(r.groups || '[]'),
    message: r.message,
    title: r.title || '',
    scheduledAt: r.scheduled_at,
    status: r.status,
    lastError: r.last_error,
    results: JSON.parse(r.results || '[]'),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    username: r.username || null,
  }
  if (r.media) {
    try { msg.media = JSON.parse(r.media) } catch { msg.media = null }
  }
  return msg
}

class Scheduler {
  constructor({ dataDir, sessionId, onSendScheduled } = {}) {
    this.sessionId = sessionId || 'unknown'
    this.messages = []
    this.checkInterval = null
    this.sendingIds = new Set()
    this.onSendScheduled = onSendScheduled || null
    this.load()
  }

  load() {
    try {
      const db = getDatabase()
      const rows = db.prepare('SELECT * FROM scheduled_messages ORDER BY created_at ASC').all()
      this.messages = rows.map(rowToMessage)
      let changed = false
      for (const msg of this.messages) {
        if (msg.status === 'sending') {
          msg.status = 'pending'
          msg.lastError = 'El servidor se reinicio. El mensaje sera reintentado.'
          msg.updatedAt = new Date().toISOString()
          changed = true
          logger.warn({ msgId: msg.id, sessionId: this.sessionId }, 'Mensaje en estado sending recuperado como pending')
        }
      }
      if (changed) this._syncAllToDb()
    } catch (err) {
      logger.error({ err: err.message }, 'Error loading scheduled messages from SQLite')
      this.messages = []
    }
  }

  _syncAllToDb() {
    try {
      const db = getDatabase()
      const sid = this.sessionId
      const replace = db.prepare(`INSERT OR REPLACE INTO scheduled_messages (id, session_id, groups, message, title, scheduled_at, status, last_error, results, created_at, updated_at, username, media) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      const tx = db.transaction((msgs) => {
        db.prepare('DELETE FROM scheduled_messages').run()
        for (const m of msgs) {
          replace.run(m.id, sid, JSON.stringify(m.groups || []), m.message || '', m.title || '', m.scheduledAt, m.status || 'pending', m.lastError || null, JSON.stringify(m.results || []), m.createdAt, m.updatedAt, m.username || null, m.media ? JSON.stringify(m.media) : null)
        }
      })
      tx(this.messages)
    } catch (err) {
      logger.error({ err: err.message }, 'Error syncing scheduled messages to SQLite')
    }
  }

  _upsert(msg) {
    try {
      const db = getDatabase()
      db.prepare(`INSERT OR REPLACE INTO scheduled_messages (id, session_id, groups, message, title, scheduled_at, status, last_error, results, created_at, updated_at, username, media) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        msg.id, this.sessionId, JSON.stringify(msg.groups || []), msg.message || '', msg.title || '', msg.scheduledAt, msg.status || 'pending', msg.lastError || null, JSON.stringify(msg.results || []), msg.createdAt, msg.updatedAt, msg.username || null, msg.media ? JSON.stringify(msg.media) : null
      )
    } catch (err) {
      logger.error({ err: err.message, msgId: msg.id }, 'Error upserting scheduled message')
    }
  }

  _delete(id) {
    try {
      const db = getDatabase()
      db.prepare('DELETE FROM scheduled_messages WHERE id = ?').run(id)
    } catch (err) {
      logger.error({ err: err.message, msgId: id }, 'Error deleting scheduled message')
    }
  }

  getMissed() {
    const now = new Date().toISOString()
    return this.messages.filter(m => ['pending', 'waiting_connection'].includes(m.status) && m.scheduledAt <= now)
  }

  getAll() { return this.messages }

  getById(id) { return this.messages.find(m => m.id === id) || null }

  create({ groups, message, scheduledAt, media, username, title }) {
    const msg = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      sessionId: this.sessionId,
      groups,
      message,
      title: title || '',
      scheduledAt: new Date(scheduledAt).toISOString(),
      status: 'pending',
      lastError: null,
      results: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      username: username || null,
    }
    if (media) {
      msg.media = { mimetype: media.mimetype, data: media.data, filename: media.filename, filesize: media.filesize }
    }
    this.messages.push(msg)
    this._upsert(msg)
    return msg
  }

  cancel(id) {
    const msg = this.messages.find(m => m.id === id)
    if (!msg || msg.status === 'sent' || msg.status === 'cancelled') return null
    msg.status = 'cancelled'
    msg.updatedAt = new Date().toISOString()
    this._upsert(msg)
    return msg
  }

  remove(id) {
    const idx = this.messages.findIndex(m => m.id === id)
    if (idx === -1) return false
    this.messages.splice(idx, 1)
    this._delete(id)
    return true
  }

  update(msg) {
    const idx = this.messages.findIndex(m => m.id === msg.id)
    if (idx === -1) return false
    this.messages[idx] = msg
    this._upsert(msg)
    return true
  }

  getPending() {
    const now = new Date().toISOString()
    return this.messages.filter(m => ['pending', 'waiting_connection'].includes(m.status) && m.scheduledAt <= now)
  }

  isClientReady(client) {
    return Boolean(client?.user || client?.ws?.readyState === 1)
  }

  markWaitingForConnection(msg) {
    if (msg.status === 'waiting_connection') return
    msg.status = 'waiting_connection'
    msg.lastError = 'WhatsApp no esta conectado. El envio se reintentara automaticamente.'
    msg.updatedAt = new Date().toISOString()
    this.update(msg)
  }

  async sendScheduledMessage(client, msg) {
    if (this.sendingIds.has(msg.id)) return
    this.sendingIds.add(msg.id)
    try {
      msg.status = 'sending'
      msg.lastError = null
      msg.updatedAt = new Date().toISOString()
      this.update(msg)
      for (const group of msg.groups) {
        let lastError = null
        let success = false
        for (let attempt = 0; attempt < MAX_RETRY_COUNT; attempt++) {
          try {
            const baileysMsg = buildBaileysMessage({ message: msg.message, media: msg.media })
            await client.sendMessage(group.id, baileysMsg)
            msg.results.push({ groupId: group.id, groupName: group.name, ok: true })
            success = true
            break
          } catch (err) {
            lastError = err
            if (attempt < MAX_RETRY_COUNT - 1) {
              logger.warn({ msgId: msg.id, groupId: group.id, attempt: attempt + 1, err: err.message }, 'Reintentando envio')
              await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
            }
          }
        }
        if (!success) {
          msg.results.push({ groupId: group.id, groupName: group.name, ok: false, error: lastError.message })
        }
      }
      const failed = msg.results.filter(r => !r.ok)
      msg.status = failed.length === 0 ? 'sent' : failed.length === msg.groups.length ? 'failed' : 'sent'
      msg.lastError = failed.length > 0 ? `${failed.length} grupos fallaron al enviar.` : null
      msg.updatedAt = new Date().toISOString()
      this.update(msg)
      if (typeof this.onSendScheduled === 'function') {
        try { this.onSendScheduled(msg) } catch (err) {
          logger.error({ err: err.message }, 'Error in onSendScheduled callback')
        }
      }
    } finally {
      this.sendingIds.delete(msg.id)
    }
  }

  startChecker(client) {
    this._client = client
    if (this.checkInterval) return
    this.load()
    const missed = this.getMissed()
    if (missed.length > 0) logger.info({ count: missed.length }, 'Mensajes pendientes detectados al iniciar')
    this.checkInterval = setInterval(async () => {
      try {
        const pending = this.getPending()
        if (pending.length === 0) return
        if (!this.isClientReady(this._client)) {
          pending.forEach(msg => this.markWaitingForConnection(msg))
          return
        }
        for (const msg of pending) {
          await this.sendScheduledMessage(this._client, msg)
        }
      } catch (err) {
        logger.error({ err: err?.message }, 'Error en ciclo de verificacion')
      }
    }, 10_000)
  }

  async sendNow(client, id) {
    const msg = this.messages.find(m => m.id === id)
    if (!msg || msg.status === 'sent' || msg.status === 'cancelled' || msg.status === 'sending') return null
    msg.scheduledAt = new Date().toISOString()
    await this.sendScheduledMessage(client, msg)
    return msg
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
      this.sendingIds = new Set()
    }
  }
}

module.exports = { createScheduler: (options) => new Scheduler(options), Scheduler }
