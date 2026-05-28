const http = require('http')
const logger = require('./logger')

const BRIDGE_PORTS = {
  'admin': 9001,
  'erika': 9002,
  'melina': 9003,
  'academico-1': 9004,
  'in': 9005,
  'luciana': 9006,
  'yanina': 9007,
  'julieta': 9008,
}

const PROXY_PORT = Number(process.env.PROXY_PORT) || 9090

function fetchBridgeStatus(session, port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/status`, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(5000, () => { req.destroy(); resolve(null) })
  })
}

const server = http.createServer(async (req, res) => {
  // Health endpoint: check all bridge servers
  if (req.url === '/health') {
    const entries = Object.entries(BRIDGE_PORTS)
    const results = await Promise.all(entries.map(([session, port]) =>
      fetchBridgeStatus(session, port).then(status => ({
        session,
        port,
        ready: status?.ready || false,
        status: status?.status || 'unreachable',
        message: status?.message || 'Bridge no responde',
        info: status?.info || null,
        connection: status?.connection || null,
      }))
    ))
    const healthy = results.filter(r => r.ready)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      ok: true,
      proxy: { port: PROXY_PORT, uptime: Math.floor(process.uptime()) },
      total: results.length,
      healthy: healthy.length,
      degraded: results.length - healthy.length,
      bridges: results,
      timestamp: new Date().toISOString(),
    }))
    return
  }

  const parts = req.url.split('/')
  const sessionId = parts[1]
  const targetPath = '/' + parts.slice(2).join('/')

  const port = BRIDGE_PORTS[sessionId]
  if (!port) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Unknown session: ' + sessionId }))
    return
  }

  const options = {
    hostname: '127.0.0.1',
    port,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers, host: '127.0.0.1:' + port },
  }

  const proxyReq = http.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers }
    delete headers['transfer-encoding']
    res.writeHead(proxyRes.statusCode, headers)
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    logger.error({ err: err.message, sessionId }, 'Bridge proxy error')
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: err.message }))
    }
  })

  req.pipe(proxyReq)
})

server.listen(PROXY_PORT, '0.0.0.0', () => {
  logger.info({ port: PROXY_PORT }, 'Bridge proxy listening')
  console.log('Bridge proxy running on http://localhost:' + PROXY_PORT)
  console.log('Routes:')
  for (const [session, port] of Object.entries(BRIDGE_PORTS)) {
    console.log('  /' + session + '/* -> localhost:' + port + '/*')
  }
})

process.on('uncaughtException', (err) => {
  logger.error({ err: err.message }, 'Bridge proxy uncaught exception')
})
