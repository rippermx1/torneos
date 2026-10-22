import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const fixture = vi.hoisted(() => ({ getUser: vi.fn(), redirect: vi.fn(), search: new URLSearchParams() }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: fixture.getUser }))
vi.mock('next/navigation', () => ({ redirect: fixture.redirect, useSearchParams: () => fixture.search,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => { throw new Error('No client Auth before submit') } }))
vi.mock('@/components/auth/google-button', () => ({ GoogleButton: () => null }))

import VerifyEmailPage from '@/app/(auth)/verify-email/page'
import SignInPage from '@/app/(auth)/sign-in/page'
import { ResendVerificationButton } from '@/components/auth/resend-verification-button'

type Node = ReactElement<Record<string, unknown>>
function nodes(value: ReactNode): Node[] {
  return Children.toArray(value).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as ReactNode)] : [])
}
const tournament = '/tournaments/10000000-0000-0000-0000-000000000001'
beforeEach(() => {
  vi.clearAllMocks()
  fixture.getUser.mockResolvedValue(null)
  fixture.redirect.mockImplementation((path: string) => { throw new Error('REDIRECT:' + path) })
  fixture.search = new URLSearchParams()
})
afterEach(() => vi.unstubAllEnvs())

it('lets an anonymous visitor request a confirmation manually, without trusting email query parameters', async () => {
  const tree = await VerifyEmailPage({ searchParams: Promise.resolve({ next: '/play', email: 'query-private@example.test' }) })
  expect(fixture.redirect).not.toHaveBeenCalled()
  const form = nodes(tree).find(node => node.type === ResendVerificationButton)!
  expect(form.props).toMatchObject({ returnTo: '/play', email: '' })
  const html = renderToStaticMarkup(tree)
  expect(html).toContain('Email de la cuenta pendiente')
  expect(html).not.toContain('query-private')
  expect(html).not.toContain('email=')
  expect(html).toContain('href="/play"')
})

it('prefills only the email of an authenticated pending account and preserves its selected return', async () => {
  fixture.getUser.mockResolvedValue({ id: 'pending-user', email: 'owned@example.test', email_confirmed_at: null })
  const tree = await VerifyEmailPage({ searchParams: Promise.resolve({ next: tournament }) })
  expect(nodes(tree).find(node => node.type === ResendVerificationButton)?.props).toMatchObject({ email: 'owned@example.test', returnTo: tournament })
  const hrefs = nodes(tree).flatMap(node => typeof node.props.href === 'string' ? [node.props.href] : [])
  expect(hrefs.every(href => !href.includes('owned') && !href.includes('email='))).toBe(true)
})

it.each([undefined, '/play', tournament, '/play/2048/ticket?from=result'])('retains the redirect for a confirmed account: %s', async next => {
  fixture.getUser.mockResolvedValue({ id: 'confirmed-user', email_confirmed_at: '2026-10-22T13:00:00Z' })
  await expect(VerifyEmailPage({ searchParams: Promise.resolve({ next }) })).rejects.toThrow('REDIRECT:' + (next ?? '/play'))
})

it.each(['//outside.test', 'https://outside.test', ['/play', tournament]])('keeps an ambiguous anonymous return safe: %s', async next => {
  const tree = await VerifyEmailPage({ searchParams: Promise.resolve({ next }) })
  expect(nodes(tree).find(node => node.type === ResendVerificationButton)?.props.returnTo).toBe('/play')
})

it('offers resend after an expired confirmation without placing the email in a link', () => {
  fixture.search = new URLSearchParams({ error: 'auth_confirm', next: '/onboarding?next=' + encodeURIComponent(tournament), email: 'query-private@example.test' })
  const html = renderToStaticMarkup(SignInPage())
  expect(html).toContain('Solicitar otro enlace de confirmación')
  expect(html).not.toContain('query-private')
  expect(html).toContain('/verify-email?next=' + encodeURIComponent(tournament))
})

it('keeps an ordinary sign-in focused on its existing flow', () => {
  expect(renderToStaticMarkup(SignInPage())).not.toContain('Solicitar otro enlace de confirmación')
})
