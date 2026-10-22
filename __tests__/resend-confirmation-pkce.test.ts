import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  coreCreate: vi.fn(), providerFetch: vi.fn(), cookieGet: vi.fn(), cookieSet: vi.fn(),
  ensureProfileExists: vi.fn(),
  auth: { setSession: vi.fn(), getUser: vi.fn(), exchangeCodeForSession: vi.fn(), verifyOtp: vi.fn() },
}))
vi.mock('@supabase/supabase-js', async original => {
  const actual = await original<typeof import('@supabase/supabase-js')>()
  mocks.coreCreate.mockImplementation(actual.createClient)
  return { ...actual, createClient: mocks.coreCreate }
})
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mocks.cookieGet, set: mocks.cookieSet }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: mocks.auth }) }))
vi.mock('@/lib/supabase/profile', () => ({ ensureProfileExists: mocks.ensureProfileExists }))

import {
  RESEND_PKCE_COOKIE, createResendPkceFlow, encodeResendPkceCookie, readResendPkceCookie,
  resendPkceCookieOptions, exchangeResendConfirmationCode,
} from '@/lib/auth/confirmation-resend'
import { GET as confirm } from '@/app/auth/confirm/route'

const origin = 'https://app.test'
const cookieValues = new Map<string, string>()
const user = {
  id: '10000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
  email: 'fixture@example.invalid', email_confirmed_at: '2026-10-22T12:00:00.000Z',
}
const accessToken = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', exp: 4_000_000_000 })).toString('base64url'),
  'synthetic-signature-no-authority',
].join('.')
const refreshToken = 'synthetic-refresh-no-authority'
const sessionReply = () => new Response(JSON.stringify({
  access_token: accessToken, refresh_token: refreshToken, token_type: 'bearer', expires_in: 3600, user,
}), { status: 200, headers: { 'Content-Type': 'application/json' } })
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
const request = (parameters: Record<string, string>) => new NextRequest(`${origin}/auth/confirm?${new URLSearchParams(parameters)}`)
const expectFailure = (response: Response) => {
  const destination = new URL(response.headers.get('location')!)
  expect(destination.origin).toBe(origin)
  expect(destination.pathname).toBe('/sign-in')
  expect(destination.searchParams.get('error')).toBe('auth_confirm')
  expect(destination.searchParams.has('code')).toBe(false)
  expect(destination.searchParams.has('token_hash')).toBe(false)
  expect(destination.searchParams.has('resend_id')).toBe(false)
}

beforeEach(() => {
  vi.clearAllMocks()
  cookieValues.clear()
  vi.stubEnv('APP_URL', origin)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.invalid')
  vi.stubEnv('SUPABASE_SERVER_URL', 'https://fixture.supabase.invalid')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'synthetic-public-key')
  vi.stubGlobal('fetch', mocks.providerFetch)
  mocks.providerFetch.mockImplementation(async () => sessionReply())
  mocks.cookieGet.mockImplementation((name: string) => cookieValues.has(name) ? { name, value: cookieValues.get(name) } : undefined)
  mocks.cookieSet.mockImplementation((name: string, value: string) => { cookieValues.set(name, value) })
  mocks.auth.setSession.mockResolvedValue({ data: { user }, error: null })
  mocks.auth.getUser.mockResolvedValue({ data: { user }, error: null })
  mocks.auth.exchangeCodeForSession.mockResolvedValue({ data: { user }, error: null })
  mocks.auth.verifyOtp.mockResolvedValue({ data: { user }, error: null })
  mocks.ensureProfileExists.mockResolvedValue(undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('dedicated confirmation PKCE proof', () => {
  it('uses real entropy and the RFC 7636 SHA256 challenge, independently of SDK signup storage', () => {
    const now = Date.now(), first = createResendPkceFlow(now), second = createResendPkceFlow(now)
    expect(first.id).toMatch(/^[a-f0-9]{32}$/)
    expect(first.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(first.challenge).toBe(createHash('sha256').update(first.verifier).digest('base64url'))
    expect(first.challenge).not.toBe(first.verifier)
    expect(first.id).not.toBe(second.id)
    expect(first.verifier).not.toBe(second.verifier)
    expect(first.expiresAt).toBeGreaterThan(now)
    expect(first.expiresAt).toBeLessThanOrEqual(now + 3_600_000)
    expect(RESEND_PKCE_COOKIE).not.toMatch(/^sb-/)
    expect(readResendPkceCookie(encodeResendPkceCookie(first), first.id, now)).toBe(first.verifier)
  })

  it('scopes a host-only HttpOnly cookie to the confirmation callback and HTTPS transport', () => {
    const options = resendPkceCookieOptions(origin)
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/auth/confirm', maxAge: 3600 })
    expect(options).not.toHaveProperty('domain')
    expect(resendPkceCookieOptions('http://localhost:3000').secure).toBe(false)
  })

  it('rejects absent, malformed, mismatched, expired and unbounded cookies', () => {
    const now = Date.now(), flow = createResendPkceFlow(now)
    for (const value of [undefined, '', 'not-json', '!'.repeat(20), 'a'.repeat(513), encoded(null), encoded([])]) {
      expect(readResendPkceCookie(value, flow.id, now)).toBeNull()
    }
    expect(readResendPkceCookie(encodeResendPkceCookie(flow), 'x'.repeat(32), now)).toBeNull()
    expect(readResendPkceCookie(encodeResendPkceCookie(flow), createResendPkceFlow(now).id, now)).toBeNull()
    expect(readResendPkceCookie(encodeResendPkceCookie(flow), flow.id, flow.expiresAt)).toBeNull()
    expect(readResendPkceCookie(encoded({ ...flow, expiresAt: now + 3_600_001 }), flow.id, now)).toBeNull()
  })

  it.each([
    { verifier: ['a'.repeat(43)] }, { verifier: {} }, { verifier: null }, { verifier: 'a'.repeat(42) },
    { verifier: 'a'.repeat(44) }, { verifier: 'a'.repeat(42) + '/' },
    { expiresAt: '4000000000000' }, { expiresAt: 1.25 },
  ])('requires primitive, bounded verifier and expiry types: %j', patch => {
    const now = Date.now(), flow = createResendPkceFlow(now)
    expect(readResendPkceCookie(encoded({ ...flow, ...patch }), flow.id, now)).toBeNull()
  })

  it('exercises the actual SDK PKCE exchange with the exact verifier and clears request-local storage', async () => {
    const flow = createResendPkceFlow()
    const result = await exchangeResendConfirmationCode('synthetic-code', flow.verifier)
    expect(result.error).toBeNull()
    expect(result.data.user?.id).toBe(user.id)
    expect(mocks.providerFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mocks.providerFetch.mock.calls[0]
    expect(String(url)).toBe('https://fixture.supabase.invalid/auth/v1/token?grant_type=pkce')
    expect(JSON.parse(init.body)).toEqual({ auth_code: 'synthetic-code', code_verifier: flow.verifier })
    const options = mocks.coreCreate.mock.calls[0][2]
    expect(options.auth).toMatchObject({ flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false })
    expect(await options.auth.storage.getItem(`${options.auth.storageKey}-code-verifier`)).toBeNull()
    expect(await options.auth.storage.getItem(options.auth.storageKey)).toBeNull()
  })

  it('also clears the verifier after a provider rejection and never forwards the raw failure to SSR', async () => {
    mocks.providerFetch.mockResolvedValue(new Response(JSON.stringify({ code: 'bad_code_verifier', msg: 'synthetic rejection' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    }))
    const result = await exchangeResendConfirmationCode('rejected-code', createResendPkceFlow().verifier)
    expect(result.error).not.toBeNull()
    const options = mocks.coreCreate.mock.calls[0][2]
    expect(await options.auth.storage.getItem(`${options.auth.storageKey}-code-verifier`)).toBeNull()
    expect(mocks.auth.setSession).not.toHaveBeenCalled()
  })
})

describe('confirmation callback separates resend from ordinary signup', () => {
  it('rejects a resend marker without its dedicated cookie rather than falling back to ordinary signup', async () => {
    const flow = createResendPkceFlow()
    const response = await confirm(request({ code: 'secret-code', resend_id: flow.id, next: '/onboarding' }))
    expectFailure(response)
    expect(mocks.coreCreate).not.toHaveBeenCalled()
    expect(mocks.auth.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(mocks.auth.verifyOtp).not.toHaveBeenCalled()
    expect(mocks.auth.setSession).not.toHaveBeenCalled()
    expect(mocks.ensureProfileExists).not.toHaveBeenCalled()
    expect(mocks.cookieSet).not.toHaveBeenCalled()
  })

  it('keeps a newer flow intact when an old callback arrives late', async () => {
    const old = createResendPkceFlow(), current = createResendPkceFlow()
    const value = encodeResendPkceCookie(current)
    cookieValues.set(RESEND_PKCE_COOKIE, value)
    expectFailure(await confirm(request({ code: 'old-code', resend_id: old.id })))
    expect(cookieValues.get(RESEND_PKCE_COOKIE)).toBe(value)
    expect(readResendPkceCookie(value, current.id)).toBe(current.verifier)
    expect(mocks.cookieSet).not.toHaveBeenCalled()
    expect(mocks.providerFetch).not.toHaveBeenCalled()
  })

  it('rejects expired cookies before exchange, session installation or profile creation', async () => {
    const flow = createResendPkceFlow(Date.now() - 3_600_001)
    cookieValues.set(RESEND_PKCE_COOKIE, encodeResendPkceCookie(flow))
    expectFailure(await confirm(request({ code: 'expired-code', resend_id: flow.id })))
    expect(mocks.providerFetch).not.toHaveBeenCalled()
    expect(mocks.auth.setSession).not.toHaveBeenCalled()
    expect(mocks.ensureProfileExists).not.toHaveBeenCalled()
  })

  it('requires a code for the dedicated flow and refuses mixed token_hash credentials', async () => {
    const inputs: Record<string, string>[] = [{}, { token_hash: 'synthetic-token', type: 'signup', code: 'mixed-code' }]
    for (const parameters of inputs) {
      const flow = createResendPkceFlow()
      cookieValues.set(RESEND_PKCE_COOKIE, encodeResendPkceCookie(flow))
      expectFailure(await confirm(request({ ...parameters, resend_id: flow.id })))
    }
    expect(mocks.coreCreate).not.toHaveBeenCalled()
    expect(mocks.auth.verifyOtp).not.toHaveBeenCalled()
    expect(mocks.ensureProfileExists).not.toHaveBeenCalled()
  })

  it('consumes a valid dedicated flow once and installs only the exchanged session', async () => {
    const flow = createResendPkceFlow()
    cookieValues.set(RESEND_PKCE_COOKIE, encodeResendPkceCookie(flow))
    const parameters = { code: 'valid-code', resend_id: flow.id, next: '/onboarding' }
    const response = await confirm(request(parameters))
    expect(response.headers.get('location')).toBe(origin + '/onboarding')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.auth.setSession).toHaveBeenCalledExactlyOnceWith({ access_token: accessToken, refresh_token: refreshToken })
    expect(mocks.ensureProfileExists).toHaveBeenCalledExactlyOnceWith(user)
    expect(mocks.auth.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(mocks.auth.verifyOtp).not.toHaveBeenCalled()
    expect(mocks.cookieSet).toHaveBeenCalledWith(RESEND_PKCE_COOKIE, '', expect.objectContaining({ maxAge: 0, path: '/auth/confirm' }))
    expectFailure(await confirm(request(parameters)))
    expect(mocks.providerFetch).toHaveBeenCalledTimes(1)
    expect(mocks.auth.setSession).toHaveBeenCalledTimes(1)
    expect(mocks.ensureProfileExists).toHaveBeenCalledTimes(1)
  })

  it('does not provision a profile when SSR session installation fails', async () => {
    const flow = createResendPkceFlow()
    cookieValues.set(RESEND_PKCE_COOKIE, encodeResendPkceCookie(flow))
    mocks.auth.setSession.mockResolvedValue({ error: new Error('synthetic unavailable') })
    expectFailure(await confirm(request({ code: 'valid-code', resend_id: flow.id })))
    expect(mocks.auth.getUser).not.toHaveBeenCalled()
    expect(mocks.ensureProfileExists).not.toHaveBeenCalled()
  })

  it('does not provision a profile unless the installed session has a confirmed email', async () => {
    const flow = createResendPkceFlow()
    cookieValues.set(RESEND_PKCE_COOKIE, encodeResendPkceCookie(flow))
    mocks.auth.getUser.mockResolvedValue({ data: { user: { ...user, email_confirmed_at: null } }, error: null })
    expectFailure(await confirm(request({ code: 'valid-code', resend_id: flow.id })))
    expect(mocks.ensureProfileExists).not.toHaveBeenCalled()
  })

  it.each(['code', 'token_hash'])('preserves ordinary %s confirmation without touching the dedicated cookie', async credential => {
    const flow = createResendPkceFlow(), value = encodeResendPkceCookie(flow)
    cookieValues.set(RESEND_PKCE_COOKIE, value)
    const parameters: Record<string, string> = credential === 'code' ? { code: 'ordinary-code' } : { token_hash: 'ordinary-token', type: 'signup' }
    const response = await confirm(request({ ...parameters, next: '/onboarding' }))
    expect(response.headers.get('location')).toBe(origin + '/onboarding')
    expect(mocks.ensureProfileExists).toHaveBeenCalledExactlyOnceWith(user)
    expect(mocks.coreCreate).not.toHaveBeenCalled()
    expect(mocks.auth.setSession).not.toHaveBeenCalled()
    expect(mocks.cookieSet).not.toHaveBeenCalled()
    expect(cookieValues.get(RESEND_PKCE_COOKIE)).toBe(value)
    if (credential === 'code') expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledWith('ordinary-code')
    else expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({ type: 'signup', token_hash: 'ordinary-token' })
  })

  it('keeps dedicated callback failures private and prevents leaking code URLs through referrers', async () => {
    const response = await confirm(request({ code: 'secret-code', resend_id: createResendPkceFlow().id }))
    expectFailure(response)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })
})
