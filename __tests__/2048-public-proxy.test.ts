import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  origin: 'https://torneos.example', getUser: vi.fn(), serverFactory: vi.fn(), rpc: vi.fn(), rate: vi.fn(),
}))
vi.mock('@supabase/ssr', () => ({ createServerClient: (...args: unknown[]) => mocks.serverFactory(...args) }))
vi.mock('@/lib/env', () => ({
  getAllowedOrigins: () => [mocks.origin], getAppUrl: () => mocks.origin,
  getSupabaseBrowserKey: () => 'public-test-key', getSupabaseUrl: () => 'https://fixture.supabase.co',
  getSupabaseServerUrl: () => 'https://fixture.supabase.co', getSupabaseCookieOptions: () => ({ name: 'sb-test-auth-token' }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }), createAdminClient: () => ({ rpc: mocks.rpc }),
}))
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.rate,
  rateLimitResponse: () => Response.json({ error: 'limited' }, { status: 429 }) }))

import { proxy } from '../proxy'
import { GET as daily } from '../app/api/2048/daily/route'
import { POST as activity } from '../app/api/2048/activity/route'

const user = { id: '00000000-0000-4000-8000-000000000001', is_anonymous: false }
const request = (path: string, method = 'GET') => new NextRequest(`${mocks.origin}${path}`, {
  method, headers: { origin: mocks.origin, 'content-type': 'application/json' },
  ...(method === 'POST' ? { body: '{"mode":"daily"}' } : {}),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError' } })
  mocks.serverFactory.mockReturnValue({ auth: { getUser: mocks.getUser } })
  mocks.rate.mockResolvedValue({ ok: true })
  mocks.rpc.mockResolvedValue({ data: { activityDay: '2026-10-16' }, error: null })
})

describe('2048 public API admission through the actual Next proxy', () => {
  it('lets a guest reach the daily definition without a sign-in redirect', async () => {
    const response = await proxy(request('/api/2048/daily'))
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
    const result = daily()
    expect(result.status).toBe(200)
    expect(await result.json()).toMatchObject({ targetTile: 128, rulesVersion: '2048-daily-v1' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('lets activity return its own guest 401 instead of proxy HTML/redirect', async () => {
    const req = request('/api/2048/activity', 'POST')
    const response = await proxy(req)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('location')).toBeNull()
    expect((await activity(req)).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.rate).not.toHaveBeenCalled()
  })

  it('preserves handler rejection of Supabase anonymous accounts', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { ...user, is_anonymous: true } }, error: null })
    const req = request('/api/2048/activity', 'POST')
    expect((await proxy(req)).headers.get('x-middleware-next')).toBe('1')
    expect((await activity(req)).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('keeps authenticated writes behind the handler Auth check with server-derived identity', async () => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null })
    const req = request('/api/2048/activity', 'POST')
    expect((await proxy(req)).headers.get('x-middleware-next')).toBe('1')
    expect((await activity(req)).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('record_2048_player_activity', { p_user_id: user.id, p_mode: 'daily' })
  })

  it.each(['/api/2048/daily/extra', '/api/2048/daily-extra', '/api/2048/activity/extra',
    '/api/2048/private', '/api/admin/reports/2048-retention?from=2026-10-16&to=2026-10-16', '/premios'])(
    'does not grant guest admission to neighbouring/private path %s', async path => {
      const response = await proxy(request(path))
      expect(response.status).toBe(307)
      const location = new URL(response.headers.get('location')!)
      expect(location.origin).toBe(mocks.origin)
      expect(location.pathname).toBe('/sign-in')
      expect(location.searchParams.get('next')).toBe(path)
    })

  it('continues passing authenticated private requests to their own authorization layer', async () => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null })
    const response = await proxy(request('/api/admin/reports/2048-retention'))
    expect(response.headers.get('x-middleware-next')).toBe('1')
    // The report handler retains its independent admin/MFA guard.
    expect(response.headers.get('location')).toBeNull()
  })

  it('matches the exact pathname with a query and leaves method decisions to Next handlers', async () => {
    expect((await proxy(request('/api/2048/daily?refresh=1'))).headers.get('x-middleware-next')).toBe('1')
    expect((await proxy(request('/api/2048/daily', 'PUT'))).headers.get('x-middleware-next')).toBe('1')
  })

  it('preserves refreshed cookies and CSP/no-store when an admitted guest response is rebuilt', async () => {
    mocks.serverFactory.mockImplementationOnce((_url: unknown, _key: unknown, options: {
      cookies: { setAll(values: { name: string; value: string; options: { path: string; httpOnly: boolean } }[]): void }
    }) => {
      options.cookies.setAll([{ name: 'sb-test-auth-token', value: 'refreshed-test-cookie', options: { path: '/', httpOnly: true } }])
      return { auth: { getUser: mocks.getUser } }
    })
    const response = await proxy(request('/api/2048/daily'))
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.cookies.get('sb-test-auth-token')?.value).toBe('refreshed-test-cookie')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('location')).toBeNull()
  })
})
