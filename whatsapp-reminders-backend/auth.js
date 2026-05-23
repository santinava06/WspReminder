const crypto = require('crypto')

const USERS = [
  { username: 'admin', password: '1234', sessionId: 'admin', displayName: 'Admin' },
  { username: 'comercial1', password: '1234', sessionId: 'comercial-1', displayName: 'Comercial 1' },
  { username: 'comercial2', password: '1234', sessionId: 'comercial-2', displayName: 'Comercial 2' },
  { username: 'academico1', password: '1234', sessionId: 'academico-1', displayName: 'Académico 1' },
  { username: 'in', password: '1234', sessionId: 'in', displayName: 'IN' },
]

const userMap = Object.fromEntries(USERS.map(u => [u.username, u]))

const SALT = 'wsp2024'

function generateToken(username, password) {
  return crypto.createHash('sha256').update(`${username}:${password}:${SALT}`).digest('hex')
}

function login(username, password) {
  const user = userMap[username]
  if (!user || user.password !== password) return null
  return { token: generateToken(username, password), sessionId: user.sessionId, displayName: user.displayName }
}

function authenticate(token) {
  for (const user of USERS) {
    if (token === generateToken(user.username, user.password)) {
      return { username: user.username, sessionId: user.sessionId, displayName: user.displayName }
    }
  }
  return null
}

module.exports = { login, authenticate }
