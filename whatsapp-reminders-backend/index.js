const express = require('express')
const cors = require('cors')
const sessionManager = require('./sessionManager')
const { createSessionRouter } = require('./app')

require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const defaultSession = sessionManager.createSession(sessionManager.DEFAULT_SESSION_ID)

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Backend de recordatorios funcionando' })
})

// compatibilidad con frontend que usa /sessions/default/...
app.use('/sessions/:sessionId', (req, res, next) => {
  req.session = defaultSession
  next()
}, createSessionRouter())

app.get('/sessions', (req, res) => {
  res.json({ ok: true, sessions: [sessionManager.sessionSummary(defaultSession)] })
})

app.post('/sessions', (req, res) => {
  res.status(201).json({ ok: true, message: 'Usando sesion unica', session: sessionManager.sessionSummary(defaultSession) })
})

app.delete('/sessions/:sessionId', async (req, res) => {
  res.json({ ok: true, message: 'Sesion unica no se puede destruir' })
})

app.use('/', (req, res, next) => {
  req.session = defaultSession
  next()
}, createSessionRouter())

const HOST = process.env.HOST || '0.0.0.0'
const PORT = process.env.PORT || 3177
app.listen(PORT, HOST, () => {
  console.log(`Servidor escuchando en http://${HOST === '0.0.0.0' ? '0.0.0.0' : HOST}:${PORT}`)
})
