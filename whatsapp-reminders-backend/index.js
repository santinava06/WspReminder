const express = require('express')
const cors = require('cors')
const sessionManager = require('./sessionManager')
const { createSessionRouter } = require('./app')
const auth = require('./auth')

require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const SESSION_NAMES = ['admin1', 'admin2', 'admin3', 'admin4', 'admin5']
for (const name of SESSION_NAMES) {
  if (!sessionManager.hasSession(name)) {
    sessionManager.createSession(name)
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
  res.json({ ok: true, token: result.token, sessionId: result.sessionId })
})

function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Token requerido' })
  }
  const token = header.slice(7)
  const info = auth.authenticate(token)
  if (!info) {
    return res.status(401).json({ ok: false, error: 'Token invalido' })
  }
  req.userSessionId = info.sessionId
  req.username = info.username
  next()
}

app.use(authMiddleware)

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

const HOST = process.env.HOST || '0.0.0.0'
const PORT = process.env.PORT || 3177
app.listen(PORT, HOST, () => {
  console.log(`Servidor escuchando en http://${HOST === '0.0.0.0' ? '0.0.0.0' : HOST}:${PORT}`)
})
