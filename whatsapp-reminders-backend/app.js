const express = require('express')
const qrcodeTerminal = require('qrcode-terminal')
const QRCode = require('qrcode')
const { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, copyFileSync } = require('fs')
const { join, resolve } = require('path')
const { MessageMedia } = require('whatsapp-web.js')

const DEFAULT_GROUPS_SYNC_TIMEOUT_MS = Number.parseInt(process.env.GROUPS_SYNC_TIMEOUT_MS, 10) || 30_000

const normalizeText = (value = '') =>
  value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const normalizeGroupList = (groups) => {
  if (!Array.isArray(groups)) return []

  return groups
    .filter(group => group?.id)
    .map(group => ({
      id: String(group.id),
      name: group.name ? String(group.name) : '(sin nombre)',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

function getGroupsCacheFile(session) {
  return join(session.dataDir, 'groups-cache.json')
}

function getLegacyGroupsCacheFile(session) {
  return join(resolve(session.dataDir, '..'), 'groups-cache.json')
}

const readPersistedGroupsCache = (session) => {
  if (session.groupsCachePersistence === false) {
    return { groups: [], cachedAt: null }
  }

  const groupsCacheFile = getGroupsCacheFile(session)
  const legacyGroupsCacheFile = getLegacyGroupsCacheFile(session)

  try {
    if (!existsSync(groupsCacheFile)) {
      if (session.id === 'default' && existsSync(legacyGroupsCacheFile)) {
        if (!existsSync(session.dataDir)) mkdirSync(session.dataDir, { recursive: true })
        copyFileSync(legacyGroupsCacheFile, groupsCacheFile)
      }
    }

    if (!existsSync(groupsCacheFile)) return { groups: [], cachedAt: null }

    const parsedCache = JSON.parse(readFileSync(groupsCacheFile, 'utf8'))
    return {
      groups: normalizeGroupList(parsedCache.groups),
      cachedAt: parsedCache.cachedAt || null,
    }
  } catch (error) {
    console.warn('No se pudo leer cache de grupos:', error?.message || error)
    return { groups: [], cachedAt: null }
  }
}

const persistGroupsCache = (session, groups, cachedAt) => {
  try {
    const groupsCacheFile = getGroupsCacheFile(session)
    if (!existsSync(session.dataDir)) mkdirSync(session.dataDir, { recursive: true })
    writeFileSync(groupsCacheFile, JSON.stringify({ cachedAt, groups }, null, 2), 'utf8')
  } catch (error) {
    console.warn('No se pudo guardar cache de grupos:', error?.message || error)
  }
}

const clearPersistedGroupsCache = (session) => {
  try {
    const groupsCacheFile = getGroupsCacheFile(session)
    if (existsSync(groupsCacheFile)) unlinkSync(groupsCacheFile)
  } catch (error) {
    console.warn('No se pudo borrar cache de grupos:', error?.message || error)
  }
}

const initializeSessionGroupsCache = (session) => {
  if (session.cachedGroupsAt !== null) return
  const persisted = readPersistedGroupsCache(session)
  session.cachedGroups = persisted.groups
  session.cachedGroupsAt = persisted.cachedAt
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const fetchGroupsDirectlyFromPage = async (client) => {
  if (!client.pupPage || typeof client.pupPage.evaluate !== 'function') return null

  return client.pupPage.evaluate(() => {
    const chatCollection = window.require('WAWebCollections').Chat
    const chats = chatCollection.getModelsArray()

    return chats
      .filter((chat) => chat.groupMetadata || chat.id?.server === 'g.us' || chat.id?._serialized?.endsWith('@g.us'))
      .map((chat) => ({
        name: chat.formattedTitle || chat.name || chat.contact?.formattedName || '(sin nombre)',
        id: chat.id?._serialized || chat.id?.toString(),
      }))
      .filter((group) => group.id)
  })
}

const fetchGroupsFromWhatsapp = async (client) => {
  const directGroups = await fetchGroupsDirectlyFromPage(client)

  if (Array.isArray(directGroups)) {
    return directGroups.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
  }

  const chats = await client.getChats()

  return chats
    .filter(chat => chat.isGroup)
    .map((chat) => ({
      name: chat.name || '(sin nombre)',
      id: chat.id._serialized,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

const refreshGroupsCache = async (session) => {
  if (!session.groupsRefreshPromise) {
    session.groupsRefreshPromise = fetchGroupsFromWhatsapp(session.client)
      .then((groups) => {
        const normalizedGroups = normalizeGroupList(groups)
        session.cachedGroups = normalizedGroups
        session.cachedGroupsAt = new Date().toISOString()
        if (session.groupsCachePersistence !== false) {
          persistGroupsCache(session, session.cachedGroups, session.cachedGroupsAt)
        }
        return normalizedGroups
      })
      .finally(() => {
        session.groupsRefreshPromise = null
      })
  }

  return session.groupsRefreshPromise
}

const getAllGroups = async (session, { timeoutMs = DEFAULT_GROUPS_SYNC_TIMEOUT_MS, allowCache = true } = {}) => {
  try {
    return await Promise.race([
      refreshGroupsCache(session),
      delay(timeoutMs).then(() => {
        const error = new Error('WhatsApp todavia esta sincronizando los grupos. Vuelve a intentar en unos segundos.')
        error.code = 'GROUPS_SYNC_TIMEOUT'
        throw error
      }),
    ])
  } catch (error) {
    if (allowCache && session.cachedGroups.length > 0) return session.cachedGroups
    throw error
  }
}

const filterGroupsForResponse = (groups, { search, limit }) => {
  let filteredGroups = groups

  if (search) {
    filteredGroups = filteredGroups.filter(group => normalizeText(group.name).includes(search))
  }

  if (Number.isInteger(limit) && limit > 0) {
    filteredGroups = filteredGroups.slice(0, limit)
  }

  return filteredGroups
}

const refreshGroupsInBackground = (session) => {
  refreshGroupsCache(session).catch((error) => {
    console.warn('No se pudo refrescar grupos en segundo plano:', error?.message || error)
  })
}

const sendReminderToGroups = async (session, groups, message, media = null) => {
  const results = []

  for (const group of groups) {
    try {
      if (media) {
        const mediaObj = new MessageMedia(media.mimetype, media.data, media.filename)
        await session.client.sendMessage(group.id, message, { media: mediaObj })
      } else {
        await session.client.sendMessage(group.id, message)
      }
      results.push({ ...group, ok: true })
    } catch (error) {
      results.push({ ...group, ok: false, error: error.message })
    }
  }

  return results
}

const formatSendResults = (results) => {
  const failed = results.filter(result => !result.ok)

  return {
    ok: failed.length === 0,
    message: failed.length === 0
      ? `Recordatorio enviado a ${results.length} grupos`
      : `Recordatorio enviado a ${results.length - failed.length} de ${results.length} grupos`,
    total: results.length,
    sent: results.length - failed.length,
    failed: failed.length,
    results,
  }
}

const getWhatsappStatus = async (session) => {
  let state = null

  if (!session.manuallyDisconnected && !session.isClientReady && !session.client.info) {
    try {
      state = await Promise.race([
        session.client.getState(),
        new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
      ])
    } catch {
      state = null
    }
  }

  const hasActiveSession = !session.manuallyDisconnected && Boolean(session.isClientReady || state === 'CONNECTED' || session.client.info)
  const normalizedStatus = hasActiveSession && ['starting', 'disconnected'].includes(session.sessionStatus)
    ? 'ready'
    : session.sessionStatus
  const normalizedMessage = hasActiveSession && ['starting', 'disconnected'].includes(session.sessionStatus)
    ? 'WhatsApp conectado correctamente'
    : session.lastSessionMessage

  return {
    ready: hasActiveSession,
    status: normalizedStatus,
    message: normalizedMessage,
    state,
    info: session.manuallyDisconnected ? null : session.client.info || null,
    qr: !session.manuallyDisconnected && session.lastQrDataUrl
      ? { available: true, dataUrl: session.lastQrDataUrl }
      : { available: false, dataUrl: null },
    chromeProfile: session.usingChromeProfile,
    chromeRunning: session.chromeRunning,
  }
}

const ensureWhatsappReady = async (session, res) => {
  if (session.manuallyDisconnected) {
    res.status(503).json({
      ok: false,
      ready: false,
      error: 'WhatsApp esta desconectado. Escanea el QR nuevamente para reconectar.',
    })
    return false
  }

  const status = await getWhatsappStatus(session)

  if (status.ready) {
    return true
  }

  res.status(503).json({
    ok: false,
    ready: false,
    error: 'WhatsApp todavia no esta listo. Espera el mensaje "WhatsApp conectado correctamente" y vuelve a intentar.',
  })
  return false
}

const createSessionRouter = () => {
  const router = express.Router({ mergeParams: true })

  router.use((req, res, next) => {
    initializeSessionGroupsCache(req.session)
    next()
  })

  router.get('/', (req, res) => {
    const session = req.session
    res.json({
      ok: true,
      sessionId: session.id,
      message: 'Backend de recordatorios funcionando',
    })
  })

  router.post('/send-group-reminder', async (req, res) => {
    try {
      const { groupId, message, media } = req.body
      const session = req.session

      if (!(await ensureWhatsappReady(session, res))) return

      if (!groupId || !message) {
        return res.status(400).json({ ok: false, error: 'Faltan groupId o message' })
      }

      if (media) {
        const mediaObj = new MessageMedia(media.mimetype, media.data, media.filename)
        await session.client.sendMessage(groupId, message, { media: mediaObj })
      } else {
        await session.client.sendMessage(groupId, message)
      }

      res.json({ ok: true, message: 'Recordatorio enviado' })
    } catch (error) {
      console.error('Error enviando mensaje:', error)
      res.status(500).json({ ok: false, error: 'No se pudo enviar el mensaje' })
    }
  })

  router.post('/send-all-group-reminders', async (req, res) => {
    try {
      const { message, media } = req.body
      const session = req.session

      if (!(await ensureWhatsappReady(session, res))) return

      if (!message) {
        return res.status(400).json({ ok: false, error: 'Falta message' })
      }

      const groups = await getAllGroups(session)
      const results = await sendReminderToGroups(session, groups, message, media)

      res.json(formatSendResults(results))
    } catch (error) {
      console.error('Error enviando mensaje a todos los grupos:', error)
      res.status(500).json({ ok: false, error: 'No se pudo enviar el mensaje a todos los grupos' })
    }
  })

  router.post('/send-selected-group-reminders', async (req, res) => {
    try {
      const { groupIds, message, media } = req.body
      const session = req.session

      if (!(await ensureWhatsappReady(session, res))) return

      if (!Array.isArray(groupIds) || groupIds.length === 0 || !message) {
        return res.status(400).json({ ok: false, error: 'Faltan groupIds o message' })
      }

      const selectedIds = new Set(groupIds)
      const groups = (await getAllGroups(session)).filter(group => selectedIds.has(group.id))

      if (groups.length === 0) {
        return res.status(400).json({ ok: false, error: 'No se encontraron grupos validos para enviar' })
      }

      const results = await sendReminderToGroups(session, groups, message, media)
      res.json(formatSendResults(results))
    } catch (error) {
      console.error('Error enviando mensaje a grupos seleccionados:', error)
      res.status(500).json({ ok: false, error: 'No se pudo enviar el mensaje a los grupos seleccionados' })
    }
  })

  router.get('/groups', async (req, res) => {
    try {
      const session = req.session
      if (!(await ensureWhatsappReady(session, res))) return

      const search = normalizeText(req.query.q)
      const limit = Number.parseInt(req.query.limit, 10)
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true'

      if (session.cachedGroups.length > 0 && !forceRefresh) {
        const groups = filterGroupsForResponse(session.cachedGroups, { search, limit })
        refreshGroupsInBackground(session)

        return res.json({
          ok: true,
          ready: true,
          syncing: Boolean(session.groupsRefreshPromise),
          cached: true,
          refreshing: Boolean(session.groupsRefreshPromise),
          total: groups.length,
          cachedAt: session.cachedGroupsAt,
          groups,
        })
      }

      const groups = filterGroupsForResponse(
        await getAllGroups(session, { timeoutMs: Math.min(session.groupsSyncTimeoutMs || DEFAULT_GROUPS_SYNC_TIMEOUT_MS, 5_000) }),
        { search, limit },
      )

      res.json({
        ok: true,
        ready: true,
        syncing: false,
        cached: false,
        refreshing: false,
        total: groups.length,
        cachedAt: session.cachedGroupsAt,
        groups,
      })
    } catch (error) {
      if (error.code === 'GROUPS_SYNC_TIMEOUT') {
        return res.status(202).json({
          ok: false,
          ready: true,
          syncing: true,
          cached: false,
          refreshing: true,
          total: 0,
          groups: [],
          error: error.message,
        })
      }

      console.error('Error obteniendo grupos:', error)

      if (error.message?.includes('detached Frame')) {
        return res.status(503).json({
          ok: false,
          ready: false,
          error: 'WhatsApp Web se esta reconectando. Cierra instancias duplicadas del backend o espera unos segundos y vuelve a intentar.',
        })
      }

      res.status(500).json({ ok: false, error: error.message })
    }
  })

  router.get('/status', async (req, res) => {
    const status = await getWhatsappStatus(req.session)
    res.json(status)
  })

  router.get('/qr', (req, res) => {
    const session = req.session
    if (!session.lastQr || !session.lastQrDataUrl) {
      return res.status(404).json({ ok: false, available: false, error: 'No hay QR disponible en este momento' })
    }

    res.json({ ok: true, available: true, qr: session.lastQr, dataUrl: session.lastQrDataUrl })
  })

  router.post('/disconnect', async (req, res) => {
    try {
      const session = req.session

      if (!session.isClientReady && !session.client.info) {
        return res.status(400).json({ ok: false, error: 'No hay ninguna sesion activa para desconectar' })
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
      session.lastSessionMessage = 'Sesion desconectada. Generando un nuevo QR...'
      session.scheduler.stop()

      try {
        await session.client.logout()
      } catch (logoutError) {
        console.warn('No se pudo cerrar sesion con logout; forzando cierre del cliente:', logoutError?.message || logoutError)
        if (typeof session.client.destroy === 'function') {
          await session.client.destroy()
        } else {
          throw logoutError
        }
      }

      session.client.info = null
      session.manuallyDisconnected = false
      session.reinitializeClient()

      res.json({ ok: true, message: 'Sesion de WhatsApp desconectada. Generando un nuevo QR para reconectar.' })
    } catch (error) {
      console.error('Error al desconectar:', error)
      res.status(500).json({ ok: false, error: 'No se pudo desconectar la sesion' })
    }
  })

  router.get('/scheduled', (req, res) => {
    const all = req.session.scheduler.getAll()
    res.json({ ok: true, total: all.length, messages: all })
  })

  router.post('/scheduled', async (req, res) => {
    try {
      const session = req.session
      if (!(await ensureWhatsappReady(session, res))) return

      const { groups, message, scheduledAt, media } = req.body
      if (!Array.isArray(groups) || groups.length === 0 || !message || !scheduledAt) {
        return res.status(400).json({ ok: false, error: 'Faltan groups, message o scheduledAt' })
      }

      const scheduled = session.scheduler.create({ groups, message, scheduledAt, media })
      res.status(201).json({ ok: true, message: 'Mensaje programado', scheduled })
    } catch (error) {
      console.error('Error programando mensaje:', error)
      res.status(500).json({ ok: false, error: 'No se pudo programar el mensaje' })
    }
  })

  router.delete('/scheduled/:id', (req, res) => {
    const msg = req.session.scheduler.cancel(req.params.id)
    if (!msg) {
      return res.status(404).json({ ok: false, error: 'Mensaje no encontrado o ya fue enviado' })
    }
    res.json({ ok: true, message: 'Mensaje cancelado', scheduled: msg })
  })

  return router
}

function createApp(client, options = {}) {
  const app = express()
  app.use(express.json({ limit: '10mb' }))

  const session = {
    id: 'default',
    dataDir: options.dataDir || process.cwd(),
    client,
    scheduler: options.scheduler === false
      ? {
        getAll: () => [],
        create: () => null,
        cancel: () => null,
        stop: () => {},
        startChecker: () => {},
      }
      : {
        getAll: () => [],
        create: () => null,
        cancel: () => null,
        stop: () => {},
        startChecker: () => {},
      },
    isClientReady: false,
    lastQr: null,
    lastQrDataUrl: null,
    sessionStatus: 'starting',
    lastSessionMessage: 'Iniciando cliente de WhatsApp',
    cachedGroups: [],
    cachedGroupsAt: null,
    groupsRefreshPromise: null,
    manuallyDisconnected: false,
    reinitializeClient: options.reinitializeClient || (() => {}),
    usingChromeProfile: false,
    chromeRunning: false,
    groupsSyncTimeoutMs: options.groupsSyncTimeoutMs,
    groupsCachePersistence: options.groupsCachePersistence !== false,
  }

  const attachClientEvents = () => {
    client.on('qr', async (qr) => {
      session.manuallyDisconnected = false
      session.isClientReady = false
      session.sessionStatus = 'qr'
      session.lastQr = qr
      session.lastSessionMessage = 'Escanea el QR para iniciar sesion'

      try {
        session.lastQrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280 })
      } catch {
        session.lastQrDataUrl = null
      }

      try {
        qrcodeTerminal.generate(qr, { small: true })
      } catch {
        // Ignorar si no se puede generar en terminal.
      }
    })

    client.on('authenticated', () => {
      session.manuallyDisconnected = false
      session.sessionStatus = 'authenticated'
      session.lastSessionMessage = 'WhatsApp autenticado'
    })

    client.on('ready', () => {
      session.manuallyDisconnected = false
      session.isClientReady = true
      session.sessionStatus = 'ready'
      session.lastQr = null
      session.lastQrDataUrl = null
      session.lastSessionMessage = 'WhatsApp conectado correctamente'
      if (options.scheduler !== false) {
        session.scheduler.startChecker(client)
      }
    })

    client.on('initialization_failure', (error) => {
      session.isClientReady = false
      session.sessionStatus = 'initialization_failure'
      session.lastQr = null
      session.lastQrDataUrl = null
      session.lastSessionMessage = error?.message || String(error) || 'No se pudo inicializar WhatsApp Web'
    })

    client.on('auth_failure', (message) => {
      session.manuallyDisconnected = false
      session.isClientReady = false
      session.sessionStatus = 'auth_failure'
      session.lastQr = null
      session.lastQrDataUrl = null
      session.lastSessionMessage = message
    })

    client.on('disconnected', (reason) => {
      session.isClientReady = false
      session.sessionStatus = 'disconnected'
      session.lastSessionMessage = reason
    })
  }

  attachClientEvents()

  if (options.scheduler !== false) {
    session.scheduler.startChecker(client)
  }

  app.get('/', (req, res) => {
    res.json({ ok: true, message: 'Backend de recordatorios funcionando' })
  })

  app.use((req, res, next) => {
    req.session = session
    next()
  }, createSessionRouter())

  return app
}

module.exports = { createSessionRouter, createApp }

