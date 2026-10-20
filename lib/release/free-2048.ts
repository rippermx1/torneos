import profile from '@/config/2048-free-release.json'

const expected = {
  version: 1,
  profile: '2048-free-v1',
  rewarded: 'demo',
  ticket: 'informational_unavailable',
  money: 'blocked',
} as const

// This release has one fixed contract. An environment variable cannot activate money.
if (Object.keys(profile).length !== Object.keys(expected).length
  || Object.entries(expected).some(([key, value]) => profile[key as keyof typeof profile] !== value)) {
  throw new Error('Invalid fixed 2048 free release profile')
}

export const FREE_2048_RELEASE = Object.freeze({ ...expected })
export const FREE_2048_MONEY_DISABLED_CODE = 'MONEY_DISABLED_FREE_RELEASE' as const

/** Used only for denial, never to rewrite a request or widen its authorization. */
export function canonicalFree2048Path(pathname: string): string | null {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.length > 8192) return null
  let decoded = pathname
  try {
    // Nested encodings must not turn into a different monetary path after this guard.
    for (let round = 0; decoded.includes('%') && round < 8; round++) decoded = decodeURIComponent(decoded)
  } catch { return null }
  if (decoded.includes('%') || /[\u0000-\u0020\u007f?#]/.test(decoded)) return null
  const segments: string[] = []
  for (const segment of decoded.replaceAll('\\', '/').toLowerCase().split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return '/' + segments.join('/')
}

const monetaryRoots = [
  '/wallet', '/api/wallet',
  '/admin/payouts', '/admin/refunds', '/admin/payments',
  '/api/admin/payouts', '/api/admin/refunds', '/api/admin/payments',
  '/api/payouts', '/api/webhooks/flow', '/api/local-flow', '/dev/flow',
  '/api/cron/flow-reconcile', '/api/cron/reconcile-refunds', '/api/cron/process-tournaments',
] as const
const within = (pathname: string, root: string) => pathname === root || pathname.startsWith(root + '/')

export function isFree2048MoneyPathBlocked(pathname: string, method: string): boolean {
  const canonical = canonicalFree2048Path(pathname)
  // Ambiguous paths fail closed without reaching Auth, a financial handler or a database.
  if (canonical === null) return true
  if (monetaryRoots.some(root => within(canonical, root))) return true
  if (/^\/(?:api\/)?tournaments\/[^/]+\/checkout(?:\/|$)/.test(canonical)) return true
  if (/^\/(?:api\/)?admin\/users\/[^/]+\/wallet(?:\/|$)/.test(canonical)) return true
  if (within(canonical, '/admin/accounting') || within(canonical, '/api/admin/accounting')) {
    return !['GET', 'HEAD'].includes(method.toUpperCase())
  }
  return false
}

/** These handlers may close/cancel or otherwise touch legacy monetary tournaments. */
export function getFree2048TournamentId(pathname: string): string | null {
  const canonical = canonicalFree2048Path(pathname)
  if (canonical === null) return null
  const player = /^\/api\/tournaments\/([^/]+)\/(?:register|game)(?:\/|$)/.exec(canonical)
  const admin = /^\/api\/admin\/tournaments\/([^/]+)\/(?:cancel|finalize|integrity)(?:\/|$)/.exec(canonical)
  return player?.[1] ?? admin?.[1] ?? null
}
