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

app.use('/', (req, res, next) => {
  req.session = defaultSession
  next()
}, createSessionRouter())

const HOST = process.env.HOST || '0.0.0.0'
const PORT = process.env.PORT || 3177
app.listen(PORT, HOST, () => {
  console.log(`Servidor escuchando en http://${HOST === '0.0.0.0' ? '0.0.0.0' : HOST}:${PORT}`)
})
