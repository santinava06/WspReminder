const express = require('express')
const cors = require('cors')
const sessionManager = require('./sessionManager')
const { createSessionRouter } = require('./app')
const auth = require('./auth')

require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const defaultSession = sessionManager.createSession(sessionManager.DEFAULT_SESSION_ID)

const NUM_AUTO_SESSIONS = Number.parseInt(process.env.NUM_AUTO_SESSIONS, 10) || 5
for (let i = 2; i <= NUM_AUTO_SESSIONS; i++) {
  const name = `sesion-${i}`
  if (!sessionManager.hasSession(name)) {
    sessionManager.createSession(name)
  }
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Faltan username o password' })
  }
  const token = auth.login(username, password)
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Credenciales invalidas' })
  }
  res.json({ ok: true, token })
})

function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Token requerido' })
  }
  const token = header.slice(7)
  if (!auth.authenticate(token)) {
    return res.status(401).json({ ok: false, error: 'Token invalido' })
  }
  next()
}

app.use(authMiddleware)

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Backend de recordatorios funcionando' })
})

app.get('/sessions', (req, res) => {
  res.json({ ok: true, sessions: sessionManager.listSessions() })
})

app.post('/sessions', (req, res) => {
  const requestedSessionId = req.body.sessionId || req.body.id
  if (!requestedSessionId) {
    return res.status(400).json({ ok: false, error: 'Falta sessionId' })
  }

  const normalizedSessionId = sessionManager.normalizeSessionId(requestedSessionId)
  if (!normalizedSessionId) {
    return res.status(400).json({ ok: false, error: 'sessionId invalido. Solo letras, numeros, guiones y guiones bajos' })
  }

  if (sessionManager.hasSession(normalizedSessionId)) {
    return res.status(409).json({ ok: false, error: `Sesion ${normalizedSessionId} ya existe` })
  }

  const session = sessionManager.createSession(normalizedSessionId)
  return res.status(201).json({ ok: true, message: 'Sesion creada', session: sessionManager.sessionSummary(session) })
})

app.get('/sessions/:sessionId', (req, res) => {
  const session = sessionManager.getSession(req.params.sessionId)
  if (!session) {
    return res.status(404).json({ ok: false, error: 'Sesion no encontrada' })
  }
  res.json({ ok: true, session: sessionManager.sessionSummary(session) })
})

app.delete('/sessions/:sessionId', async (req, res) => {
  const destroyed = await sessionManager.destroySession(req.params.sessionId)
  if (!destroyed) {
    return res.status(404).json({ ok: false, error: 'Sesion no encontrada' })
  }
  res.json({ ok: true, message: 'Sesion destruida' })
})

app.use('/sessions/:sessionId', (req, res, next) => {
  const session = sessionManager.getSession(req.params.sessionId)
  if (!session) {
    return res.status(404).json({ ok: false, error: 'Sesion no encontrada' })
  }
  req.session = session
  next()
}, createSessionRouter())

app.use('/', (req, res, next) => {
  req.session = defaultSession
  next()
}, createSessionRouter())

const HOST = process.env.HOST || '0.0.0.0'
const PORT = process.env.PORT || 3177
app.listen(PORT, HOST, () => {
  console.log(`Servidor escuchando en http://${HOST === '0.0.0.0' ? '0.0.0.0' : HOST}:${PORT}`)
})
