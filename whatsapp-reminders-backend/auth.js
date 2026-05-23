const crypto = require('crypto')

const USERS = {
  admin1: { password: '1234' },
  admin2: { password: '1234' },
  admin3: { password: '1234' },
  admin4: { password: '1234' },
  admin5: { password: '1234' },
}

const SALT = 'wsp2024'

function generateToken(username, password) {
  return crypto.createHash('sha256').update(`${username}:${password}:${SALT}`).digest('hex')
}

function login(username, password) {
  const user = USERS[username]
  if (!user || user.password !== password) return null
  return { token: generateToken(username, password), sessionId: username }
}

function authenticate(token) {
  for (const username of Object.keys(USERS)) {
    if (token === generateToken(username, USERS[username].password)) {
      return { username, sessionId: username }
    }
  }
  return null
}

module.exports = { login, authenticate }
