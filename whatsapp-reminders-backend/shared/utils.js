/**
 * Convert a base64 string (with or without data URI prefix) to a Buffer.
 */
function base64ToBuffer(base64) {
  if (!base64) return null
  const raw = base64.includes(',') ? base64.split(',')[1] : base64
  return Buffer.from(raw, 'base64')
}

/**
 * Format a connectedAt ISO timestamp into a human-readable uptime string.
 * Returns null if no timestamp provided.
 */
function formatUptime(connectedAt) {
  if (!connectedAt) return null
  const diff = Date.now() - new Date(connectedAt).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS) || 15_000

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeout || FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...options, signal: options.signal || controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { base64ToBuffer, formatUptime, fetchWithTimeout }
