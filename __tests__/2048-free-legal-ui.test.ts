import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const fixture = vi.hoisted(() => ({ index: 0, states: [] as unknown[],
  search: new URLSearchParams(), createClient: vi.fn(), signUp: vi.fn(), complete: vi.fn(),
  push: vi.fn(), refresh: vi.fn(), transitions: [] as Promise<unknown>[] }))
vi.mock('react', async () => ({ ...await vi.importActual('react'),
  useMemo: (callback: () => unknown) => callback(),
  useState: (initial: unknown) => {
    const index = fixture.index++
    if (!(index in fixture.states)) fixture.states[index] = initial
    return [fixture.states[index], (value: unknown) => { fixture.states[index] = value }]
  },
  useTransition: () => [false, (callback: () => Promise<unknown>) => { fixture.transitions.push(callback()) }],
}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: fixture.push, refresh: fixture.refresh }),
  useSearchParams: () => fixture.search }))
vi.mock('@/lib/supabase/client', () => ({ createClient: fixture.createClient }))
vi.mock('@/components/auth/google-button', () => ({ GoogleButton: () => null }))
vi.mock('@/app/(user)/onboarding/actions', () => ({ completeOnboarding: fixture.complete }))

import SignUpPage from '@/app/(auth)/sign-up/page'
import { OnboardingForm } from '@/app/(user)/onboarding/onboarding-form'
import TerminosPage from '@/app/legal/terminos/page'
import PrivacidadPage from '@/app/legal/privacidad/page'
import { CURRENT_TERMS_VERSION } from '@/lib/legal/terms'
import { ResendVerificationButton } from '@/components/auth/resend-verification-button'

type Node = ReactElement<Record<string, unknown>>
function nodes(value: ReactNode): Node[] {
  return Children.toArray(value).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as ReactNode)] : [])
}
function textOf(value: ReactNode): string {
  return Children.toArray(value).map(child => isValidElement<Record<string, unknown>>(child)
    ? textOf(child.props.children as ReactNode) : String(child)).join(' ').replace(/\s+/g, ' ')
}
function signup() {
  fixture.index = 0
  const child = SignUpPage().props.children as ReactElement
  return (child.type as () => ReactNode)()
}
function onboarding(defaultAcceptedTerms = false) {
  fixture.index = 0
  return OnboardingForm({ defaultUsername: '', defaultFullName: '', defaultBirthDate: '',
    defaultAcceptedTerms, returnTo: '/play/2048/ticket?from=practice' })
}
function input(tree: ReactNode, id: string) {
  const node = nodes(tree).find(node => node.type === 'input' && node.props.id === id)
  expect(node, `input ${id}`).toBeDefined()
  return node!
}
function change(view: () => ReactNode, id: string, value: string | boolean) {
  const props = input(view(), id).props
  ;(props.onChange as (event: unknown) => void)({ target: typeof value === 'boolean' ? { checked: value } : { value } })
}
async function submit(tree: ReactNode) {
  const form = nodes(tree).find(node => node.type === 'form')!
  const preventDefault = vi.fn()
  await (form.props.onSubmit as (event: unknown) => Promise<void> | void)({ preventDefault })
  expect(preventDefault).toHaveBeenCalledOnce()
  await Promise.all(fixture.transitions)
}

beforeEach(() => {
  fixture.index = 0; fixture.states = []; fixture.transitions = []; fixture.search = new URLSearchParams()
  vi.clearAllMocks()
  fixture.createClient.mockReturnValue({ auth: { signUp: fixture.signUp } })
  fixture.signUp.mockResolvedValue({ data: { session: null }, error: null })
  fixture.complete.mockResolvedValue(undefined)
  vi.stubGlobal('window', { location: { origin: 'https://owned.test' } })
  vi.useFakeTimers(); vi.setSystemTime('2026-10-21T15:00:00Z')
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('presents account purpose, a guest alternative and policy links before collecting access data', () => {
  const tree = signup(), all = nodes(tree)
  const notice = all.findIndex(node => node.type === 'section' && node.props['aria-labelledby'] === 'account-data-title')
  expect(notice).toBeGreaterThan(-1)
  expect(notice).toBeLessThan(all.findIndex(node => node.props.id === 'email'))
  const text = textOf(tree)
  expect(text).toContain('Supabase Auth recibe tu email y contraseña')
  expect(text).toContain('Esto no autoriza publicidad ni operaciones de dinero')
  expect(all.some(node => node.props.href === '/play')).toBe(true)
  expect(all.some(node => node.props.href === '/legal/privacidad')).toBe(true)
  expect(all.find(node => node.type === 'fieldset')?.props.disabled).toBe(true)
  expect(all.find(node => node.type === 'button' && node.props.type === 'submit')?.props.disabled).toBe(true)
  expect(fixture.createClient).not.toHaveBeenCalled()
})

it('refuses even a programmatic submit before confirmation without creating Auth or sending data', async () => {
  change(signup, 'email', 'owned@example.test')
  change(signup, 'password', 'valid-test-password')
  change(signup, 'confirm', 'valid-test-password')
  await submit(signup())
  expect(fixture.createClient).not.toHaveBeenCalled()
  expect(fixture.signUp).not.toHaveBeenCalled()
  expect(nodes(signup()).find(node => node.props.role === 'alert')?.props.children).toContain('Confirma el uso')
})

it('creates Auth only after confirmation and keeps the safe return destination without accepting account terms early', async () => {
  fixture.search = new URLSearchParams({ next: '/play/2048/ticket?from=result' })
  change(signup, 'account-data-accepted', true)
  expect(nodes(signup()).find(node => node.type === 'fieldset')?.props.disabled).toBe(false)
  change(signup, 'email', 'owned@example.test')
  change(signup, 'password', 'valid-test-password')
  change(signup, 'confirm', 'valid-test-password')
  await submit(signup())
  expect(fixture.signUp).toHaveBeenCalledOnce()
  const payload = fixture.signUp.mock.calls[0][0]
  expect(Object.keys(payload).sort()).toEqual(['email', 'options', 'password'])
  const confirmation = new URL(payload.options.emailRedirectTo)
  expect(confirmation.origin).toBe('https://owned.test')
  expect(confirmation.pathname).toBe('/auth/confirm')
  const destination = new URL(confirmation.searchParams.get('next')!, 'https://owned.test')
  expect(destination.pathname).toBe('/onboarding')
  expect(destination.searchParams.get('next')).toBe('/play/2048/ticket?from=result')
  expect(fixture.complete).not.toHaveBeenCalled()
  expect(textOf(signup())).toContain('Revisa tu correo')
  const pending = nodes(signup()).find(node => node.type === ResendVerificationButton)!
  expect(pending.props).toMatchObject({ email: 'owned@example.test', returnTo: '/play/2048/ticket?from=result', initialCooldownSeconds: 60 })
  const links = nodes(signup()).flatMap(node => typeof node.props.href === 'string' ? [node.props.href] : [])
  expect(links.every(link => !link.includes('owned') && !link.includes('email='))).toBe(true)
})

it('keeps a rejected signup neutral instead of confirming an existing account', async () => {
  fixture.signUp.mockResolvedValueOnce({ data: null, error: { message: 'User already registered' } })
  change(signup, 'account-data-accepted', true)
  change(signup, 'email', 'owned@example.test')
  change(signup, 'password', 'valid-test-password')
  change(signup, 'confirm', 'valid-test-password')
  await submit(signup())
  expect(textOf(signup())).toContain('No pudimos completar la solicitud de registro')
  expect(textOf(signup())).not.toMatch(/Ya existe|User already registered|Correo reenviado/)
})

it('keeps password validation and revoking confirmation ahead of Auth', async () => {
  change(signup, 'account-data-accepted', true)
  change(signup, 'password', 'short')
  await submit(signup())
  expect(textOf(signup())).toContain('al menos 8 caracteres')
  change(signup, 'account-data-accepted', false)
  await submit(signup())
  expect(fixture.signUp).not.toHaveBeenCalled()
  expect(nodes(signup()).find(node => node.type === 'fieldset')?.props.disabled).toBe(true)
})

it('explains optional free accounts and requires the versioned acceptance without financial eligibility claims', async () => {
  const tree = onboarding()
  expect(textOf(tree)).toContain('Tu cuenta es opcional para practicar')
  expect(textOf(tree)).toContain(`Versión ${CURRENT_TERMS_VERSION} del servicio gratuito`)
  expect(textOf(tree)).not.toContain('competencia de habilidad, no como apuesta')
  change(onboarding, 'username', 'Alias2048')
  change(onboarding, 'birthDate', '1994-01-01')
  await submit(onboarding())
  expect(fixture.complete).not.toHaveBeenCalled()
  expect(textOf(onboarding())).toContain('Debes aceptar los términos')
  const checkbox = nodes(onboarding()).find(node => node.type === 'input' && node.props.type === 'checkbox')!
  ;(checkbox.props.onChange as (event: unknown) => void)({ target: { checked: true } })
  await submit(onboarding())
  const payload = fixture.complete.mock.calls[0][0] as FormData
  expect([...payload.keys()].sort()).toEqual(['acceptedTerms', 'birthDate', 'fullName', 'next', 'username'])
  expect(payload.get('acceptedTerms')).toBe('true')
  expect(payload.get('fullName')).toBe('')
  expect(payload.get('next')).toBe('/play/2048/ticket?from=practice')
  expect(fixture.createClient).not.toHaveBeenCalled()
})

it('keeps adult-account validation rather than asking for financial identity', async () => {
  change(onboarding, 'username', 'Alias2048')
  change(onboarding, 'birthDate', '2020-01-01')
  await submit(onboarding())
  expect(fixture.complete).not.toHaveBeenCalled()
  expect(textOf(onboarding())).toContain('al menos 18 años')
  expect(nodes(onboarding()).filter(node => node.type === 'input').map(node => node.props.id).filter(Boolean))
    .toEqual(['username', 'fullName', 'birthDate'])
})

it('publishes one coherent free scope without current payment, prize or pure-skill promises', () => {
  const html = renderToStaticMarkup(TerminosPage())
  expect(html).toContain(`Versión ${CURRENT_TERMS_VERSION}`)
  expect(html).toContain('todavía no disponibles')
  expect(html).toContain('no reproduce un anuncio real')
  expect(html).toContain('no borra registros ni modifica derechos')
  expect(html).not.toContain('KYC aprobado')
  expect(html).not.toContain('El cobro de la inscripción se realiza')
  expect(html).not.toContain('55%')
  expect(html).not.toContain('competencias de habilidad</strong>')
})

it('separates local/account/historical data and does not invent an operator identity or retention deadline', () => {
  const html = renderToStaticMarkup(PrivacidadPage())
  expect(html).toContain('TorneosPlay es el nombre del servicio')
  expect(html).not.toContain('pendiente')
  expect(html).not.toContain('SpA')
  expect(html).toContain('No se suben automáticamente')
  expect(html).toContain('No hay borrado automático de cuentas o actividad')
  expect(html).toContain('privacidad@torneosplay.cl')
  expect(html).toContain('contacto@torneosplay.cl')
  expect(html).not.toContain('se conservan por 6 años conforme')
  expect(html).not.toContain('30 días hábiles')
  expect(html).not.toContain('consentimiento expreso del usuario al registrarse')
})
