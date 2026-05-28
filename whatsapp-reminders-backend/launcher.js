const { spawn } = require('child_process')
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

const rootDir = __dirname
const logDir = path.join(rootDir, 'logs')
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })

function startBridge({ session, port }) {
  const logFile = path.join(logDir, `bridge-${session}.log`)
  const fd = fs.openSync(logFile, 'a')

  const child = spawn(process.execPath, [path.join(rootDir, 'bridge-server.js')], {
    cwd: rootDir,
    stdio: ['ignore', fd, fd],
    detached: true,
    env: {
      ...process.env,
      BRIDGE_PORT: String(port),
      BRIDGE_AUTH_DIR: path.join(rootDir, 'bridge-data', session),
      LOG_LEVEL: 'info',
    },
  })

  child.unref()
  console.log(`Bridge ${session} on port ${port} (PID ${child.pid})`)
}

for (const b of bridges) {
  startBridge(b)
}

console.log('All bridges launched.')
process.exit(0)
