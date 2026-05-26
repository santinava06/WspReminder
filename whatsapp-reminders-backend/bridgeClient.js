const { fetchWithTimeout } = require('./shared/utils')

const BASE_URL = process.env.BRIDGE_URL || 'http://localhost:3178'

function createBridgeClient(bridgeUrl = BASE_URL) {
  let bridgeStatus = null
  let pollingTimer = null

  async function bridgeFetch(path, options = {}) {
    const url = `${bridgeUrl}${path}`
    const response = await fetchWithTimeout(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
    if (!response) throw new Error('No response from bridge (timeout)')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
    return data
  }

  async function pollStatus() {
    try { bridgeStatus = await bridgeFetch('/status') } catch (err) {
      // bridge not reachable yet, will retry
    }
  }

  function startPolling(intervalMs = 5000) {
    stopPolling()
    pollStatus()
    pollingTimer = setInterval(pollStatus, intervalMs)
  }

  function stopPolling() {
    if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null }
  }

  const client = {
    _bridgeUrl: bridgeUrl,

    get user() { return bridgeStatus?.info || null },

    get ws() { return { readyState: bridgeStatus?.ready ? 1 : 3 } },

    _syncFromBridge(s) { bridgeStatus = s || bridgeStatus },

    async sendMessage(groupId, messagePayload) {
      const text = typeof messagePayload === 'string' ? messagePayload : (messagePayload.text || messagePayload.caption || '')
      let media = null
      if (messagePayload.image) {
        media = { mimetype: 'image/jpeg', data: Buffer.from(messagePayload.image).toString('base64'), filename: 'image.jpg' }
      } else if (messagePayload.video) {
        media = { mimetype: 'video/mp4', data: Buffer.from(messagePayload.video).toString('base64'), filename: 'video.mp4' }
      } else if (messagePayload.audio) {
        media = { mimetype: messagePayload.ptt ? 'audio/ogg' : 'audio/mp4', data: Buffer.from(messagePayload.audio).toString('base64'), filename: 'audio' }
      }
      if (messagePayload.document) {
        media = { mimetype: messagePayload.mimetype || 'application/octet-stream', data: Buffer.from(messagePayload.document).toString('base64'), filename: messagePayload.fileName || 'file' }
      }
      await bridgeFetch('/send', { method: 'POST', body: JSON.stringify({ groupId, message: text, media }) })
    },

    async groupFetchAllParticipating() {
      const data = await bridgeFetch('/groups')
      const map = {}
      for (const g of (data.groups || [])) map[g.id] = { id: g.id, subject: g.name }
      return map
    },

    async logout() {
      await bridgeFetch('/disconnect', { method: 'POST' })
    },

    async requestPairingCode(phone) {
      const data = await bridgeFetch('/pair', { method: 'POST', body: JSON.stringify({ phone }) })
      return data
    },

    end() { stopPolling() },
  }

  return { client, startPolling, stopPolling }
}

module.exports = { createBridgeClient }
