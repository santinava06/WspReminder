const express = require('express')
const cors = require('cors')
const { join } = require('path')
const { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync } = require('fs')
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const logger = require('./logger')
const { formatUptime } = require('./shared/utils')

const PORT = Number(process.env.BRIDGE_PORT) || 3178
const AUTH_DIR = process.env.BRIDGE_AUTH_DIR || join(__dirname, 'bridge-auth')
const HEALTH_CHECK_INTERVAL_MS = 45_000
const MAX_RECONNECT_DELAY_MS = 60_000
const INITIAL_RECONNECT_DELAY_MS = 1_000
const KEEPALIVE_INTERVAL_MS = 30_000
const GROUPS_CACHE_FILE = join(AUTH_DIR, 'groups-cache.json')

if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true })

const app = express()
app.use(cors())
app.use(express.json({ limit: '20mb' }))

let client = null
let isClientReady = false
let lastQr = null
let lastQrDataUrl = null
let sessionStatus = 'starting'
let lastSessionMessage = 'Iniciando...'
let connectedAt = null
let disconnectedAt = null
let reconnectAttempts = 0
let healthInterval = null
let cachedGroups = []
let cachedGroupsAt = null

function loadCachedGroups() {
  try {
    if (!existsSync(GROUPS_CACHE_FILE)) { cachedGroups = []; return }
    cachedGroups = JSON.parse(readFileSync(GROUPS_CACHE_FILE, 'utf8'))
  } catch { cachedGroups = [] }
}

function saveCachedGroups() {
  try {
    writeFileSync(GROUPS_CACHE_FILE, JSON.stringify(cachedGroups), 'utf8')
  } catch (err) {
    logger.warn({ err: err.message }, 'Error saving cached groups')
  }
}

function getReconnectDelay() {
  const delay = Math.min(INITIAL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY_MS)
  return delay + Math.random() * 1000
}

function startHealthCheck() {
  stopHealthCheck()
  healthInterval = setInterval(() => {
    try {
      if (client && client.ws && client.ws.readyState !== 1 && isClientReady) {
        logger.warn('Health check: socket not open, reconnecting...')
        isClientReady = false
        reconnectAttempts += 1
        startSocket()
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Health check error')
    }
  }, HEALTH_CHECK_INTERVAL_MS)
}

function stopHealthCheck() {
  if (healthInterval) { clearInterval(healthInterval); healthInterval = null }
}

function makeQRCode(qr) {
  try {
    require('qrcode').toDataURL(qr, { margin: 1, width: 280 }).then(url => { lastQrDataUrl = url }).catch(() => { lastQrDataUrl = null })
  } catch { lastQrDataUrl = null }
  try {
    require('qrcode-terminal').generate(qr, { small: true })
  } catch (err) {
    logger.warn({ err: err.message }, 'Error generating QR in terminal')
  }
}

async function startSocket() {
  const authPath = join(AUTH_DIR, 'auth-info')

  let state, saveCreds
  try {
    const r = await useMultiFileAuthState(authPath)
    state = r.state
    saveCreds = r.saveCreds
  } catch (err) {
    logger.error({ err: err.message }, 'Error loading auth state')
    sessionStatus = 'disconnected'
    lastSessionMessage = 'Error al cargar credenciales: ' + err.message
    return
  }

  logger.info({ attempt: reconnectAttempts + 1 }, 'Starting Baileys socket')
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ['WspReminder-Bridge', '1.0', ''],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: false,
    keepAliveIntervalMs: KEEPALIVE_INTERVAL_MS,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    try {
      const { connection, lastDisconnect, qr } = update
      logger.debug({ connection, hasQr: !!qr, lastError: lastDisconnect?.error?.message }, 'connection.update')

      if (qr) {
        isClientReady = false
        lastQr = qr
        sessionStatus = 'qr'
        lastSessionMessage = 'Escanea el QR para iniciar sesion'
        makeQRCode(qr)
      }

      if (connection === 'open') {
        isClientReady = true
        lastQr = null
        lastQrDataUrl = null
        sessionStatus = 'ready'
        lastSessionMessage = 'WhatsApp conectado correctamente'
        connectedAt = new Date().toISOString()
        disconnectedAt = null
        reconnectAttempts = 0
        startHealthCheck()
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        isClientReady = false
        lastQr = null
        lastQrDataUrl = null
        disconnectedAt = new Date().toISOString()
        stopHealthCheck()

        if (statusCode === DisconnectReason.loggedOut) {
          sessionStatus = 'logged_out'
          lastSessionMessage = 'Sesion cerrada. Escanea el QR nuevamente.'
          reconnectAttempts = 0
        } else {
          sessionStatus = 'disconnected'
          lastSessionMessage = lastDisconnect?.error?.message || 'Desconectado'
          reconnectAttempts += 1
        }

        if (shouldReconnect) {
          const delay = getReconnectDelay()
          logger.info({ delay: Math.round(delay), attempt: reconnectAttempts }, 'Reconnecting')
          setTimeout(startSocket, delay)
        }
      }
    } catch (err) {
      logger.error({ err: err.message }, 'Error en connection.update')
    }
  })

  sock.ev.on('messages.upsert', () => {}) // consume events to avoid warnings

  client = sock
}

// API endpoints
app.get('/status', (req, res) => {
  const user = client?.user
  res.json({
    ready: isClientReady,
    status: sessionStatus,
    message: lastSessionMessage,
    info: user ? { pushname: user.name || user.pushname || '', wid: { user: user.id ? user.id.split(':')[0].split('@')[0] : '' } } : null,
    qr: lastQrDataUrl ? { available: true, dataUrl: lastQrDataUrl } : { available: false, dataUrl: null },
    connection: {
      connectedAt,
      disconnectedAt,
      uptime: formatUptime(connectedAt),
      reconnectAttempts,
      healthCheckRunning: Boolean(healthInterval),
    },
  })
})

app.get('/qr', (req, res) => {
  if (!lastQr) return res.status(404).json({ ok: false, error: 'No hay QR disponible' })
  res.json({ ok: true, qr: lastQr, dataUrl: lastQrDataUrl })
})

app.post('/pair', async (req, res) => {
  try {
    const { phone } = req.body
    const normalizedPhone = String(phone || '').replace(/\D/g, '')
    if (!normalizedPhone.match(/^\d{7,15}$/)) {
      return res.status(400).json({ ok: false, error: 'Numero invalido. Ingresa solo digitos (ej: 541161234567)' })
    }
    if (isClientReady || client?.user) {
      return res.status(400).json({ ok: false, error: 'WhatsApp ya esta conectado para esta sesion' })
    }
    if (!client || typeof client.requestPairingCode !== 'function') {
      return res.status(503).json({ ok: false, error: 'Bridge no esta en estado de vinculacion' })
    }
    sessionStatus = 'pairing'
    lastSessionMessage = 'Codigo de vinculacion solicitado. Ingresa el codigo en WhatsApp.'
    const code = await client.requestPairingCode(normalizedPhone)
    const formattedCode = typeof code === 'string' ? code.match(/.{1,4}/g)?.join('-') || code : String(code)
    res.json({ ok: true, code: formattedCode })
  } catch (err) {
    logger.error({ err: err.message }, 'Error requesting pairing code')
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.post('/send', async (req, res) => {
  try {
    if (!isClientReady || !client) {
      return res.status(503).json({ ok: false, error: 'WhatsApp no conectado' })
    }
    const { groupId, message, media } = req.body
    if (!groupId) return res.status(400).json({ ok: false, error: 'Falta groupId' })
    if (!message && !media) return res.status(400).json({ ok: false, error: 'Falta message o media' })

    const msg = { text: message || '' }
    if (media) {
      const raw = media.data.includes(',') ? media.data.split(',')[1] : media.data
      const buffer = Buffer.from(raw, 'base64')
      const mime = (media.mimetype || '').toLowerCase()
      if (mime.startsWith('image/')) {
        msg.image = buffer
        if (message) msg.caption = message
        delete msg.text
      } else if (mime.startsWith('video/')) {
        msg.video = buffer
        if (message) msg.caption = message
        delete msg.text
      } else if (mime.startsWith('audio/')) {
        msg.audio = buffer
        msg.ptt = mime.includes('ogg')
        delete msg.text
      } else {
        msg.document = buffer
        msg.mimetype = mime || 'application/octet-stream'
        msg.fileName = media.filename || 'file'
        if (message) msg.caption = message
        delete msg.text
      }
    }

    await client.sendMessage(groupId, msg)
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err: err.message }, 'Error sending message')
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.post('/send-bulk', async (req, res) => {
  try {
    if (!isClientReady || !client) {
      return res.status(503).json({ ok: false, error: 'WhatsApp no conectado' })
    }
    const { groups, message, media } = req.body
    if (!Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({ ok: false, error: 'Faltan groups' })
    }
    if (!message && !media) {
      return res.status(400).json({ ok: false, error: 'Falta message o media' })
    }

    const results = []
    for (const group of groups) {
      try {
        const msg = { text: message || '' }
        if (media) {
          const raw = media.data.includes(',') ? media.data.split(',')[1] : media.data
          const buffer = Buffer.from(raw, 'base64')
          const mime = (media.mimetype || '').toLowerCase()
          if (mime.startsWith('image/')) { msg.image = buffer; if (message) msg.caption = message; delete msg.text }
          else if (mime.startsWith('video/')) { msg.video = buffer; if (message) msg.caption = message; delete msg.text }
          else if (mime.startsWith('audio/')) { msg.audio = buffer; msg.ptt = mime.includes('ogg'); delete msg.text }
          else { msg.document = buffer; msg.mimetype = mime || 'application/octet-stream'; msg.fileName = media.filename || 'file'; if (message) msg.caption = message; delete msg.text }
        }
        await client.sendMessage(group.id, msg)
        results.push({ id: group.id, name: group.name, ok: true })
      } catch (err) {
        results.push({ id: group.id, name: group.name, ok: false, error: err.message })
      }
    }
    res.json({ ok: true, results })
  } catch (err) {
    logger.error({ err: err.message }, 'Error sending bulk')
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/groups', async (req, res) => {
  try {
    if (!isClientReady || !client) {
      return res.status(503).json({ ok: false, error: 'WhatsApp no conectado' })
    }
    let groups = []
    if (cachedGroups.length > 0) {
      groups = cachedGroups
      // refresh in background
      client.groupFetchAllParticipating().then(map => {
        const refreshed = Object.entries(map).map(([id, meta]) => ({ id, name: meta.subject || '(sin nombre)' }))
        cachedGroups = refreshed
        cachedGroupsAt = new Date().toISOString()
        saveCachedGroups()
      }).catch(() => {})
    } else {
      const map = await client.groupFetchAllParticipating()
      groups = Object.entries(map).map(([id, meta]) => ({ id, name: meta.subject || '(sin nombre)' }))
      cachedGroups = groups
      cachedGroupsAt = new Date().toISOString()
      saveCachedGroups()
    }
    res.json({ ok: true, groups, cachedAt: cachedGroupsAt })
  } catch (err) {
    logger.error({ err: err.message }, 'Error fetching groups')
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.post('/disconnect', async (req, res) => {
  try {
    if (!isClientReady && !client) {
      return res.status(400).json({ ok: false, error: 'No hay sesion activa' })
    }
    isClientReady = false
    lastQr = null
    lastQrDataUrl = null
    cachedGroups = []
    sessionStatus = 'starting'
    lastSessionMessage = 'Desconectado. Generando nuevo QR...'
    stopHealthCheck()

    try { if (client) await client.logout() } catch (err) { logger.warn({ err: err.message }, 'Error during logout') }
    try { if (client && typeof client.end === 'function') client.end() } catch (err) { logger.warn({ err: err.message }, 'Error during client end') }

    const authPath = join(AUTH_DIR, 'auth-info')
    try { if (existsSync(authPath)) rmSync(authPath, { recursive: true, force: true }) } catch (err) { logger.warn({ err: err.message }, 'Error clearing auth dir') }

    res.json({ ok: true, message: 'Sesion desconectada' })
    setTimeout(startSocket, 1000)
  } catch (err) {
    logger.error({ err: err.message }, 'Error disconnecting')
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Global error handler
app.use((err, req, res, next) => {
  logger.error({ err: err.message }, 'Express error')
  res.status(500).json({ ok: false, error: 'Error interno del bridge' })
})

loadCachedGroups()
startSocket()

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'Bridge server running')
})

// Graceful shutdown
async function handleShutdown(signal) {
  if (global._bridgeShuttingDown) return
  global._bridgeShuttingDown = true
  logger.info({ signal }, 'Bridge shutting down gracefully')
  server.close(() => logger.info('Bridge HTTP server closed'))
  stopHealthCheck()
  if (client && typeof client.logout === 'function') {
    try { await client.logout() } catch (err) { logger.warn({ err: err.message }, 'Bridge logout error') }
  }
  if (client && typeof client.end === 'function') {
    try { client.end() } catch (err) { logger.warn({ err: err.message }, 'Bridge end error') }
  }
  logger.info('Bridge shutdown complete')
  setTimeout(() => process.exit(0), 1000)
}
for (const sig of ['SIGTERM', 'SIGINT', 'SIGUSR2']) {
  if (process.listenerCount(sig) === 0) {
    process.once(sig, () => handleShutdown(sig))
  }
}
