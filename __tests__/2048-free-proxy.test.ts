import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
// The installed Next 16.3.8 runtime still exports the legacy name for this helper.
import { unstable_doesMiddlewareMatch as doesProxyMatch } from 'next/experimental/testing/server'
import { buildCommunityFreeTournamentFields } from '@/lib/tournament/community-free'

const mocks = vi.hoisted(() => ({ origin: 'https://torneos.example', getUser: vi.fn(), factory: vi.fn(), serverUrl: vi.fn(), key: vi.fn(),
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), read: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: (...args: unknown[]) => mocks.factory(...args) }))
vi.mock('@/lib/env', () => ({
  getAllowedOrigins: () => [mocks.origin], getAppUrl: () => mocks.origin,
  getSupabaseBrowserKey: mocks.key, getSupabaseServerUrl: mocks.serverUrl,
  getSupabaseUrl: () => 'https://fixture.supabase.co', getSupabaseCookieOptions: () => ({ name: 'sb-test-auth-token' }),
}))
import { proxy, config } from '../proxy'

const request = (path: string, method = 'POST', origin = mocks.origin) => new NextRequest(mocks.origin + path, { method,
  headers: { origin, ...(method === 'POST' ? { 'next-action': 'fixture-server-action' } : {}) } })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'fixture-account' } }, error: null })
  mocks.factory.mockReturnValue({ auth: { getUser: mocks.getUser }, from: mocks.from })
  mocks.from.mockReturnValue({ select: mocks.select }); mocks.select.mockReturnValue({ eq: mocks.eq })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.read })
  mocks.read.mockResolvedValue({ data: { id: 'event', ...buildCommunityFreeTournamentFields({
    registrationOpensAt: '2026-10-19T15:00:00Z', playWindowStart: '2026-10-20T15:00:00Z',
  }) }, error: null })
  mocks.serverUrl.mockReturnValue('https://fixture.supabase.co'); mocks.key.mockReturnValue('test-public-key')
})

describe('free release denial before Supabase and preflight', () => {
  it.each(['/wallet', '/api/wallet/deposit/flow/create', '/api/tournaments/event/checkout/flow/create',
    '/api/webhooks/flow', '/api/webhooks/flow/refund', '/admin/payouts', '/api/admin/refunds/event/retry',
    '/api/admin/payments/event/reverify', '/admin/users/user/wallet', '/api/payouts/event/receipt',
    '/api/local-flow/payment/create', '/dev/flow/payment', '/api/cron/process-tournaments',
    '/api/cron/flow-reconcile', '/api/cron/reconcile-refunds', '/api/admin/accounting', '/admin/accounting'])(
    'returns private 423 without any Auth/client for %s', async path => {
      mocks.factory.mockImplementation(() => { throw new Error('Financial denial must precede Auth') })
      for (const method of ['POST', 'OPTIONS']) {
        const response = await proxy(request(path, method))
        expect(response.status).toBe(423)
        expect(await response.json()).toEqual({ error: 'El dinero real no está disponible en esta versión gratuita.', code: 'MONEY_DISABLED_FREE_RELEASE' })
        expect(response.headers.get('cache-control')).toBe('private, no-store')
        expect(response.headers.get('location')).toBeNull(); expect(response.headers.get('x-middleware-next')).toBeNull()
        expect(response.headers.get('access-control-allow-origin')).toBeNull()
      }
      expect(mocks.factory).not.toHaveBeenCalled(); expect(mocks.getUser).not.toHaveBeenCalled()
      expect(mocks.serverUrl).not.toHaveBeenCalled(); expect(mocks.key).not.toHaveBeenCalled()
    })

  it.each(['/api/%77allet/deposit/flow/create/', '/%61pi/wallet/private.json', '/%61pi%2Fwallet/receipt.csv',
    '/api/%2577allet/deposit/flow/create', '/api/tournaments/event/%63heckout/flow/create/', '/api/%GG/wallet'])(
    'matches and denies encoded, trailing or malformed monetary URL %s', async path => {
      expect(doesProxyMatch({ config, nextConfig: {}, url: path })).toBe(true)
      expect((await proxy(request(path))).status).toBe(423)
      expect(mocks.factory).not.toHaveBeenCalled()
    })

  it('does not let unauthenticated or authenticated money GET requests reach a client', async () => {
    for (const path of ['/wallet', '/api/wallet/deposit/flow/return', '/api/webhooks/flow', '/admin/payments']) {
      expect((await proxy(request(path, 'GET'))).status).toBe(423)
    }
    expect(mocks.factory).not.toHaveBeenCalled(); expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('retains allowed-origin preflight without invoking Auth for free writes', async () => {
    const response = await proxy(request('/api/2048/activity', 'OPTIONS'))
    expect(response.status).toBe(204); expect(response.headers.get('access-control-allow-origin')).toBe(mocks.origin)
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
    expect(mocks.factory).not.toHaveBeenCalled(); expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('does not grant cross-origin preflight to an untrusted origin', async () => {
    const response = await proxy(request('/api/2048/activity', 'OPTIONS', 'https://other.example'))
    expect(response.status).toBe(204); expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(mocks.factory).not.toHaveBeenCalled()
  })

  it.each(['/play', '/play/2048/ticket', '/api/2048/daily', '/api/2048/activity', '/api/tournaments/event/register',
    '/api/tournaments/event/game/start', '/api/admin/tournaments', '/admin/tournaments/new',
    '/api/admin/reports/2048-retention', '/admin/reports/2048-trial', '/api/admin/accounting',
    '/api/admin/reports/accounting.csv', '/auth/callback', '/admin/mfa/challenge', '/api/support/dispute',
    '/api/cron/report-failure', '/api/cron/watchdog'])(
    'preserves existing authenticated admission and headers for %s', async path => {
      const response = await proxy(request(path, 'GET'))
      expect(response.headers.get('x-middleware-next')).toBe('1')
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
      expect(mocks.factory).toHaveBeenCalledOnce(); expect(mocks.getUser).toHaveBeenCalledOnce()
    })

  it('retains guest admission to daily/activity and private report redirection', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    for (const path of ['/api/2048/daily', '/api/2048/activity']) {
      expect((await proxy(request(path, 'GET'))).headers.get('x-middleware-next')).toBe('1')
    }
    const response = await proxy(request('/admin/reports/2048-trial', 'GET'))
    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!).pathname).toBe('/sign-in')
  })

  it.each(['/api/tournaments/event/register', '/api/tournaments/event/game/start', '/api/tournaments/event/game/move',
    '/api/tournaments/event/game/timeout', '/api/admin/tournaments/event/cancel', '/api/admin/tournaments/event/finalize',
    '/api/admin/tournaments/event/integrity', '/api/tournaments/event/%67ame/start/'])(
    'admits only the complete exact zero-money tournament for %s', async path => {
      const response = await proxy(request(path))
      expect(response.headers.get('x-middleware-next')).toBe('1')
      expect(mocks.getUser).toHaveBeenCalledOnce(); expect(mocks.from).toHaveBeenCalledExactlyOnceWith('tournaments')
      expect(mocks.eq).toHaveBeenCalledExactlyOnceWith('id', 'event')
      expect(mocks.select.mock.calls[0][0]).toContain('prize_1st_cents')
      expect(mocks.select.mock.calls[0][0]).toContain('registration_opens_at')
      expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.from.mock.invocationCallOrder[0])
    })

  it.each([null, { id: 'event', preset_key: 'community_free_v1', entry_fee_cents: 0 },
    { entry_fee_cents: 500000 }, { prize_1st_cents: 1 }, { is_test: true }, { business_rule_version: 3 },
    { skill_tier: 'novato' }, { max_players: 16 }, { max_game_duration_seconds: 600 },
    { play_window_end: '2026-10-22T15:00:00Z' }, { id: 'another-event' }])(
    'denies incomplete/legacy/altered tournament data %j', async patch => {
      const complete = { id: 'event', ...buildCommunityFreeTournamentFields({
        registrationOpensAt: '2026-10-19T15:00:00Z', playWindowStart: '2026-10-20T15:00:00Z',
      }) }
      mocks.read.mockResolvedValue({ data: patch === null || Object.hasOwn(patch, 'preset_key') ? patch : { ...complete, ...patch }, error: null })
      const response = await proxy(request('/api/admin/tournaments/event/finalize'))
      expect(response.status).toBe(423); expect(response.headers.get('x-middleware-next')).toBeNull()
      expect((await response.json()).code).toBe('MONEY_DISABLED_FREE_RELEASE')
    })

  it.each(['returned', 'thrown'])('fails closed on %s tournament lookup failure', async kind => {
    if (kind === 'returned') mocks.read.mockResolvedValue({ data: null, error: { message: 'private database detail' } })
    else mocks.read.mockRejectedValue(new Error('private database detail'))
    const response = await proxy(request('/api/tournaments/event/game/start'))
    expect(response.status).toBe(423); expect(await response.text()).not.toContain('private database detail')
  })
})
