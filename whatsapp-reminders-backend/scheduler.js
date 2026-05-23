const { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } = require('fs')
const { join } = require('path')
const { MessageMedia } = require('whatsapp-web.js')

const LEGACY_DATA_FILE = join(process.cwd(), '.data', 'scheduled-messages.json')

function normalizeLoadedMessages(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed?.messages)) return parsed.messages
  return []
}

function ensureDirectory(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

class Scheduler {
  constructor({ dataDir } = {}) {
    this.dataDir = dataDir
    this.dataFile = join(this.dataDir, 'scheduled-messages.json')
    this.messages = []
    this.checkInterval = null
    this.sendingIds = new Set()

    this.load()
  }

  migrateLegacyDataFile() {
    try {
      if (existsSync(this.dataFile) || !existsSync(LEGACY_DATA_FILE)) return
      ensureDirectory(this.dataDir)
      copyFileSync(LEGACY_DATA_FILE, this.dataFile)
      console.log('Scheduled messages migrated to session data path:', this.dataFile)
    } catch (err) {
      console.error('Error migrating scheduled messages:', err.message)
    }
  }

  load() {
    try {
      this.migrateLegacyDataFile()
      ensureDirectory(this.dataDir)
      if (!existsSync(this.dataFile)) {
        this.messages = []
        this.save()
        return
      }
      const raw = readFileSync(this.dataFile, 'utf8')
      this.messages = normalizeLoadedMessages(JSON.parse(raw))
    } catch {
      this.messages = []
      this.save()
    }
  }

  save() {
    try {
      ensureDirectory(this.dataDir)
      writeFileSync(this.dataFile, JSON.stringify({ messages: this.messages }, null, 2), 'utf8')
    } catch (err) {
      console.error('Error saving scheduled messages:', err.message)
    }
  }

  getAll() {
    return this.messages
  }

  getById(id) {
    return this.messages.find(m => m.id === id) || null
  }

  create({ groups, message, scheduledAt, media }) {
    const msg = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      groups,
      message,
      scheduledAt: new Date(scheduledAt).toISOString(),
      status: 'pending',
      lastError: null,
      results: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    if (media) {
      msg.media = { mimetype: media.mimetype, data: media.data, filename: media.filename, filesize: media.filesize }
    }

    this.messages.push(msg)
    this.save()
    return msg
  }

  cancel(id) {
    const msg = this.messages.find(m => m.id === id)
    if (!msg || msg.status === 'sent' || msg.status === 'cancelled') return null
    msg.status = 'cancelled'
    msg.updatedAt = new Date().toISOString()
    this.save()
    return msg
  }

  remove(id) {
    const idx = this.messages.findIndex(m => m.id === id)
    if (idx === -1) return false
    this.messages.splice(idx, 1)
    this.save()
    return true
  }

  update(msg) {
    const idx = this.messages.findIndex(m => m.id === msg.id)
    if (idx === -1) return false
    this.messages[idx] = msg
    this.save()
    return true
  }

  getPending() {
    const now = new Date().toISOString()
    return this.messages.filter(m => ['pending', 'waiting_connection'].includes(m.status) && m.scheduledAt <= now)
  }

  async isClientReady(client) {
    if (client.info) return true

    try {
      const state = await Promise.race([
        client.getState(),
        new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
      ])

      return state === 'CONNECTED'
    } catch {
      return false
    }
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
        try {
          if (msg.media) {
            const mediaObj = new MessageMedia(msg.media.mimetype, msg.media.data, msg.media.filename)
            await client.sendMessage(group.id, msg.message, { media: mediaObj })
          } else {
            await client.sendMessage(group.id, msg.message)
          }
          msg.results.push({ groupId: group.id, groupName: group.name, ok: true })
        } catch (err) {
          msg.results.push({ groupId: group.id, groupName: group.name, ok: false, error: err.message })
        }
      }

      const failed = msg.results.filter(r => !r.ok)
      msg.status = failed.length === 0 ? 'sent' : failed.length === msg.groups.length ? 'failed' : 'sent'
      msg.lastError = failed.length > 0 ? `${failed.length} grupos fallaron al enviar.` : null
      msg.updatedAt = new Date().toISOString()
      this.update(msg)
    } finally {
      this.sendingIds.delete(msg.id)
    }
  }

  startChecker(client) {
    if (this.checkInterval) return

    this.load()

    this.checkInterval = setInterval(async () => {
      const pending = this.getPending()
      if (pending.length === 0) return

      if (!(await this.isClientReady(client))) {
        pending.forEach((msg) => this.markWaitingForConnection(msg))
        return
      }

      for (const msg of pending) {
        await this.sendScheduledMessage(client, msg)
      }
    }, 10_000)

    console.log(`Scheduler started for ${this.dataFile} (checking every 10s)`)    
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
      this.sendingIds = new Set()
      console.log('Scheduler stopped for', this.dataFile)
    }
  }
}

module.exports = { createScheduler: (options) => new Scheduler(options) }

