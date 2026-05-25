const crypto = require('crypto')

const USERS = [
  { username: 'admin', password: 'Admin2024!', sessionId: 'admin', displayName: 'Admin' },
  { username: 'comercial1', password: 'Com1#2024', sessionId: 'comercial-1', displayName: 'Comercial 1' },
  { username: 'comercial2', password: 'Com2#2024', sessionId: 'comercial-2', displayName: 'Comercial 2' },
  { username: 'academico1', password: 'Acad1#2024', sessionId: 'academico-1', displayName: 'Académico 1' },
  { username: 'in', password: 'IN#2024', sessionId: 'in', displayName: 'IN' },
  { username: 'luciana', password: 'in2024', sessionId: 'luciana', displayName: 'Luciana' },
]

const userMap = Object.fromEntries(USERS.map(u => [u.username, u]))

const SALT = 'wsp2024'

function generateToken(username, password) {
  return crypto.createHash('sha256').update(`${username}:${password}:${SALT}`).digest('hex')
}

function login(username, password) {
  const user = userMap[username]
  if (!user || user.password !== password) return null
  return { token: generateToken(username, password), sessionId: user.sessionId, displayName: user.displayName, username: user.username }
}

function authenticate(token) {
  for (const user of USERS) {
    if (token === generateToken(user.username, user.password)) {
      return { username: user.username, sessionId: user.sessionId, displayName: user.displayName }
    }
  }
  return null
}

const sessionToUser = Object.fromEntries(USERS.map(u => [u.sessionId, u]))

function getUserBySessionId(sessionId) {
  return sessionToUser[sessionId] || null
}

module.exports = { login, authenticate, getUserBySessionId, USERS }
