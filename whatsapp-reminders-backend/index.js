const express = require('express')
const cors = require('cors')
const { existsSync, rmSync } = require('fs')
const { join } = require('path')
const sessionManager = require('./sessionManager')
const { createSessionRouter, clearPersistedGroupsCache } = require('./app')
const auth = require('./auth')
const history = require('./history')
const logger = require('./logger')
const rateLimit = require('express-rate-limit')
const pinoHttp = require('pino-http')
const db = require('./db')

require('dotenv').config()

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason instanceof Error ? reason.message : reason, stack: reason instanceof Error ? reason.stack : undefined }, 'Unhandled rejection')
})

process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught exception')
  if (!process.exitCode) process.exitCode = 1
  _gracefulShutdown('uncaughtException')
})

let _gracefulShutdown = async () => {}

for (const sig of ['SIGTERM', 'SIGINT', 'SIGUSR2']) {
  if (process.listenerCount(sig) === 0) {
    process.once(sig, () => _gracefulShutdown(sig))
  }
}

const app = express()

// Request logging
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }))

// CORS hardening
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://wspreminder.vercel.app,https://wspreminder.online,http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

app.use(express.json({ limit: '20mb' }))

// Request timeout middleware (120s for long-polling endpoints, 30s for others)
app.use((req, res, next) => {
  const timeout = req.path.startsWith('/health') ? 10_000 : 30_000
  req.setTimeout(timeout, () => {
    if (!res.headersSent) res.status(408).json({ ok: false, error: 'Tiempo de espera agotado' })
  })
  next()
})

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos de login. Intenta de nuevo en 15 minutos.' },
})

const SESSION_NAMES = ['admin', 'erika', 'melina', 'academico-1', 'in', 'luciana', 'yanina', 'julieta']

// Environment validation
const OPTIONAL_ENV_VARS = [
  { name: 'WEBHOOK_DISCONNECT_URL', desc: 'Webhook de notificacion de desconexion' },
  { name: 'BRIDGE_URL', desc: 'URL del bridge local para todas las sesiones' },
  { name: 'HISTORY_TTL_DAYS', desc: 'Dias de retencion del historial (default: 90)' },
  { name: 'ALLOWED_ORIGINS', desc: 'Origenes CORS (default: Vercel + localhost)' },
  { name: 'LOG_LEVEL', desc: 'Nivel de log: debug, info, warn, error (default: info en prod)' },
]
for (const v of OPTIONAL_ENV_VARS) {
  if (!process.env[v.name]) {
    logger.warn({ var: v.name, desc: v.desc }, 'Variable de entorno opcional no configurada')
  }
}

function onSendCallback(msg) {
  const user = auth.getUserBySessionId(msg.sessionId || msg.username)
  const username = user ? user.username : (msg.username || 'unknown')
  history.logSend(msg.sessionId || username, username, {
    message: msg.message,
    results: msg.results,
    hasMedia: !!msg.media,
    mode: 'scheduled',
  })
}

db.initDatabase().then(() => {
  for (const name of SESSION_NAMES) {
    if (!sessionManager.hasSession(name)) {
      sessionManager.createSession(name, { onSendScheduled: onSendCallback })
    }
  }

  // Migrate existing JSON data to SQLite (runs once)
  db.migrateJsonToSqlite(SESSION_NAMES)
}).catch(err => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Failed to initialize database')
  process.exit(1)
})

// Public health endpoint (no auth required)
app.get('/health', (req, res) => {
  const sessions = sessionManager.listSessions()
  const allReady = sessions.every(s => s.ready)
  const uptime = process.uptime()
  res.json({
    ok: true,
    status: allReady ? 'healthy' : 'degraded',
    uptime: Math.floor(uptime),
    sessions: sessions.map(s => ({
      id: s.id,
      status: s.status,
      ready: s.ready,
      qrAvailable: s.qrAvailable,
      uptime: s.uptime,
      reconnectAttempts: s.reconnectAttempts,
    })),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
  })
})

app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Faltan username o password' })
  }
  const result = auth.login(username, password)
  if (!result) {
    return res.status(401).json({ ok: false, error: 'Credenciales invalidas' })
  }
  res.json({ ok: true, token: result.token, sessionId: result.sessionId, displayName: result.displayName, username: result.username })
})

function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    logger.warn({ path: req.path, method: req.method }, '401: no Bearer token')
    return res.status(401).json({ ok: false, error: 'Token requerido' })
  }
  const token = header.slice(7)
  const info = auth.authenticate(token)
  if (!info) {
    logger.warn({ path: req.path, tokenPrefix: token.slice(0, 12) }, '401: token invalido')
    return res.status(401).json({ ok: false, error: 'Token invalido' })
  }
  logger.info({ displayName: info.displayName, username: info.username, sessionId: info.sessionId, method: req.method, path: req.path }, 'Auth OK')
  req.userSessionId = info.sessionId
  req.username = info.username
  req.displayName = info.displayName
  next()
}

app.use(authMiddleware)

app.get('/debug', (req, res) => {
  const s = sessionManager.getSession(req.userSessionId)
  res.json({
    ok: true,
    displayName: req.displayName,
    username: req.username,
    sessionId: req.userSessionId,
    clientExists: !!s?.client,
    clientReady: s?.isClientReady,
    status: s?.sessionStatus,
    qrAvailable: !!s?.lastQrDataUrl,
    userInfo: s?.client?.user ? { id: s.client.user.id, name: s.client.user.name } : null,
  })
})

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Backend de recordatorios funcionando' })
})

app.get('/sessions', (req, res) => {
  const session = sessionManager.getSession(req.userSessionId)
  res.json({ ok: true, sessions: session ? [sessionManager.sessionSummary(session)] : [] })
})

app.get('/sessions/:sessionId', (req, res) => {
  if (req.params.sessionId !== req.userSessionId) {
    return res.status(403).json({ ok: false, error: 'No tenes acceso a esta sesion' })
  }
  const session = sessionManager.getSession(req.params.sessionId)
  if (!session) {
    return res.status(404).json({ ok: false, error: 'Sesion no encontrada' })
  }
  res.json({ ok: true, session: sessionManager.sessionSummary(session) })
})

app.use('/sessions/:sessionId', (req, res, next) => {
  if (req.params.sessionId !== req.userSessionId) {
    return res.status(403).json({ ok: false, error: 'No tenes acceso a esta sesion' })
  }
  const session = sessionManager.getSession(req.params.sessionId)
  if (!session) {
    return res.status(404).json({ ok: false, error: 'Sesion no encontrada' })
  }
  req.session = session
  next()
}, createSessionRouter())

app.use('/', (req, res, next) => {
  req.session = sessionManager.getSession(req.userSessionId)
  next()
}, createSessionRouter())

function adminOnly(req, res, next) {
  if (req.username !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Solo el administrador puede acceder a esta seccion' })
  }
  next()
}

app.get('/admin/users', adminOnly, (req, res) => {
  const sessions = sessionManager.listSessions()
  const users = auth.USERS.map(u => {
    const s = sessions.find(s => s.id === u.sessionId)
    return {
      username: u.username,
      displayName: u.displayName,
      sessionId: u.sessionId,
      connected: s ? s.ready : false,
      status: s ? s.status : 'unknown',
      message: s ? s.message : null,
      qrAvailable: s ? s.qrAvailable : false,
    }
  })
  res.json({ ok: true, users })
})

app.get('/admin/history', adminOnly, (req, res) => {
  const all = history.getAllHistory()
  res.json({ ok: true, total: all.length, entries: all })
})

app.get('/admin/scheduled', adminOnly, (req, res) => {
  const summaries = sessionManager.listSessions()
  const all = []
  for (const s of summaries) {
    const session = sessionManager.getSession(s.id)
    if (!session) continue
    const msgs = session.scheduler.getAll()
    for (const m of msgs) {
      all.push({ ...m, sessionId: s.id })
    }
  }
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  res.json({ ok: true, total: all.length, messages: all })
})

app.get('/admin/stats', adminOnly, (req, res) => {
  const stats = history.getAllStats()
  res.json({ ok: true, stats })
})

app.post('/admin/retry', adminOnly, async (req, res) => {
  try {
    const { historyId } = req.body
    if (!historyId) return res.status(400).json({ ok: false, error: 'Falta historyId' })

    const allHistory = history.getAllHistory()
    const entry = allHistory.find(e => e.id === historyId)
    if (!entry) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' })

    const failedGroups = entry.results.filter(r => !r.ok)
    if (failedGroups.length === 0) return res.status(400).json({ ok: false, error: 'No hay grupos fallidos para reintentar' })

    const session = sessionManager.getSession(entry.sessionId)
    if (!session) return res.status(400).json({ ok: false, error: 'Sesion no encontrada' })
    if (!session.isClientReady) return res.status(503).json({ ok: false, error: 'WhatsApp no conectado para esta sesion' })

    const results = []
    for (const group of failedGroups) {
      try {
        const baileysMsg = { text: entry.message }
        await session.client.sendMessage(group.id, baileysMsg)
        results.push({ id: group.id, name: group.name, ok: true })
      } catch (err) {
        results.push({ id: group.id, name: group.name, ok: false, error: err.message })
      }
    }

    history.logSend(entry.sessionId, entry.username, {
      message: entry.message,
      results,
      hasMedia: entry.hasMedia || false,
      mode: 'retry',
    })

    const failed = results.filter(r => !r.ok)
    res.json({
      ok: failed.length === 0,
      message: failed.length === 0
        ? `Reintentado con exito a ${results.length} grupos`
        : `Reintentado a ${results.length - failed.length} de ${results.length} grupos`,
      total: results.length,
      sent: results.length - failed.length,
      failed: failed.length,
      results,
    })
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'Error al reintentar envio')
    res.status(500).json({ ok: false, error: 'No se pudo reintentar el envio' })
  }
})

app.post('/admin/disconnect/:sessionId', adminOnly, async (req, res) => {
  try {
    const session = sessionManager.getSession(req.params.sessionId)
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Sesion no encontrada' })
    }

    session.manuallyDisconnected = true
    session.isClientReady = false
    session.lastQr = null
    session.lastQrDataUrl = null
    session.cachedGroups = []
    session.cachedGroupsAt = null
    session.disconnectedAt = new Date().toISOString()
    if (session.groupsCachePersistence !== false) {
      clearPersistedGroupsCache(session)
    }
    session.sessionStatus = 'starting'
    session.lastSessionMessage = 'Sesion desconectada por admin. Generando nuevo QR...'
    session.scheduler.stop()
    if (typeof session.stopHealthCheck === 'function') session.stopHealthCheck()
    if (session._bridgePollTimer) { clearInterval(session._bridgePollTimer); session._bridgePollTimer = null }
    if (typeof session._bridgeStopPolling === 'function') session._bridgeStopPolling()

    try {
      await session.client.logout()
    } catch (logoutError) {
      logger.warn({ err: logoutError?.message }, 'No se pudo cerrar sesion con logout')
    }

    if (session.client && typeof session.client.end === 'function') {
      try { session.client.end() } catch (endErr) {
        logger.warn({ sessionId: session.id, err: endErr?.message }, 'Error al cerrar socket')
      }
    }

    clearPersistedGroupsCache(session)
    const authPath = join(session.dataDir, 'auth')
    try {
      if (existsSync(authPath)) rmSync(authPath, { recursive: true, force: true })
    } catch (err) {
      logger.warn({ sessionId: session.id, err: err.message }, 'Could not clear auth directory')
    }

    session.manuallyDisconnected = false
    session.reinitializeClient()

    const user = auth.getUserBySessionId(req.params.sessionId)
    res.json({
      ok: true,
      message: `Sesion de ${user ? user.displayName : req.params.sessionId} desconectada. QR generado para reconectar.`,
    })
  } catch (error) {
    logger.error({ err: error.message, stack: error.stack }, 'Error al desconectar sesion')
    res.status(500).json({ ok: false, error: 'No se pudo desconectar la sesion' })
  }
})

app.use((err, req, res, next) => {
  logger.error({ method: req.method, path: req.path, err: err instanceof Error ? err.message : err, stack: err instanceof Error ? err.stack : undefined }, 'Express error')
  res.status(500).json({ ok: false, error: 'Error interno del servidor' })
})

const HOST = process.env.HOST || '0.0.0.0'
const PORT = process.env.PORT || 3177
let server = null

db.initDatabase().then(() => {
  server = app.listen(PORT, HOST, () => {
    logger.info({ host: HOST, port: PORT }, 'Servidor iniciado')
  })
}).catch(err => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Failed to start server')
  process.exit(1)
})

_gracefulShutdown = async (signal) => {
  if (global._shuttingDown) return
  global._shuttingDown = true
  logger.info({ signal }, 'Iniciando apagado graceful')

  // Stop accepting new connections
  server.close(() => logger.info('HTTP server cerrado'))

  // Stop all schedulers (flushes pending saves)
  for (const name of SESSION_NAMES) {
    try {
      const session = sessionManager.getSession(name)
      if (session?.scheduler) {
        logger.info({ sessionId: name }, 'Deteniendo scheduler')
        session.scheduler.stop()
      }
    } catch (err) {
      logger.error({ sessionId: name, err: err.message }, 'Error al detener scheduler')
    }
  }

  // Stop history auto-clean
  try { history.stopAutoClean() } catch (err) { logger.warn({ err: err.message }, 'Error stopping history cleaner') }

  // Stop auto-healing watchdog
  try { sessionManager.stopAutoHeal() } catch (err) { logger.warn({ err: err.message }, 'Error stopping auto-heal') }

  // Close database
  try { db.closeDatabase() } catch (err) { logger.warn({ err: err.message }, 'Error closing database') }

  // Destroy all WhatsApp sessions
  for (const name of SESSION_NAMES) {
    try {
      if (sessionManager.hasSession(name)) {
        logger.info({ sessionId: name }, 'Destruyendo sesion')
        await sessionManager.destroySession(name)
      }
    } catch (err) {
      logger.error({ sessionId: name, err: err.message }, 'Error al destruir sesion')
    }
  }

  logger.info('Apagado graceful completado')
  setTimeout(() => process.exit(process.exitCode || 0), 1000)
}
