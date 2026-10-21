import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: { getUser: vi.fn(), verifyOtp: vi.fn(), exchangeCodeForSession: vi.fn() },
  ensureProfileExists: vi.fn(), requireUserRole: vi.fn(), upsert: vi.fn(), after: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: mocks.auth })),
  createAdminClient: vi.fn(() => ({ from: vi.fn(() => ({ upsert: mocks.upsert })) })),
}))
vi.mock('@/lib/supabase/profile', () => ({ ensureProfileExists: mocks.ensureProfileExists }))
vi.mock('@/lib/supabase/auth', () => ({ requireUserRole: mocks.requireUserRole }))
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), after: mocks.after }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))
vi.mock('@/lib/email/account-notifications', () => ({ sendWelcomeEmail: vi.fn() }))

import { GET as confirm } from '@/app/auth/confirm/route'
import { GET as callback } from '@/app/auth/callback/route'
import { completeOnboarding } from '@/app/(user)/onboarding/actions'
import { getOnboardingPath } from '@/lib/auth/redirect'

const tournament = '/tournaments/10000000-0000-0000-0000-000000000001'
const origin = 'https://app.test'
const user = { id: 'synthetic-user', email: 'synthetic@example.com', user_metadata: {} }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.getUser.mockResolvedValue({ data: { user } })
  mocks.auth.verifyOtp.mockResolvedValue({ error: null })
  mocks.auth.exchangeCodeForSession.mockResolvedValue({ error: null })
  mocks.ensureProfileExists.mockResolvedValue(undefined)
  mocks.requireUserRole.mockResolvedValue({ userId: user.id, user })
  mocks.upsert.mockResolvedValue({ error: null })
})

afterEach(() => vi.unstubAllEnvs())

describe('confirmation and OAuth destination contracts', () => {
  it('exchanges a PKCE email code and redirects from Docker to the canonical public origin', async () => {
    vi.stubEnv('APP_URL', 'http://127.0.0.1:3081')
    const response = await confirm(new NextRequest('http://0.0.0.0:3000/auth/confirm?code=local-code&next=/onboarding'))
    expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledWith('local-code')
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3081/onboarding')
  })
  it.each(['confirm', 'oauth'])('returns through onboarding after successful %s', async (method) => {
    const next = getOnboardingPath(tournament)
    const query = new URLSearchParams({ next, token_hash: 'synthetic', type: 'signup', code: 'synthetic' })
    const response = await (method === 'confirm' ? confirm : callback)(new NextRequest(`${origin}/auth/${method}?${query}`))
    expect(response.headers.get('location')).toBe(new URL(next, origin).href)
    expect(mocks.ensureProfileExists).toHaveBeenCalledWith(user)
  })

  it.each(['confirm', 'oauth'])('preserves destination on %s failure without leaking tokens', async (method) => {
    mocks.auth.verifyOtp.mockResolvedValue({ error: new Error('Expired') })
    mocks.auth.exchangeCodeForSession.mockResolvedValue({ error: new Error('Expired') })
    const next = getOnboardingPath(tournament)
    const query = new URLSearchParams({ next, token_hash: 'secret-token', type: 'signup', code: 'secret-code' })
    const response = await (method === 'confirm' ? confirm : callback)(new NextRequest(`${origin}/auth/${method}?${query}`))
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/sign-in')
    expect(location.searchParams.get('next')).toBe(next)
    expect(location.href).not.toContain('secret-')
    expect(mocks.ensureProfileExists).not.toHaveBeenCalled()
  })

  it('rejects a malicious confirmation redirect on the server', async () => {
    const response = await confirm(new NextRequest(`${origin}/auth/confirm?token_hash=synthetic&type=signup&next=https://outside.test`))
    expect(response.headers.get('location')).toBe(`${origin}/onboarding`)
  })
})

describe('onboarding return preserves access requirements', () => {
  const form = (next = tournament, birthDate = '1990-01-01', acceptedTerms = 'true') => {
    const data = new FormData()
    for (const [key, value] of Object.entries({ username: 'synthetic_player', fullName: 'Synthetic Player', birthDate, acceptedTerms, next })) data.set(key, value)
    return data
  }

  it('redirects to the tournament only after validating and saving the profile', async () => {
    await expect(completeOnboarding(form())).rejects.toThrow(`REDIRECT:${tournament}`)
    expect(mocks.requireUserRole).toHaveBeenCalledOnce()
    expect(mocks.upsert).toHaveBeenCalledOnce()
  })

  it('takes generic signup through email confirmation and saved onboarding before free practice', async () => {
    const next = getOnboardingPath(undefined)
    const query = new URLSearchParams({ next, token_hash: 'synthetic', type: 'signup' })
    const response = await confirm(new NextRequest(`${origin}/auth/confirm?${query}`))
    expect(response.headers.get('location')).toBe(`${origin}/onboarding`)
    expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({ type: 'signup', token_hash: 'synthetic' })
    const data = form()
    data.delete('next')
    await expect(completeOnboarding(data)).rejects.toThrow('REDIRECT:/play')
    expect(mocks.requireUserRole).toHaveBeenCalledOnce()
    expect(mocks.upsert).toHaveBeenCalledOnce()
  })

  it('revalidates an untrusted form destination on the server', async () => {
    await expect(completeOnboarding(form('//outside.test'))).rejects.toThrow('REDIRECT:/play')
  })

  it.each([['2015-01-01', 'true'], ['1990-01-01', 'false']])('does not skip age or terms for a destination', async (birthDate, acceptedTerms) => {
    expect(await completeOnboarding(form(tournament, birthDate, acceptedTerms))).toHaveProperty('error')
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('does not redirect if profile persistence fails', async () => {
    mocks.upsert.mockResolvedValue({ error: { code: '23505' } })
    expect(await completeOnboarding(form())).toHaveProperty('error')
    expect(mocks.after).not.toHaveBeenCalled()
  })
})
