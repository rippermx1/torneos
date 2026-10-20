import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), resend: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: mocks })) }))
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ ok: true })), getRequestIp: vi.fn(() => 'fixture'), rateLimitResponse: vi.fn(),
}))
import { POST } from '@/app/api/auth/resend-confirmation/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { email: 'synthetic@example.com', email_confirmed_at: null } } })
  mocks.resend.mockResolvedValue({ error: null })
})

describe('resend confirmation destination', () => {
  it('preserves a tournament destination while still completing onboarding', async () => {
    const next = '/tournaments/10000000-0000-0000-0000-000000000001'
    const response = await POST(new Request('https://app.test/api/auth/resend-confirmation', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ next }),
    }))
    expect(response.status).toBe(200)
    const confirmation = new URL(mocks.resend.mock.calls[0][0].options.emailRedirectTo)
    expect(confirmation.origin).toBe('https://app.test')
    expect(new URL(confirmation.searchParams.get('next')!, 'https://app.test').searchParams.get('next')).toBe(next)
  })

  it('revalidates an external next on the server', async () => {
    await POST(new Request('https://app.test/api/auth/resend-confirmation', { method: 'POST', body: JSON.stringify({ next: '//outside.test' }) }))
    expect(new URL(mocks.resend.mock.calls[0][0].options.emailRedirectTo).searchParams.get('next')).toBe('/onboarding')
  })

  it('cannot send confirmation without a session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(new Request('https://app.test/api/auth/resend-confirmation', { method: 'POST' }))).status).toBe(401)
    expect(mocks.resend).not.toHaveBeenCalled()
  })
})
