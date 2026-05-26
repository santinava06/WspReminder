const express = require('express')
const { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, copyFileSync, rmSync } = require('fs')
const { join, resolve } = require('path')
const history = require('./history')
const logger = require('./logger')
const { buildBaileysMessage } = require('./shared/baileys')
const { formatUptime } = require('./shared/utils')

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
    logger.warn({ error: error?.message }, 'No se pudo leer cache de grupos')
    return { groups: [], cachedAt: null }
  }
}

const persistGroupsCache = (session, groups, cachedAt) => {
  try {
    const groupsCacheFile = getGroupsCacheFile(session)
    if (!existsSync(session.dataDir)) mkdirSync(session.dataDir, { recursive: true })
    writeFileSync(groupsCacheFile, JSON.stringify({ cachedAt, groups }, null, 2), 'utf8')
  } catch (error) {
    logger.warn({ error: error?.message }, 'No se pudo guardar cache de grupos')
  }
}

const clearPersistedGroupsCache = (session) => {
  try {
    const groupsCacheFile = getGroupsCacheFile(session)
    if (existsSync(groupsCacheFile)) unlinkSync(groupsCacheFile)
  } catch (error) {
    logger.warn({ error: error?.message }, 'No se pudo borrar cache de grupos')
  }
}

function formatPairingCode(code) {
  const value = typeof code === 'string' ? code : String(code || '')
  return value.includes('-') ? value : value.match(/.{1,4}/g)?.join('-') || value
}

function normalizePairingResponse(result) {
  if (result && typeof result === 'object' && 'code' in result) {
    return { ok: result.ok !== false, code: formatPairingCode(result.code) }
  }
  return { ok: true, code: formatPairingCode(result) }
}

const initializeSessionGroupsCache = (session) => {
  if (session.cachedGroupsAt !== null) return
  const persisted = readPersistedGroupsCache(session)
  session.cachedGroups = persisted.groups
  session.cachedGroupsAt = persisted.cachedAt
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const fetchGroupsFromWhatsapp = async (client) => {
  if (typeof client.groupFetchAllParticipating !== 'function') return []
  const groupsMap = await client.groupFetchAllParticipating()
  return Object.entries(groupsMap).map(([id, metadata]) => ({
    id,
    name: metadata.subject || '(sin nombre)',
  }))
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
    logger.warn({ error: error?.message }, 'No se pudo refrescar grupos en segundo plano')
  })
}

const sendReminderToGroups = async (session, groups, message, media = null) => {
  const results = []
  for (const group of groups) {
    try {
      const baileysMsg = buildBaileysMessage({ message, media })
      await session.client.sendMessage(group.id, baileysMsg)
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

const getWhatsappStatus = (session) => {
  const hasActiveSession = !session.manuallyDisconnected && (session.isClientReady || session.client?.user)

  let normalizedStatus = session.sessionStatus
  let normalizedMessage = session.lastSessionMessage

  if (hasActiveSession && ['starting', 'disconnected'].includes(session.sessionStatus)) {
    normalizedStatus = 'ready'
    normalizedMessage = 'WhatsApp conectado correctamente'
  }

  const user = session.client?.user
  const info = user ? {
    pushname: user.name || user.pushname || '',
    wid: { user: user.id ? user.id.split(':')[0].split('@')[0] : '' },
  } : null

  return {
    ready: hasActiveSession,
    status: normalizedStatus,
    message: normalizedMessage,
    info: session.manuallyDisconnected ? null : info,
    qr: !session.manuallyDisconnected && session.lastQrDataUrl
      ? { available: true, dataUrl: session.lastQrDataUrl }
      : { available: false, dataUrl: null },
    connection: {
      connectedAt: session.connectedAt || null,
      disconnectedAt: session.disconnectedAt || null,
      uptime: formatUptime(session.connectedAt),
      reconnectAttempts: session.reconnectAttempts || 0,
      healthCheckRunning: Boolean(session._healthInterval),
    },
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

  const status = getWhatsappStatus(session)

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
    res.json({
      ok: true,
      sessionId: req.session.id,
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

      const baileysMsg = buildBaileysMessage({ message, media })
      await session.client.sendMessage(groupId, baileysMsg)

      const groupInfo = session.cachedGroups.find(g => g.id === groupId) || { id: groupId, name: groupId }
      const results = [{ id: groupInfo.id, name: groupInfo.name, ok: true }]
      history.logSend(req.username || session.id, req.username || session.id, {
        message,
        results,
        hasMedia: !!media,
        mode: 'single',
      })

      res.json({ ok: true, message: 'Recordatorio enviado' })
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Error enviando mensaje')
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

      history.logSend(req.username || session.id, req.username || session.id, {
        message,
        results,
        hasMedia: !!media,
        mode: 'all',
      })

      res.json(formatSendResults(results))
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Error enviando mensaje a todos los grupos')
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
      history.logSend(req.username || session.id, req.username || session.id, {
        message,
        results,
        hasMedia: !!media,
        mode: 'selected',
      })
      res.json(formatSendResults(results))
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Error enviando mensaje a grupos seleccionados')
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

      logger.error({ error: error.message, stack: error.stack }, 'Error obteniendo grupos')
      res.status(500).json({ ok: false, error: error.message })
    }
  })

  router.get('/status', (req, res) => {
    res.json(getWhatsappStatus(req.session))
  })

  router.get('/qr', (req, res) => {
    const session = req.session
    if (!session.lastQr || !session.lastQrDataUrl) {
      return res.status(404).json({ ok: false, available: false, error: 'No hay QR disponible en este momento' })
    }
    res.json({ ok: true, available: true, qr: session.lastQr, dataUrl: session.lastQrDataUrl })
  })

  function clearSessionAuth(session) {
    const authPath = join(session.dataDir, 'auth')
    try {
      if (existsSync(authPath)) {
        rmSync(authPath, { recursive: true, force: true })
      }
    } catch (err) {
      logger.warn({ sessionId: session.id, error: err.message }, 'Could not clear auth directory')
    }
  }

  router.post('/pair', async (req, res) => {
    try {
      const { phone } = req.body
      const normalizedPhone = String(phone || '').replace(/\D/g, '')
      if (!normalizedPhone.match(/^\d{7,15}$/)) {
        return res.status(400).json({ ok: false, error: 'Numero invalido. Ingresa solo digitos (ej: 541161234567)' })
      }
      if (req.session.isClientReady || req.session.client?.user) {
        return res.status(400).json({ ok: false, error: 'WhatsApp ya esta conectado para esta sesion' })
      }
      if (!req.session.client || typeof req.session.client.requestPairingCode !== 'function') {
        return res.status(503).json({ ok: false, error: 'La sesion todavia no esta lista para pedir codigo de vinculacion' })
      }
      const data = await req.session.client.requestPairingCode(normalizedPhone)
      res.json(normalizePairingResponse(data))
    } catch (err) {
      logger.error({ err: err.message }, 'Error pairing')
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  router.post('/disconnect', async (req, res) => {
    try {
      const session = req.session

      if (!session.isClientReady && !session.client?.user) {
        return res.status(400).json({ ok: false, error: 'No hay ninguna sesion activa para desconectar' })
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
      session.lastSessionMessage = 'Sesion desconectada. Generando un nuevo QR...'
      session.scheduler.stop()
      if (typeof session.stopHealthCheck === 'function') session.stopHealthCheck()
      if (session._bridgePollTimer) { clearInterval(session._bridgePollTimer); session._bridgePollTimer = null }
      if (typeof session._bridgeStopPolling === 'function') session._bridgeStopPolling()

      try {
        await session.client.logout()
      } catch (logoutError) {
        logger.warn({ error: logoutError?.message }, 'No se pudo cerrar sesion con logout')
      }

      if (session.client && typeof session.client.end === 'function') {
        try { session.client.end() } catch (endErr) {
          logger.warn({ error: endErr?.message }, 'Error al cerrar socket')
        }
      }

      clearSessionAuth(session)
      session.manuallyDisconnected = false
      session.reinitializeClient()

      res.json({ ok: true, message: 'Sesion de WhatsApp desconectada. Generando un nuevo QR para reconectar.' })
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Error al desconectar')
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

      const schedAt = new Date(scheduledAt)
      if (isNaN(schedAt.getTime()) || schedAt.getTime() <= Date.now()) {
        return res.status(400).json({ ok: false, error: 'La fecha programada debe ser en el futuro' })
      }

      const scheduled = session.scheduler.create({ groups, message, title: req.body.title, scheduledAt, media, username: req.username || session.id })
      res.status(201).json({ ok: true, message: 'Mensaje programado', scheduled })
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Error programando mensaje')
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

  router.post('/scheduled/:id/send-now', async (req, res) => {
    try {
      const session = req.session
      if (!(await ensureWhatsappReady(session, res))) return

      const msg = await session.scheduler.sendNow(session.client, req.params.id)
      if (!msg) {
        return res.status(400).json({ ok: false, error: 'Mensaje no encontrado o ya fue enviado' })
      }

      history.logSend(req.username || session.id, req.username || session.id, {
        message: msg.message,
        results: msg.results,
        hasMedia: !!msg.media,
        mode: 'send-now',
      })

      res.json({ ok: true, message: 'Mensaje enviado', scheduled: msg })
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Error enviando ahora')
      res.status(500).json({ ok: false, error: 'No se pudo enviar el mensaje' })
    }
  })

  router.delete('/scheduled/:id/remove', (req, res) => {
    const removed = req.session.scheduler.remove(req.params.id)
    if (!removed) {
      return res.status(404).json({ ok: false, error: 'Mensaje no encontrado' })
    }
    res.json({ ok: true, message: 'Mensaje eliminado' })
  })

  return router
}

module.exports = { createSessionRouter, clearPersistedGroupsCache }
