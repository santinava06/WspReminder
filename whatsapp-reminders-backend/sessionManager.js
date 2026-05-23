const { join } = require('path')
const { homedir } = require('os')
const { existsSync, mkdirSync } = require('fs')
const { execSync } = require('child_process')
const { Client } = require('whatsapp-web.js')
const ResilientLocalAuth = require('./ResilientLocalAuth')
const { createScheduler } = require('./scheduler')

function ensureChromeInstalled() {
  try {
    const chromePath = require('puppeteer').executablePath()
    if (existsSync(chromePath)) {
      console.log('Chrome encontrado en:', chromePath)
      return chromePath
    }
  } catch {}

  console.log('Chrome no encontrado. Instalando...')
  try {
    const cliPath = join(__dirname, 'node_modules', 'puppeteer', 'lib', 'cjs', 'puppeteer', 'node', 'cli.js')
    if (existsSync(cliPath)) {
      execSync(`node "${cliPath}" browsers install chrome`, {
        cwd: __dirname,
        stdio: 'inherit',
        timeout: 120_000,
      })
    } else {
      execSync('npx -y puppeteer@24.38.0 browsers install chrome', {
        cwd: __dirname,
        stdio: 'inherit',
        timeout: 120_000,
      })
    }
    const chromePath = require('puppeteer').executablePath()
    if (existsSync(chromePath)) {
      console.log('Chrome instalado exitosamente')
      return chromePath
    }
  } catch (err) {
    console.error('Error instalando Chrome:', err.message)
  }
  return undefined
}

const CHROME_EXECUTABLE_PATH = ensureChromeInstalled()

const DEFAULT_BASE_DATA_DIR = process.env.WHATSAPP_REMINDERS_DATA_DIR || (() => {
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || process.env.LOCALAPPDATA || homedir(), 'WhatsApp Reminders')
  }

  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'whatsapp-reminders')
})()
const DEFAULT_SESSION_ID = process.env.WHATSAPP_SESSION_ID || 'default'
const DEFAULT_WHATSAPP_PROTOCOL_TIMEOUT_MS = Number.parseInt(process.env.WHATSAPP_PROTOCOL_TIMEOUT_MS, 10) || 300_000
const DEFAULT_WHATSAPP_AUTH_TIMEOUT_MS = Number.parseInt(process.env.WHATSAPP_AUTH_TIMEOUT_MS, 10) || 180_000
const DEFAULT_WHATSAPP_INIT_RETRIES = Number.parseInt(process.env.WHATSAPP_INIT_RETRIES, 10) || 3

const sessions = new Map()

function normalizeSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return null
  const normalized = sessionId.trim()
  if (!normalized) return null
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) return null
  return normalized
}

function getSessionDataDir(sessionId) {
  const sessionDir = join(DEFAULT_BASE_DATA_DIR, 'sessions', sessionId)
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true })
  }
  return sessionDir
}

function createWhatsappClient(sessionId, options) {
  const sessionDir = getSessionDataDir(sessionId)
  const authPath = join(sessionDir, 'auth')

  return new Client({
    authStrategy: new ResilientLocalAuth({
      clientId: sessionId,
      dataPath: authPath,
    }),
    authTimeoutMs: options.whatsappAuthTimeoutMs,
    qrMaxRetries: 0,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 10_000,
    puppeteer: {
      headless: true,
      executablePath: CHROME_EXECUTABLE_PATH,
      protocolTimeout: options.whatsappProtocolTimeoutMs,
      timeout: options.whatsappProtocolTimeoutMs,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-gpu', '--disable-extensions', '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
        '--window-size=1280,720',
      ],
    },
  })
}

function isSessionRunning(session) {
  return Boolean(session.client && (session.isClientReady || session.client.info))
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

function createSession(sessionId, options = {}) {
  const normalizedSessionId = normalizeSessionId(sessionId)
  if (!normalizedSessionId) {
    throw new Error('sessionId invalido. Solo se permiten letras, numeros, guiones y guiones bajos.')
  }

  if (sessions.has(normalizedSessionId)) {
    return sessions.get(normalizedSessionId)
  }

  const sessionDataDir = getSessionDataDir(normalizedSessionId)
  const scheduler = createScheduler({ dataDir: sessionDataDir })
  const client = createWhatsappClient(normalizedSessionId, {
    whatsappProtocolTimeoutMs: DEFAULT_WHATSAPP_PROTOCOL_TIMEOUT_MS,
    whatsappAuthTimeoutMs: DEFAULT_WHATSAPP_AUTH_TIMEOUT_MS,
  })

  const session = {
    id: normalizedSessionId,
    dataDir: sessionDataDir,
    client,
    scheduler,
    isClientReady: false,
    lastQr: null,
    lastQrDataUrl: null,
    sessionStatus: 'starting',
    lastSessionMessage: 'Iniciando cliente de WhatsApp',
    cachedGroups: [],
    cachedGroupsAt: null,
    groupsRefreshPromise: null,
    manuallyDisconnected: false,
    whatsappInitializeAttempt: 0,
    whatsappInitializing: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  function updateTimestamps() {
    session.updatedAt = new Date().toISOString()
  }

  session.reinitializeClient = async ({ resetAttempts = false } = {}) => {
    if (session.whatsappInitializing) return

    if (resetAttempts) {
      session.whatsappInitializeAttempt = 0
    }

    session.whatsappInitializing = true
    session.whatsappInitializeAttempt += 1
    updateTimestamps()

    try {
      console.log(`Inicializando WhatsApp Web para la sesion ${session.id} (intento ${session.whatsappInitializeAttempt}/${DEFAULT_WHATSAPP_INIT_RETRIES})...`)
      await session.client.initialize()
    } catch (error) {
      const errorMessage = error?.message || String(error)
      console.error(`Error inicializando WhatsApp Web para la sesion ${session.id}:`, errorMessage)
      session.client.emit('initialization_failure', error)

      if (session.whatsappInitializeAttempt >= DEFAULT_WHATSAPP_INIT_RETRIES) {
        console.error(
          `No se pudo inicializar WhatsApp Web para la sesion ${session.id} despues de ${DEFAULT_WHATSAPP_INIT_RETRIES} intentos. ` +
          'El backend sigue vivo; reinicia la sesion o el proceso.',
        )
        return
      }

      const retryDelayMs = Math.min(10_000 * session.whatsappInitializeAttempt, 30_000)
      console.log(`Reintentando inicializacion de la sesion ${session.id} en ${Math.round(retryDelayMs / 1000)}s...`)
      setTimeout(() => {
        session.reinitializeClient()
      }, retryDelayMs)
    } finally {
      session.whatsappInitializing = false
    }
  }

  session.manager = {
    updateTimestamps,
  }

  session.client.on('qr', async (qr) => {
    session.manuallyDisconnected = false
    session.isClientReady = false
    session.sessionStatus = 'qr'
    session.lastQr = qr
    session.lastSessionMessage = 'Escanea el QR para iniciar sesion'
    updateTimestamps()

    try {
      session.lastQrDataUrl = await require('qrcode').toDataURL(qr, { margin: 1, width: 280 })
    } catch {
      session.lastQrDataUrl = null
    }

    try {
      require('qrcode-terminal').generate(qr, { small: true })
    } catch {
      // Ignorar si no se puede generar en terminal.
    }
  })

  session.client.on('authenticated', () => {
    session.manuallyDisconnected = false
    session.sessionStatus = 'authenticated'
    session.lastSessionMessage = 'WhatsApp autenticado'
    updateTimestamps()
  })

  session.client.on('ready', () => {
    session.manuallyDisconnected = false
    session.isClientReady = true
    session.sessionStatus = 'ready'
    session.lastQr = null
    session.lastQrDataUrl = null
    session.lastSessionMessage = 'WhatsApp conectado correctamente'
    updateTimestamps()

    session.scheduler.startChecker(session.client)
  })

  session.client.on('initialization_failure', (error) => {
    session.isClientReady = false
    session.sessionStatus = 'initialization_failure'
    session.lastQr = null
    session.lastQrDataUrl = null
    session.lastSessionMessage = error?.message || String(error) || 'No se pudo inicializar WhatsApp Web'
    updateTimestamps()
  })

  session.client.on('auth_failure', (message) => {
    session.manuallyDisconnected = false
    session.isClientReady = false
    session.sessionStatus = 'auth_failure'
    session.lastQr = null
    session.lastQrDataUrl = null
    session.lastSessionMessage = message
    updateTimestamps()
  })

  session.client.on('disconnected', (reason) => {
    session.isClientReady = false
    session.sessionStatus = 'disconnected'
    session.lastSessionMessage = reason
    updateTimestamps()
  })

  session.scheduler.startChecker(session.client)
  session.reinitializeClient()

  sessions.set(normalizedSessionId, session)
  return session
}

function getSession(sessionId) {
  const normalizedSessionId = normalizeSessionId(sessionId)
  if (!normalizedSessionId) return null
  return sessions.get(normalizedSessionId) || null
}

function hasSession(sessionId) {
  return Boolean(getSession(sessionId))
}

function listSessions() {
  return [...sessions.values()].map(sessionSummary)
}

async function destroySession(sessionId) {
  const session = getSession(sessionId)
  if (!session) return false

  session.manuallyDisconnected = true
  session.sessionStatus = 'disconnected'
  session.lastSessionMessage = 'Sesion detenida'
  session.manager.updateTimestamps()

  session.scheduler.stop()

  try {
    if (typeof session.client.logout === 'function') {
      await session.client.logout()
    }
  } catch (error) {
    console.warn(`No se pudo cerrar sesion ${session.id} durante la destruccion:`, error?.message || error)
  }

  try {
    if (typeof session.client.destroy === 'function') {
      await session.client.destroy()
    }
  } catch (error) {
    console.warn(`No se pudo destruir el cliente de la sesion ${session.id}:`, error?.message || error)
  }

  sessions.delete(sessionId)
  return true
}

module.exports = {
  DEFAULT_SESSION_ID,
  normalizeSessionId,
  createSession,
  getSession,
  hasSession,
  listSessions,
  sessionSummary,
  destroySession,
}
