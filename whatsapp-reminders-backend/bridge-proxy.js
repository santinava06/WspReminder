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

const server = http.createServer((req, res) => {
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
