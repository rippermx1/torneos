const paths = new Map([
  ['auth/session', 'GET'], ['auth/guest', 'POST'],
  ['games/factory-empire/sync', 'POST'], ['games/factory-empire/commands', 'POST'],
  ['planets', 'GET'], ['competition', 'GET'], ['competition/leaderboard', 'GET'],
])
export function referenceTarget(path: string, method: string, environment: string | undefined, configured?: string, search = ''): URL | null {
  const visit = /^planets\/[a-f0-9-]{36}\/visit$/.test(path)
  if (environment !== 'development' || (paths.get(path) !== method && !(visit && method === 'GET'))) return null
  const url = new URL(configured ?? 'http://127.0.0.1:8220')
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
  const target = new URL('/api/v1/' + path, url), params = new URLSearchParams(search)
  if (search) {
    if (method !== 'GET' || !['planets', 'competition/leaderboard'].includes(path)) return null
    for (const [key, value] of params) {
      if (params.getAll(key).length !== 1 || !['q', 'cursor', 'limit'].includes(key)) return null
      if (key === 'q' && (path !== 'planets' || value.length > 32)) return null
      if (key === 'cursor' && !/^[a-f0-9:\-]{1,57}$/.test(value)) return null
      if (key === 'limit' && (!/^\d{1,2}$/.test(value) || +value < 1 || +value > 50)) return null
    }
    target.search = params.toString()
  }
  return target
}
export function referenceCookie(raw: string): string {
  const match = raw.match(/(?:^|;\s*)fe_unity_session=([A-Za-z0-9_-]{20,100})(?:;|$)/)
  return match ? 'fe_session=' + match[1] : ''
}
