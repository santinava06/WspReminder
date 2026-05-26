const { base64ToBuffer } = require('./utils')

/**
 * Build a Baileys-compatible message object from a payload with optional media.
 * Supports image, video, audio (ptt), and document types.
 */
function buildBaileysMessage(payload) {
  const msg = {}
  const text = payload.message || payload.text || ''
  const media = payload.media || null

  if (!media) {
    msg.text = text
    return msg
  }

  const buffer = base64ToBuffer(media.data)
  if (!buffer) {
    msg.text = text
    return msg
  }

  const mimetype = (media.mimetype || '').toLowerCase()
  const filename = media.filename || ''

  if (mimetype.startsWith('image/')) {
    msg.image = buffer
    if (text) msg.caption = text
  } else if (mimetype.startsWith('video/')) {
    msg.video = buffer
    if (text) msg.caption = text
  } else if (mimetype.startsWith('audio/')) {
    msg.audio = buffer
    msg.ptt = mimetype.includes('ogg')
  } else {
    msg.document = buffer
    msg.mimetype = mimetype || 'application/octet-stream'
    msg.fileName = filename || 'file'
    if (text) msg.caption = text
  }

  return msg
}

module.exports = { buildBaileysMessage }
