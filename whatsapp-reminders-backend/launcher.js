const { spawn } = require('child_process')
const net = require('net')
const path = require('path')
const fs = require('fs')

const bridges = [
  { session: 'admin', port: 9001 },
  { session: 'erika', port: 9002 },
  { session: 'melina', port: 9003 },
  { session: 'academico-1', port: 9004 },
  { session: 'in', port: 9005 },
  { session: 'luciana', port: 9006 },
  { session: 'yanina', port: 9007 },
  { session: 'julieta', port: 9008 },
]

const MAX_RESTART_ATTEMPTS = 5
const MAX_RESTART_DELAY_MS = 30_000

const rootDir = __dirname
const logDir = path.join(rootDir, 'logs')
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port, '127.0.0.1')
  })
}

async function startBridge({ session, port }) {
  const logFile = path.join(logDir, `bridge-${session}.log`)
  let retryCount = 0

  async function launch() {
    const available = await checkPort(port)
    if (!available) {
      console.log(`Puerto ${port} ocupado, skipping ${session}`)
      return
    }

    const fd = fs.openSync(logFile, 'a')

    const child = spawn(process.execPath, [path.join(rootDir, 'bridge-server.js')], {
      cwd: rootDir,
      stdio: ['ignore', fd, fd],
      detached: false,
      env: {
        ...process.env,
        BRIDGE_PORT: String(port),
        BRIDGE_AUTH_DIR: path.join(rootDir, 'bridge-data', session),
        LOG_LEVEL: 'info',
      },
    })

    const started = new Date()
    console.log(`Bridge ${session} on port ${port} (PID ${child.pid})`)

    child.on('exit', (code, signal) => {
      const uptime = Math.round((Date.now() - started.getTime()) / 1000)
      console.log(`Bridge ${session} (port ${port}) exited code=${code} signal=${signal} uptime=${uptime}s`)
      if (retryCount < MAX_RESTART_ATTEMPTS) {
        retryCount++
        const delay = Math.min(1000 * Math.pow(2, retryCount), MAX_RESTART_DELAY_MS)
        console.log(`Reiniciando ${session} en ${delay}ms (intento ${retryCount}/${MAX_RESTART_ATTEMPTS})`)
        setTimeout(launch, delay)
      } else {
        console.error(`Bridge ${session} no se pudo reiniciar tras ${MAX_RESTART_ATTEMPTS} intentos`)
      }
    })

    child.on('error', (err) => {
      console.error(`Bridge ${session} error: ${err.message}`)
    })
  }

  await launch()
}

async function main() {
  console.log('Starting bridges...')
  console.log('Routes:')
  for (const b of bridges) {
    console.log(`  ${b.session} -> port ${b.port}`)
  }
  console.log('---')
  await Promise.all(bridges.map(startBridge))
  console.log('All bridges launched. Monitoring children...')
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
