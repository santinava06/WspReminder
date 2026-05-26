const { join } = require('path')
const { homedir } = require('os')
const { existsSync, mkdirSync } = require('fs')
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const { createScheduler } = require('./scheduler')
const { createBridgeClient } = require('./bridgeClient')
const logger = require('./logger')
const auth = require('./auth')
const { formatUptime, fetchWithTimeout } = require('./shared/utils')

const DEFAULT_BASE_DATA_DIR = process.env.WHATSAPP_REMINDERS_DATA_DIR || (() => {
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || process.env.LOCALAPPDATA || homedir(), 'WhatsApp Reminders')
  }
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'whatsapp-reminders')
})()
const DEFAULT_SESSION_ID = 'default'
const HEALTH_CHECK_INTERVAL_MS = 45_000
const MAX_RECONNECT_DELAY_MS = 60_000
const INITIAL_RECONNECT_DELAY_MS = 1_000
const BRIDGE_POLL_INTERVAL_MS = 5_000

const sessions = new Map()

function getBridgeUrlForSession(sessionId) {
  const normalized = sessionId.replace(/-/g, '_')
  const envKeys = [
    `BRIDGE_URL_${normalized.toUpperCase()}`,
    `BRIDGE_URL_${normalized}`,
    `BRIDGE_URL_${sessionId}`,
  ]
  for (const envKey of envKeys) {
    if (process.env[envKey]) return process.env[envKey]
  }
  return process.env.BRIDGE_URL || null
}

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

const WEBHOOK_DISCONNECT_URL = process.env.WEBHOOK_DISCONNECT_URL || null

async function notifyDisconnectWebhook(sessionId, statusCode, reason, reconnectAttempts) {
  if (!WEBHOOK_DISCONNECT_URL) return
  try {
    const user = auth.getUserBySessionId(sessionId)
    const payload = {
      event: 'session.disconnected',
      sessionId,
      displayName: user?.displayName || sessionId,
      username: user?.username || sessionId,
      statusCode,
      reason: reason || 'unknown',
      reconnectAttempts,
      timestamp: new Date().toISOString(),
      environment: process.env.RENDER ? 'render' : 'local',
    }
    const res = await fetchWithTimeout(WEBHOOK_DISCONNECT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 10_000,
    })
    if (!res.ok) {
      logger.warn({ sessionId, webhookStatus: res.status }, 'Webhook respondio con error')
    }
  } catch (err) {
    logger.warn({ sessionId, err: err.message }, 'Error al enviar webhook de desconexion')
  }
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
    connectedAt: session.connectedAt || null,
    disconnectedAt: session.disconnectedAt || null,
    uptime: formatUptime(session.connectedAt),
    reconnectAttempts: session.reconnectAttempts || 0,
    healthCheckRunning: Boolean(session._healthInterval),
  }
}

function createSession(sessionId = DEFAULT_SESSION_ID, { onSendScheduled } = {}) {
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId)
  }

  const sessionDataDir = getSessionDataDir(sessionId)
  const scheduler = createScheduler({ dataDir: sessionDataDir, sessionId, onSendScheduled })

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
    connectedAt: null,
    disconnectedAt: null,
    reconnectAttempts: 0,
    _healthInterval: null,
    stopHealthCheck,
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
    } catch (qrErr) {
      logger.warn({ sessionId: session.id, err: qrErr?.message }, 'Error generando QR en terminal')
    }
  }

  function startHealthCheck() {
    stopHealthCheck()
    session._healthInterval = setInterval(() => {
      try {
        const ws = session.client?.ws
        if (ws && ws.readyState !== 1 && session.isClientReady) {
          logger.warn({ sessionId: session.id, readyState: ws.readyState }, 'Health check: socket not open, reconnecting...')
          session.isClientReady = false
          session.reconnectAttempts += 1
          startSocket()
        }
      } catch (err) {
        logger.warn({ sessionId: session.id, err: err.message }, 'Health check error')
      }
    }, HEALTH_CHECK_INTERVAL_MS)
  }

  function stopHealthCheck() {
    if (session._healthInterval) {
      clearInterval(session._healthInterval)
      session._healthInterval = null
    }
  }

  function getReconnectDelay() {
    const delay = Math.min(INITIAL_RECONNECT_DELAY_MS * Math.pow(2, session.reconnectAttempts), MAX_RECONNECT_DELAY_MS)
    const jitter = Math.random() * 1000
    return delay + jitter
  }

  async function startBridgeMode() {
    const bridgeUrl = getBridgeUrlForSession(session.id)
    if (!bridgeUrl) return false

    logger.info({ sessionId: session.id, bridgeUrl }, 'Bridge mode activado')
    session.sessionStatus = 'connecting'
    session.lastSessionMessage = `Conectando via bridge (${bridgeUrl})...`

    const { client: bridgeClient, startPolling, stopPolling: stopBridgePolling } = createBridgeClient(bridgeUrl)
    session.client = bridgeClient
    session._bridgeStopPolling = stopBridgePolling

    // bridge client polls /status every 5s and updates its internal status
    startPolling(BRIDGE_POLL_INTERVAL_MS)
    // sync session state from bridge status on every poll
    session._bridgePollTimer = setInterval(async () => {
      try {
        const res = await fetchWithTimeout(bridgeUrl + '/status', { timeout: 8_000 })
        if (!res) return
        const s = await res.json()
        applyBridgeStatus(s)
        if (s?.ready) {
          session.scheduler.startChecker(bridgeClient)
        }
      } catch (err) {
        logger.warn({ sessionId: session.id, err: err?.message }, 'Bridge poll error')
      }
    }, BRIDGE_POLL_INTERVAL_MS)

    // initial fetch
    try {
      const res = await fetchWithTimeout(bridgeUrl + '/status', { timeout: 8_000 })
      if (res) applyBridgeStatus(await res.json())
    } catch (err) {
      logger.warn({ sessionId: session.id, err: err?.message }, 'Bridge initial fetch error')
    }

    return true
  }

  function applyBridgeStatus(s) {
    if (!s) return
    session.isClientReady = Boolean(s.ready)
    session.sessionStatus = s.status || 'disconnected'
    session.lastSessionMessage = s.message || ''
    session.lastQrDataUrl = s.qr?.dataUrl || null
    session.lastQr = s.qr?.available ? 'bridge-qr' : null
    session.connectedAt = s.connection?.connectedAt || session.connectedAt
    session.disconnectedAt = s.connection?.disconnectedAt || session.disconnectedAt
    session.reconnectAttempts = s.connection?.reconnectAttempts || 0
  }

  async function bridgeFetchOnce(url) {
    try { const r = await fetchWithTimeout(url, { timeout: 8_000 }); return r ? await r.json() : null } catch { return null }
  }

  async function startSocket() {
    // Check bridge mode first
    if (await startBridgeMode()) return

    const authPath = join(sessionDataDir, 'auth')

    let state, saveCreds
    try {
      const r = await useMultiFileAuthState(authPath)
      state = r.state
      saveCreds = r.saveCreds
    } catch (err) {
      logger.error({ sessionId: session.id, err: err.message }, 'Error loading auth state')
      session.sessionStatus = 'disconnected'
      session.lastSessionMessage = 'Error al cargar credenciales: ' + err.message
      return
    }

    logger.info({ sessionId: session.id, attempt: session.reconnectAttempts + 1 }, 'Starting Baileys socket')
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: ['WspReminder', '1.0', ''],
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
      keepAliveIntervalMs: 30_000,
      retryRequestOnFail: true,
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
      try {
        updateTimestamps()
        const { connection, lastDisconnect, qr } = update

        logger.debug({ sessionId: session.id, connection, hasQr: !!qr, lastError: lastDisconnect?.error?.message }, 'connection.update')

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
        session.connectedAt = new Date().toISOString()
        session.disconnectedAt = null
        session.reconnectAttempts = 0
        session.scheduler.startChecker(sock)
        startHealthCheck()
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        session.isClientReady = false
        session.lastQr = null
        session.lastQrDataUrl = null
        session.disconnectedAt = new Date().toISOString()
        stopHealthCheck()

        logger.warn({ sessionId: session.id, statusCode, shouldReconnect, reason: lastDisconnect?.error?.message }, 'Connection closed')

        // Notificar webhook de desconexion
        notifyDisconnectWebhook(session.id, statusCode, lastDisconnect?.error?.message, session.reconnectAttempts)

        if (statusCode === DisconnectReason.loggedOut) {
          session.sessionStatus = 'logged_out'
          session.lastSessionMessage = 'Sesion cerrada. Escanea el QR nuevamente.'
          session.reconnectAttempts = 0
        } else {
          session.sessionStatus = 'disconnected'
          session.lastSessionMessage = lastDisconnect?.error?.message || 'Desconectado'
          session.reconnectAttempts += 1
        }

        if (shouldReconnect && !session.manuallyDisconnected) {
          const delay = getReconnectDelay()
          logger.info({ sessionId: session.id, delay: Math.round(delay), attempt: session.reconnectAttempts }, 'Reconnecting')
          setTimeout(startSocket, delay)
        }
      }
    } catch (err) {
      logger.error({ sessionId: session.id, err: err?.message }, 'Error en connection.update')
    }
  })

    session.client = sock
  }

  function cleanupBridgeTimers() {
    if (session._bridgePollTimer) { clearInterval(session._bridgePollTimer); session._bridgePollTimer = null }
    if (typeof session._bridgeStopPolling === 'function') session._bridgeStopPolling()
  }

  session.reinitializeClient = async ({ resetAttempts } = {}) => {
    if (session.manuallyDisconnected) return
    stopHealthCheck()
    cleanupBridgeTimers()
    if (resetAttempts) session.reconnectAttempts = 0
    try {
      await startSocket()
    } catch (err) {
      logger.error({ sessionId: session.id, err: err?.message }, 'Error en startSocket')
      session.sessionStatus = 'disconnected'
      session.lastSessionMessage = 'Error al iniciar socket: ' + (err?.message || 'desconocido')
    }
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
  if (typeof session.stopHealthCheck === 'function') session.stopHealthCheck()
  if (session._bridgePollTimer) { clearInterval(session._bridgePollTimer); session._bridgePollTimer = null }
  if (typeof session._bridgeStopPolling === 'function') session._bridgeStopPolling()

  if (session.client && typeof session.client.logout === 'function') {
    try { await session.client.logout() } catch (err) {
      logger.warn({ sessionId: session.id, err: err?.message }, 'Error en logout durante destroy')
    }
  }

  if (session.client && typeof session.client.end === 'function') {
    try { session.client.end() } catch (err) {
      logger.warn({ sessionId: session.id, err: err?.message }, 'Error en end durante destroy')
    }
  }

  sessions.delete(sessionId)
  return true
}

function normalizeSessionId(id) {
  if (!id || typeof id !== 'string') return null
  const normalized = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
  return normalized.length > 0 ? normalized : null
}

// Auto-healing watchdog: restarts sessions stuck in non-ready states
const STUCK_TIMEOUT_MS = 5 * 60 * 1000
let _healInterval = null

function startAutoHeal() {
  if (_healInterval) return
  _healInterval = setInterval(() => {
    const now = Date.now()
    for (const [id, session] of sessions) {
      if (session.manuallyDisconnected || session.isClientReady) continue
      const updated = new Date(session.updatedAt || session.createdAt).getTime()
      if (now - updated > STUCK_TIMEOUT_MS && !session.isClientReady) {
        logger.warn({ sessionId: id, status: session.sessionStatus, stuckFor: Math.round((now - updated) / 1000) }, 'Sesion trabada, reiniciando')
        session.reconnectAttempts = (session.reconnectAttempts || 0) + 1
        session.reinitializeClient()
      }
    }
  }, 30_000)
  logger.info({ timeout: '5m', checkEvery: '30s' }, 'Auto-healing watchdog started')
}

function stopAutoHeal() {
  if (_healInterval) {
    clearInterval(_healInterval)
    _healInterval = null
  }
}

// Start auto-heal after module loads
startAutoHeal()

module.exports = {
  DEFAULT_SESSION_ID,
  createSession,
  getSession,
  hasSession: (id) => sessions.has(id),
  listSessions: () => [...sessions.values()].map(sessionSummary),
  sessionSummary,
  destroySession,
  normalizeSessionId,
  stopAutoHeal,
}
