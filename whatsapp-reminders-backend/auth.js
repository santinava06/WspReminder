const crypto = require('crypto')

const USERS = {
  admin1: { password: '1234', sessionId: 'default' },
  admin2: { password: '1234', sessionId: 'sesion-2' },
  admin3: { password: '1234', sessionId: 'sesion-3' },
  admin4: { password: '1234', sessionId: 'sesion-4' },
  admin5: { password: '1234', sessionId: 'sesion-5' },
}

const tokenMap = new Map()

function login(username, password) {
  const user = USERS[username]
  if (!user || user.password !== password) return null
  const token = crypto.randomUUID()
  tokenMap.set(token, { username, sessionId: user.sessionId })
  for (const [t, info] of tokenMap) {
    if (info.username === username && t !== token) tokenMap.delete(t)
  }
  return { token, sessionId: user.sessionId }
}

function authenticate(token) {
  return tokenMap.get(token) || null
}

function logout(token) {
  tokenMap.delete(token)
}

module.exports = { login, authenticate, logout }
