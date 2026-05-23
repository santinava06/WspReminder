const crypto = require('crypto')

const USERNAME = process.env.AUTH_USERNAME || 'admin'
const PASSWORD = process.env.AUTH_PASSWORD || 'admin123'
const tokens = new Set()

function login(username, password) {
  if (username !== USERNAME || password !== PASSWORD) return null
  const token = crypto.randomUUID()
  tokens.add(token)
  return token
}

function authenticate(token) {
  return tokens.has(token)
}

function logout(token) {
  tokens.delete(token)
}

module.exports = { login, authenticate, logout }
