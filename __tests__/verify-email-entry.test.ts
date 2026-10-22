import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const fixture = vi.hoisted(() => ({ getUser: vi.fn(), redirect: vi.fn(), createClient: vi.fn(), fetch: vi.fn(), search: new URLSearchParams() }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: fixture.getUser }))
vi.mock('next/navigation', () => ({ redirect: fixture.redirect, useSearchParams: () => fixture.search,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('@/lib/supabase/client', () => ({ createClient: fixture.createClient }))
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
function recoveryLink(html: string) {
  const anchor = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
    .find(match => match[2].includes('Solicitar otro enlace de confirmación'))
  expect(anchor, 'an explicit confirmation recovery link').toBeDefined()
  return new URL(anchor![1].replaceAll('&amp;', '&'), 'https://app.test')
}
beforeEach(() => {
  vi.clearAllMocks()
  fixture.getUser.mockResolvedValue(null)
  fixture.redirect.mockImplementation((path: string) => { throw new Error('REDIRECT:' + path) })
  fixture.createClient.mockImplementation(() => { throw new Error('No client Auth before submit') })
  vi.stubGlobal('fetch', fixture.fetch)
  fixture.search = new URLSearchParams()
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

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

it.each([
  ['/play', '/play'],
  ['/play/2048/ticket?from=result', '/play/2048/ticket?from=result'],
  [tournament, tournament],
  ['/onboarding?next=' + encodeURIComponent(tournament), tournament],
])('preserves the selected return %s when asking manually for another confirmation link', (next, expected) => {
  fixture.search = new URLSearchParams({ error: 'auth_confirm', next })
  const html = renderToStaticMarkup(SignInPage())
  const link = recoveryLink(html)
  expect(link.origin).toBe('https://app.test')
  expect(link.pathname).toBe('/verify-email')
  expect(link.searchParams.get('next')).toBe(expected)
  expect([...link.searchParams.keys()]).toEqual(['next'])
  expect(html).toContain('No necesitas registrarte otra vez.')
  expect(html).toContain('Si ya confirmaste tu correo, inicia sesión aquí con tu email y contraseña.')
  expect(fixture.fetch).not.toHaveBeenCalled()
  expect(fixture.createClient).not.toHaveBeenCalled()
})

it.each([
  undefined,
  'https://outside.test/private',
  '//outside.test/private',
  '/onboarding?next=/onboarding',
  '/onboarding?next=' + encodeURIComponent('/onboarding?next=/play'),
  '/onboarding?next=' + encodeURIComponent('https://outside.test/private'),
])('returns an absent, external or looping recovery destination to free practice: %s', next => {
  fixture.search = new URLSearchParams({ error: 'auth_confirm', ...(next === undefined ? {} : { next }) })
  const link = recoveryLink(renderToStaticMarkup(SignInPage()))
  expect(link.pathname).toBe('/verify-email')
  expect(link.searchParams.get('next')).toBe('/play')
  expect(fixture.fetch).not.toHaveBeenCalled()
  expect(fixture.createClient).not.toHaveBeenCalled()
})

it('shows actionable neutral failure guidance without reflecting provider data or starting signup, resend or activity', () => {
  fixture.search = new URLSearchParams({ error: 'auth_confirm', next: '/play',
    email: 'query-private@example.test', error_description: 'private-provider-token', message: 'private-provider-message' })
  const html = renderToStaticMarkup(SignInPage())
  expect(html).toContain('No pudimos confirmar el correo.')
  expect(html).toContain('El enlace pudo vencer, haberse usado o abrirse en otro navegador.')
  expect(html).toContain('aria-label="Ayuda para confirmar el correo"')
  expect(html).toContain('más reciente en este mismo navegador y perfil')
  expect(html).toContain('esta misma ventana privada')
  expect(html).toContain('copia el enlace y pégalo en la barra de direcciones de esta ventana')
  expect(html).not.toMatch(/query-private|private-provider|email=/)
  expect(recoveryLink(html).pathname).toBe('/verify-email')
  expect(fixture.fetch).not.toHaveBeenCalled()
  expect(fixture.createClient).not.toHaveBeenCalled()
})

it.each(['oauth', 'private-provider-error'])('keeps confirmation recovery out of unrelated sign-in error %s', error => {
  fixture.search = new URLSearchParams({ error, error_description: 'private-provider-token' })
  const html = renderToStaticMarkup(SignInPage())
  expect(html).not.toContain('Solicitar otro enlace de confirmación')
  expect(html).not.toContain('Ayuda para confirmar el correo')
  expect(html).not.toMatch(/private-provider/)
  expect(fixture.fetch).not.toHaveBeenCalled()
  expect(fixture.createClient).not.toHaveBeenCalled()
})

it('keeps an ordinary sign-in focused on its existing flow', () => {
  expect(renderToStaticMarkup(SignInPage())).not.toContain('Solicitar otro enlace de confirmación')
})
