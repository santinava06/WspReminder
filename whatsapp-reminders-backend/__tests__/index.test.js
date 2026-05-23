import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'

function makeMockClient() {
  const handlers = {}
  const client = {
    _handlers: handlers,
    _chats: [],
    initialize: () => {},
    on: (event, handler) => { handlers[event] = handler },
    getChats: () => Promise.resolve([...client._chats]),
    getState: () => Promise.reject(new Error('No esta autenticado')),
    sendMessage: () => Promise.resolve(),
    logout: () => Promise.resolve(true),
    info: null,
  }
  return client
}

let app
let mockClient

beforeEach(() => {
  mockClient = makeMockClient()
  app = createApp(mockClient, { scheduler: false, groupsCachePersistence: false })
})

function triggerReady(client) {
  if (client._handlers.ready) client._handlers.ready()
  if (client._handlers.authenticated) client._handlers.authenticated()
}

describe('GET /', () => {
  it('responde con ok: true', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, message: 'Backend de recordatorios funcionando' })
  })
})

describe('Sin sesion lista', () => {
  it('GET /status retorna ready: false', async () => {
    const res = await request(app).get('/status')
    expect(res.status).toBe(200)
    expect(res.body.ready).toBe(false)
    expect(res.body.qr).toEqual({ available: false, dataUrl: null })
  })

  it('GET /groups retorna 503', async () => {
    const res = await request(app).get('/groups')
    expect(res.status).toBe(503)
    expect(res.body.ok).toBe(false)
  })

  it('POST /send-group-reminder retorna 503', async () => {
    const res = await request(app)
      .post('/send-group-reminder')
      .send({ groupId: 'g1', message: 'hola' })
    expect(res.status).toBe(503)
  })

  it('GET /qr retorna 404', async () => {
    const res = await request(app).get('/qr')
    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
  })
})

describe('Con sesion lista', () => {
  beforeEach(() => {
    triggerReady(mockClient)
  })

  it('GET /status retorna ready: true', async () => {
    const res = await request(app).get('/status')
    expect(res.status).toBe(200)
    expect(res.body.ready).toBe(true)
  })

  it('GET /groups filtra solo grupos (isGroup=true)', async () => {
    mockClient._chats.push(
      { id: { _serialized: 'g1@c.us' }, name: 'Familia', isGroup: true },
      { id: { _serialized: 'c1@c.us' }, name: 'Juan', isGroup: false },
      { id: { _serialized: 'g2@c.us' }, name: 'Trabajo', isGroup: true },
    )

    const res = await request(app).get('/groups')
    expect(res.status).toBe(200)
    expect(res.body.groups).toHaveLength(2)
    expect(res.body.groups[0].name).toBe('Familia')
    expect(res.body.groups[1].name).toBe('Trabajo')
  })

  it('GET /groups puede leer grupos directo desde la pagina sin metadata pesada', async () => {
    mockClient.getChats = vi.fn(() => Promise.reject(new Error('getChats no deberia llamarse')))
    mockClient.pupPage = {
      evaluate: vi.fn(() => Promise.resolve([
        { id: 'g2@g.us', name: 'Trabajo' },
        { id: 'g1@g.us', name: 'Familia' },
      ])),
    }

    const res = await request(app).get('/groups')

    expect(res.status).toBe(200)
    expect(res.body.groups).toEqual([
      { id: 'g1@g.us', name: 'Familia' },
      { id: 'g2@g.us', name: 'Trabajo' },
    ])
    expect(mockClient.getChats).not.toHaveBeenCalled()
  })

  it('GET /groups normaliza acentos en la busqueda', async () => {
    mockClient._chats.push(
      { id: { _serialized: 'g1@c.us' }, name: 'Familia', isGroup: true },
      { id: { _serialized: 'g2@c.us' }, name: 'Trabajo', isGroup: true },
      { id: { _serialized: 'g3@c.us' }, name: 'Futbol', isGroup: true },
    )

    const res = await request(app).get('/groups?q=fu')
    expect(res.status).toBe(200)
    expect(res.body.groups).toHaveLength(1)
    expect(res.body.groups[0].name).toBe('Futbol')
  })

  it('GET /groups respeta el parametro limit', async () => {
    mockClient._chats.push(
      { id: { _serialized: 'g1@c.us' }, name: 'A', isGroup: true },
      { id: { _serialized: 'g2@c.us' }, name: 'B', isGroup: true },
      { id: { _serialized: 'g3@c.us' }, name: 'C', isGroup: true },
      { id: { _serialized: 'g4@c.us' }, name: 'D', isGroup: true },
    )

    const res = await request(app).get('/groups?limit=2')
    expect(res.status).toBe(200)
    expect(res.body.groups).toHaveLength(2)
  })

  it('GET /groups devuelve cache inmediatamente mientras refresca en segundo plano', async () => {
    mockClient._chats.push(
      { id: { _serialized: 'g1@c.us' }, name: 'Familia', isGroup: true },
    )

    const firstRes = await request(app).get('/groups')
    expect(firstRes.status).toBe(200)
    expect(firstRes.body.cached).toBe(false)

    mockClient._chats.push(
      { id: { _serialized: 'g2@c.us' }, name: 'Trabajo', isGroup: true },
    )
    mockClient.getChats = vi.fn(() => new Promise(() => {}))

    const cachedRes = await request(app).get('/groups')

    expect(cachedRes.status).toBe(200)
    expect(cachedRes.body.cached).toBe(true)
    expect(cachedRes.body.refreshing).toBe(true)
    expect(cachedRes.body.groups).toEqual([
      { id: 'g1@c.us', name: 'Familia' },
    ])
  })

  it('GET /groups responde syncing si WhatsApp tarda en entregar los chats', async () => {
    mockClient.getChats = () => new Promise(() => {})
    app = createApp(mockClient, { scheduler: false, groupsCachePersistence: false, groupsSyncTimeoutMs: 5 })
    triggerReady(mockClient)

    const res = await request(app).get('/groups')

    expect(res.status).toBe(202)
    expect(res.body.syncing).toBe(true)
  })

  it('POST /send-group-reminder valida groupId faltante', async () => {
    const res = await request(app)
      .post('/send-group-reminder')
      .send({ message: 'Hola' })
    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
  })

  it('POST /send-group-reminder valida message faltante', async () => {
    const res = await request(app)
      .post('/send-group-reminder')
      .send({ groupId: 'g1@c.us' })
    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
  })

  it('POST /send-group-reminder con media', async () => {
    const sendSpy = vi.spyOn(mockClient, 'sendMessage')
    const res = await request(app)
      .post('/send-group-reminder')
      .send({
        groupId: 'g1@c.us',
        message: 'Hola',
        media: { mimetype: 'image/jpeg', data: 'abc123', filename: 'foto.jpg' },
      })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(sendSpy).toHaveBeenCalled()
  })

  it('POST /send-selected-group-reminders con media', async () => {
    mockClient._chats.push(
      { id: { _serialized: 'g1@c.us' }, name: 'Grupo1', isGroup: true },
    )
    const res = await request(app)
      .post('/send-selected-group-reminders')
      .send({
        groupIds: ['g1@c.us'],
        message: 'Hola',
        media: { mimetype: 'image/png', data: 'xyz789', filename: 'img.png' },
      })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('POST /disconnect desconecta la sesion activa', async () => {
    const res = await request(app).post('/disconnect')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const statusRes = await request(app).get('/status')
    expect(statusRes.body.ready).toBe(false)
    expect(statusRes.body.status).toBe('starting')
  })

  it('POST /disconnect reinicia el cliente para generar un nuevo QR', async () => {
    const reinitializeClient = vi.fn()
    app = createApp(mockClient, { scheduler: false, groupsCachePersistence: false, reinitializeClient })
    triggerReady(mockClient)

    const res = await request(app).post('/disconnect')
    expect(res.status).toBe(200)

    await new Promise(resolve => setTimeout(resolve, 650))
    expect(reinitializeClient).toHaveBeenCalledTimes(1)
  })

  it('POST /disconnect bloquea envios posteriores aunque el cliente quede en memoria', async () => {
    const res = await request(app).post('/disconnect')
    expect(res.status).toBe(200)

    const sendRes = await request(app)
      .post('/send-group-reminder')
      .send({ groupId: 'g1@c.us', message: 'hola' })

    expect(sendRes.status).toBe(503)
    expect(sendRes.body.ready).toBe(false)
  })

  it('POST /disconnect oculta la info de cuenta aunque client.info siga cargado', async () => {
    mockClient.info = { pushname: 'Santi', wid: { user: '5491111111111' } }

    const res = await request(app).post('/disconnect')
    expect(res.status).toBe(200)

    const statusRes = await request(app).get('/status')
    expect(statusRes.body.ready).toBe(false)
    expect(statusRes.body.info).toBeNull()
    expect(statusRes.body.qr).toEqual({ available: false, dataUrl: null })
  })
})
