import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ from: vi.fn(), auth: vi.fn(), flow: vi.fn(), insert: vi.fn(), limit: vi.fn(), window: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: h.from }) }))
vi.mock('@/lib/supabase/auth', () => ({ requireAnyRoleForApi: h.auth }))
vi.mock('@/lib/flow/payments', () => ({ createFlowPayment: h.flow, buildFlowCheckoutUrl: () => 'https://fixture.invalid/checkout' }))
vi.mock('@/lib/env', () => ({ getAppUrl: () => 'https://fixture.invalid' }))
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: h.limit, getRequestIp: () => 'fixture', rateLimitResponse: () => Response.json({}, { status: 429 }) }))
vi.mock('@/lib/tournament/helpers', () => ({ checkRegistrationWindow: h.window }))
vi.mock('@/lib/legal/terms', () => ({ hasAcceptedCurrentTerms: () => true }))
vi.mock('@/lib/email/tournament-notifications', () => ({ sendTournamentRegistrationEmail: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
import { POST } from '@/app/api/tournaments/[id]/checkout/flow/create/route'
beforeEach(() => {
  vi.resetAllMocks(); h.auth.mockResolvedValue({ ok: true, access: { userId: 'user', user: { email: 'user@example.test' } } }); h.limit.mockResolvedValue({ ok: true }); h.window.mockReturnValue({ ok: true })
  h.insert.mockResolvedValue({ data: null, error: { code: 'PT423' } })
  h.from.mockImplementation((table: string) => {
    const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), single: vi.fn(), then: (resolve: (value: unknown) => void) => resolve({ count: 0, data: null, error: null }) }
    q.single.mockImplementation(() => table === 'profiles' ? Promise.resolve({ data: { is_banned: false, kyc_status: 'approved', birth_date: '1990-01-01' } }) : table === 'tournaments' ? Promise.resolve({ data: { id: 'tournament', entry_fee_cents: 500000, max_players: 15, skill_tier: null } }) : h.insert())
    return q
  })
})
describe('cash admission stops provider dispatch', () => {
  it('returns a controlled pause before calling Flow when the authoritative SQL gate rejects', async () => {
    const response = await POST(new Request('https://fixture.invalid', { method: 'POST' }), { params: Promise.resolve({ id: 'tournament' }) })
    expect(response.status).toBe(423); expect(await response.json()).toHaveProperty('error', expect.stringContaining('reserva de caja')); expect(h.flow).not.toHaveBeenCalled()
  })
})
