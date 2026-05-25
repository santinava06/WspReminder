const { join } = require('path')
const { homedir } = require('os')
const { existsSync, mkdirSync } = require('fs')
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const { createScheduler } = require('./scheduler')

const DEFAULT_BASE_DATA_DIR = process.env.WHATSAPP_REMINDERS_DATA_DIR || (() => {
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || process.env.LOCALAPPDATA || homedir(), 'WhatsApp Reminders')
  }
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'whatsapp-reminders')
})()
const DEFAULT_SESSION_ID = 'default'

const sessions = new Map()

function getSessionDataDir(sessionId) {
  const sessionDir = join(DEFAULT_BASE_DATA_DIR, 'sessions', sessionId)
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true })
  }
  return sessionDir
}

function isSessionRunning(session) {
  return Boolean(session.client && session.isClientReady)
}

function sessionSummary(session) {
  return {
    id: session.id,
    status: session.sessionStatus,
    ready: isSessionRunning(session),
    message: session.lastSessionMessage,
    qrAvailable: Boolean(session.lastQrDataUrl),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

function createSession(sessionId = DEFAULT_SESSION_ID, { onSendScheduled } = {}) {
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId)
  }

  const sessionDataDir = getSessionDataDir(sessionId)
  const scheduler = createScheduler({ dataDir: sessionDataDir, onSendScheduled })

  const session = {
    id: sessionId,
    dataDir: sessionDataDir,
    client: null,
    scheduler,
    isClientReady: false,
    lastQr: null,
    lastQrDataUrl: null,
    sessionStatus: 'starting',
    lastSessionMessage: 'Iniciando...',
    cachedGroups: [],
    cachedGroupsAt: null,
    groupsRefreshPromise: null,
    manuallyDisconnected: false,
    groupsSyncTimeoutMs: undefined,
    groupsCachePersistence: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  function updateTimestamps() {
    session.updatedAt = new Date().toISOString()
  }

  function makeQRCode(qr) {
    try {
      require('qrcode').toDataURL(qr, { margin: 1, width: 280 }).then(url => {
        session.lastQrDataUrl = url
      }).catch(() => {
        session.lastQrDataUrl = null
      })
    } catch {
      session.lastQrDataUrl = null
    }
    try {
      require('qrcode-terminal').generate(qr, { small: true })
    } catch {}
  }

  async function startSocket() {
    const authPath = join(sessionDataDir, 'auth')

    let state, saveCreds
    try {
      const r = await useMultiFileAuthState(authPath)
      state = r.state
      saveCreds = r.saveCreds
    } catch (err) {
      console.error(`[${session.id}] Error loading auth state:`, err.message)
      session.sessionStatus = 'disconnected'
      session.lastSessionMessage = 'Error al cargar credenciales: ' + err.message
      return
    }

    console.log(`[${session.id}] Starting Baileys socket...`)
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: ['WspReminder', '1.0', ''],
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
      updateTimestamps()
      const { connection, lastDisconnect, qr } = update

      console.log(`[${session.id}] connection.update:`, JSON.stringify({ connection, hasQr: !!qr, lastError: lastDisconnect?.error?.message }))

      if (qr) {
        session.manuallyDisconnected = false
        session.isClientReady = false
        session.lastQr = qr
        session.sessionStatus = 'qr'
        session.lastSessionMessage = 'Escanea el QR para iniciar sesion'
        makeQRCode(qr)
      }

      if (connection === 'open') {
        session.manuallyDisconnected = false
        session.isClientReady = true
        session.lastQr = null
        session.lastQrDataUrl = null
        session.sessionStatus = 'ready'
        session.lastSessionMessage = 'WhatsApp conectado correctamente'
        session.scheduler.startChecker(sock)
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        session.isClientReady = false
        session.lastQr = null
        session.lastQrDataUrl = null

        console.log(`[${session.id}] Connection closed. statusCode: ${statusCode}, shouldReconnect: ${shouldReconnect}, reason: ${lastDisconnect?.error?.message}`)

        if (statusCode === DisconnectReason.loggedOut) {
          session.sessionStatus = 'logged_out'
          session.lastSessionMessage = 'Sesion cerrada. Escanea el QR nuevamente.'
        } else {
          session.sessionStatus = 'disconnected'
          session.lastSessionMessage = lastDisconnect?.error?.message || 'Desconectado'
        }

        if (shouldReconnect && !session.manuallyDisconnected) {
          setTimeout(startSocket, 5000)
        }
      }
    })

    session.client = sock
  }

  session.reinitializeClient = async ({ resetAttempts } = {}) => {
    if (session.manuallyDisconnected) return
    await startSocket()
  }

  session.reinitializeClient()

  sessions.set(sessionId, session)
  return session
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null
}

async function destroySession(sessionId) {
  const session = getSession(sessionId)
  if (!session) return false

  session.manuallyDisconnected = true
  session.sessionStatus = 'disconnected'
  session.lastSessionMessage = 'Sesion detenida'
  session.scheduler.stop()

  if (session.client && typeof session.client.logout === 'function') {
    try { await session.client.logout() } catch {}
  }

  if (session.client && typeof session.client.end === 'function') {
    try { session.client.end() } catch {}
  }

  sessions.delete(sessionId)
  return true
}

function normalizeSessionId(id) {
  if (!id || typeof id !== 'string') return null
  const normalized = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
  return normalized.length > 0 ? normalized : null
}

module.exports = {
  DEFAULT_SESSION_ID,
  createSession,
  getSession,
  hasSession: (id) => sessions.has(id),
  listSessions: () => [...sessions.values()].map(sessionSummary),
  sessionSummary,
  destroySession,
  normalizeSessionId,
}
