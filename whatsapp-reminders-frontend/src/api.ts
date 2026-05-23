const AUTH_TOKEN_KEY = 'auth_token'
const SESSION_ID_KEY = 'session_id'

export function getStoredSessionId(): string {
  return localStorage.getItem(SESSION_ID_KEY) || 'default'
}

export function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY)
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(input, { ...init, headers })
  if ((response.status === 401 || response.status === 403) && token) {
    clearToken()
    localStorage.removeItem('session_id')
    window.location.reload()
  }
  return response
}
