const express = require('express')
const cors = require('cors')
const sessionManager = require('./sessionManager')
const { createSessionRouter, clearPersistedGroupsCache } = require('./app')
const auth = require('./auth')
const history = require('./history')

require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const SESSION_NAMES = ['admin', 'comercial-1', 'comercial-2', 'academico-1', 'in']

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

for (const name of SESSION_NAMES) {
  if (!sessionManager.hasSession(name)) {
    sessionManager.createSession(name, { onSendScheduled: onSendCallback })
  }
}

app.post('/api/login', (req, res) => {
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
    console.log(`[auth] 401: no Bearer token. path: ${req.path}, method: ${req.method}`)
    return res.status(401).json({ ok: false, error: 'Token requerido' })
  }
  const token = header.slice(7)
  const info = auth.authenticate(token)
  if (!info) {
    console.log(`[auth] 401: token invalido. path: ${req.path}, token prefix: ${token.slice(0, 12)}...`)
    return res.status(401).json({ ok: false, error: 'Token invalido' })
  }
  console.log(`[auth] OK: ${info.displayName} (${info.username}) -> ${info.sessionId} for ${req.method} ${req.path}`)
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
  req.session = sessionManager.getSession(req.userSessionId) || defaultSession
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
  const sessions = sessionManager.listSessions()
  const all = []
  for (const s of sessions) {
    const msgs = s.scheduler.getAll()
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

app.post('/admin/disconnect/:sessionId', adminOnly, async (req, res) => {
  try {
    const session = sessionManager.getSession(req.params.sessionId)
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Sesion no encontrada' })
    }

    session.isClientReady = false
    session.lastQr = null
    session.lastQrDataUrl = null
    session.cachedGroups = []
    session.cachedGroupsAt = null
    if (session.groupsCachePersistence !== false) {
      clearPersistedGroupsCache(session)
    }
    session.sessionStatus = 'starting'
    session.lastSessionMessage = 'Sesion desconectada por admin. Generando nuevo QR...'
    session.scheduler.stop()

    try {
      await session.client.logout()
    } catch (logoutError) {
      console.warn('No se pudo cerrar sesion con logout:', logoutError?.message || logoutError)
    }

    if (session.client && typeof session.client.end === 'function') {
      try { session.client.end() } catch {}
    }

    session.manuallyDisconnected = false
    session.reinitializeClient()

    const user = auth.getUserBySessionId(req.params.sessionId)
    res.json({
      ok: true,
      message: `Sesion de ${user ? user.displayName : req.params.sessionId} desconectada. QR generado para reconectar.`,
    })
  } catch (error) {
    console.error('Error al desconectar sesion:', error)
    res.status(500).json({ ok: false, error: 'No se pudo desconectar la sesion' })
  }
})

const HOST = process.env.HOST || '0.0.0.0'
const PORT = process.env.PORT || 3177
app.listen(PORT, HOST, () => {
  console.log(`Servidor escuchando en http://${HOST === '0.0.0.0' ? '0.0.0.0' : HOST}:${PORT}`)
})
