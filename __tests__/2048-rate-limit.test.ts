import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ rpc: vi.fn(), constructorError: false }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => {
  if (fixture.constructorError) throw new Error('SDK unavailable')
  return { rpc: fixture.rpc }
} }))
import { checkRateLimit, rateLimitResponse } from '@/lib/security/rate-limit'

beforeEach(() => { vi.clearAllMocks(); fixture.constructorError = false; vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => vi.restoreAllMocks())
const options = { key: 'game:move:account', limit: 240, windowMs: 60_000, onError: 'deny' as const }
describe('competitive account limiter', () => {
  it('denies requests when the server client cannot initialize', async () => {
    fixture.constructorError = true
    expect(rateLimitResponse(await checkRateLimit(options)).status).toBe(503)
    expect(fixture.rpc).not.toHaveBeenCalled()
  })
  it.each(['error', 'empty', 'throw', 'malformed'])('blocks on %s without pretending the quota was consumed', async kind => {
    if (kind === 'throw') fixture.rpc.mockRejectedValue(new Error('offline'))
    else fixture.rpc.mockResolvedValue({ data: kind === 'malformed' ? { ok: true } : null,
      error: kind === 'error' ? { message: 'offline' } : null })
    const result = await checkRateLimit(options)
    expect(result.ok).toBe(false)
    const response = rateLimitResponse(result)
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('RATE_LIMIT_UNAVAILABLE')
    expect(response.headers.get('Retry-After')).toBe('60')
  })
  it('retains the default policy for unrelated callers', async () => {
    fixture.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } })
    expect((await checkRateLimit({ ...options, onError: undefined })).ok).toBe(true)
  })
  it.each([true, false])('uses the atomic RPC quota (ok=%s)', async ok => {
    fixture.rpc.mockResolvedValue({ error: null, data: { ok, limit: 240, count: ok ? 1 : 241,
      remaining: ok ? 239 : 0, expires_at: '2026-10-04T21:00:00Z', retry_after_seconds: 60 } })
    const result = await checkRateLimit(options)
    expect(result.ok).toBe(ok)
    expect(fixture.rpc).toHaveBeenCalledWith('rate_limit_consume', {
      p_key: options.key, p_limit: 240, p_window_ms: 60_000 })
    if (!ok) expect(rateLimitResponse(result).status).toBe(429)
  })
})
