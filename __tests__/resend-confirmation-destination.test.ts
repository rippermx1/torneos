import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), fetch: vi.fn(), cookieSet: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: mocks.cookieSet }) }))
vi.mock('@/lib/env', () => ({ getAppUrl: () => 'https://app.test', getSupabaseServerUrl: () => 'https://auth.test', getSupabaseBrowserKey: () => 'public-key' }))
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ ok: true })), getRequestIp: vi.fn(() => 'fixture'),
}))
import { POST } from '@/app/api/auth/resend-confirmation/route'

const request = (next?: string) => new Request('https://app.test/api/auth/resend-confirmation', {
  method: 'POST', headers: { origin: 'https://app.test', 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'synthetic@example.com', next }),
})
const redirect = () => new URL(new URL(mocks.fetch.mock.calls[0][0]).searchParams.get('redirect_to')!)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockImplementation(() => { throw new Error('No session lookup required') })
  mocks.fetch.mockImplementation(async () => Response.json({}))
  vi.stubGlobal('fetch', mocks.fetch)
})
afterEach(() => vi.unstubAllGlobals())

describe('resend confirmation destination', () => {
  it('preserves a tournament destination while still completing onboarding', async () => {
    const next = '/tournaments/10000000-0000-0000-0000-000000000001'
    expect((await POST(request(next))).status).toBe(202)
    const confirmation = redirect()
    expect(confirmation.origin).toBe('https://app.test')
    expect(new URL(confirmation.searchParams.get('next')!, 'https://app.test').searchParams.get('next')).toBe(next)
  })
  it('revalidates an external next on the server', async () => {
    expect((await POST(request('//outside.test'))).status).toBe(202)
    expect(redirect().searchParams.get('next')).toBe('/onboarding')
  })
  it('can request an existing-signup resend without a session or account lookup', async () => {
    expect((await POST(request())).status).toBe(202)
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ type: 'signup', email: 'synthetic@example.com' })
    expect(redirect().searchParams.has('email')).toBe(false)
  })
})
