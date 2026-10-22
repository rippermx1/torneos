import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const mocks = vi.hoisted(() => ({ rate: vi.fn(), cookieSet: vi.fn(), fetch: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: mocks.cookieSet }) }))
vi.mock('@/lib/env', () => ({ getAppUrl: () => 'https://dev.example', getSupabaseServerUrl: () => 'https://dev-ref.supabase.co', getSupabaseBrowserKey: () => 'public-test-key' }))
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.rate, getRequestIp: () => '203.0.113.15' }))
import { POST } from '@/app/api/auth/resend-confirmation/route'
import { RESEND_PKCE_COOKIE, readResendPkceCookie } from '@/lib/auth/confirmation-resend'

const req = (body: unknown = { email: ' QA+one@example.test ' }, headers: Record<string, string> = {}) => new Request('https://dev.example/api/auth/resend-confirmation', {
  method: 'POST', headers: { origin: 'https://dev.example', 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
})
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', mocks.fetch); mocks.rate.mockResolvedValue({ ok: true, retryAfterSeconds: 0 }); mocks.fetch.mockImplementation(async () => Response.json({})) })
afterEach(() => vi.unstubAllGlobals())

describe('confirmation resend without a session', () => {
  it('sends only an existing-signup resend using the public key and a fresh PKCE challenge', async () => {
    const r = await POST(req({ email: ' QA+one@example.test ', next: '//evil.example/path' }))
    expect(r.status).toBe(202); expect(r.headers.get('cache-control')).toContain('no-store')
    expect(await r.json()).toEqual({ message: expect.stringMatching(/^Si hay una cuenta pendiente/), retryAfterSeconds: 60 })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = mocks.fetch.mock.calls[0]
    const endpoint = new URL(url), redirect = new URL(endpoint.searchParams.get('redirect_to')!)
    expect(endpoint.origin + endpoint.pathname).toBe('https://dev-ref.supabase.co/auth/v1/resend')
    expect(redirect.origin + redirect.pathname).toBe('https://dev.example/auth/confirm')
    expect(redirect.searchParams.get('next')).toBe('/onboarding')
    const body = JSON.parse(options.body)
    expect(body).toEqual({ type: 'signup', email: 'qa+one@example.test', code_challenge: expect.any(String), code_challenge_method: 's256' })
    expect(options.headers).toEqual({ apikey: 'public-test-key', 'Content-Type': 'application/json' })
    expect(options.redirect).toBe('error'); expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(mocks.cookieSet).toHaveBeenCalledTimes(1)
    const [name, cookie, cookieOptions] = mocks.cookieSet.mock.calls[0]
    expect(name).toBe(RESEND_PKCE_COOKIE)
    const verifier = readResendPkceCookie(cookie, redirect.searchParams.get('resend_id')!)!
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(body.code_challenge)
    expect(cookieOptions).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/auth/confirm', maxAge: 3600 })
    expect(mocks.rate.mock.calls.map(([rule]) => rule)).toEqual([
      { key: expect.stringMatching(/^confirm-resend:ip:[a-f0-9]{64}$/), limit: 3, windowMs: 300000, onError: 'deny' },
      { key: expect.stringMatching(/^confirm-resend:email:[a-f0-9]{64}:minute$/), limit: 1, windowMs: 60000, onError: 'deny' },
      { key: expect.stringMatching(/^confirm-resend:email:[a-f0-9]{64}:hour$/), limit: 5, windowMs: 3600000, onError: 'deny' },
    ])
    expect(JSON.stringify(mocks.rate.mock.calls)).not.toContain('example.test')
  })
  it.each(['https://attacker.test', 'null', ''])('rejects disallowed origin %s before quota or provider', async origin => {
    expect((await POST(req(undefined, { origin }))).status).toBe(403)
    expect(mocks.rate).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('rejects cross-site requests even with the canonical Origin', async () => {
    expect((await POST(req(undefined, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it.each([null, [], {}, { email: 'bad' }, { email: 'a\nb@example.test' }, { email: 'a@example.test', user_id: 'not-authoritative' }, { email: 'a@example.test', next: 1 }])('rejects malformed input %j without calling Auth', async body => {
    expect((await POST(req(body))).status).toBe(400); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.cookieSet).not.toHaveBeenCalled()
  })
  it.each([['{invalid', {}, 400], ['{}', { 'content-type': 'text/plain' }, 415], ['x'.repeat(2049), {}, 413], ['{}', { 'content-length': '3000' }, 413], ['{}', { 'content-length': '-1' }, 400]] as const)('bounds parsing %s', async (body, headers, status) => {
    expect((await POST(req(body, headers))).status).toBe(status); expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it.each([0, 1, 2])('denies exhausted quota layer %i before provider', async index => {
    mocks.rate.mockReset()
    for (let i=0;i<index;i++) mocks.rate.mockResolvedValueOnce({ ok: true })
    mocks.rate.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 42 })
    const r = await POST(req()); expect(r.status).toBe(429); expect(r.headers.get('retry-after')).toBe('42')
    expect(await r.json()).toEqual({ error: 'Espera antes de solicitar otro enlace.', retryAfterSeconds: 42 })
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.cookieSet).not.toHaveBeenCalled()
  })
  it('fails closed when the quota backend is unavailable', async () => {
    mocks.rate.mockResolvedValue({ ok: false, unavailable: true, retryAfterSeconds: 60 })
    const r=await POST(req()); expect(r.status).toBe(503); expect(r.headers.get('retry-after')).toBe('60'); expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('uses the same email quota for case and surrounding whitespace', async () => {
    await POST(req({email:' Qa+ONE@example.test '})); const first=mocks.rate.mock.calls[1][0].key
    mocks.rate.mockClear(); await POST(req({email:'qa+one@example.test'})); expect(mocks.rate.mock.calls[1][0].key).toBe(first)
  })
  it.each([200, 429])('keeps provider status %i neutral without exposing delivery or existence', async status => {
    mocks.fetch.mockResolvedValue(Response.json({message:'SMTP raw secret qa+one@example.test'}, {status}))
    const r=await POST(req()); expect(r.status).toBe(202); expect(await r.text()).not.toMatch(/SMTP|secret|qa\+one/)
    if(status===429) expect(mocks.cookieSet).not.toHaveBeenCalled()
  })
  it.each(['user_not_found','email_exists','email_already_confirmed'])('does not enumerate provider identity state %s', async code => {
    mocks.fetch.mockResolvedValue(Response.json({code,message:'private'}, {status:400})); expect((await POST(req())).status).toBe(202)
  })
  it.each([400, 401, 500, 503])('keeps operational provider failure %i generic and retryable', async status => {
    mocks.fetch.mockResolvedValue(Response.json({message:'SMTP private user@example.test token=secret'}, {status}))
    const r=await POST(req()); expect(r.status).toBe(503); expect(await r.text()).not.toMatch(/SMTP|secret|example.test/); expect(mocks.cookieSet).not.toHaveBeenCalled()
  })
  it('handles provider timeout/network rejection without writing a verifier or metrics', async () => {
    mocks.fetch.mockRejectedValue(new Error('private network detail')); const r=await POST(req()); expect(r.status).toBe(503); expect(await r.text()).not.toContain('private network'); expect(mocks.cookieSet).not.toHaveBeenCalled()
  })
})
