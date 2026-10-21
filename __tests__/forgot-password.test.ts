import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'

const fixture = vi.hoisted(() => ({ index: 0, states: [] as unknown[],
  createClient: vi.fn(), resetPasswordForEmail: vi.fn() }))
vi.mock('react', async () => ({ ...await vi.importActual('react'),
  useState: (initial: unknown) => {
    const index = fixture.index++
    if (!(index in fixture.states)) fixture.states[index] = initial
    return [fixture.states[index], (value: unknown) => { fixture.states[index] = value }]
  },
}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('@/lib/supabase/client', () => ({ createClient: fixture.createClient }))

import ForgotPasswordPage from '@/app/(auth)/sign-in/forgot/page'

type Node = ReactElement<Record<string, unknown>>
function nodes(value: ReactNode): Node[] {
  return Children.toArray(value).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as ReactNode)] : [])
}
function textOf(value: ReactNode): string {
  return Children.toArray(value).map(child => isValidElement<Record<string, unknown>>(child)
    ? textOf(child.props.children as ReactNode) : String(child)).join(' ').replace(/\s+/g, ' ')
}
function view() { fixture.index = 0; return ForgotPasswordPage() }
function button(tree = view()) { return nodes(tree).find(node => node.type === 'button')! }
function email(value: string) {
  const input = nodes(view()).find(node => node.type === 'input' && node.props.id === 'email')!
  ;(input.props.onChange as (event: unknown) => void)({ target: { value } })
}
function submit() {
  const form = nodes(view()).find(node => node.type === 'form')!
  const preventDefault = vi.fn()
  const submitted = (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault })
  expect(preventDefault).toHaveBeenCalledOnce()
  return submitted
}
function expectRetryableFailure() {
  const tree = view(), alert = nodes(tree).find(node => node.props.role === 'alert')
  expect(alert?.props.children).toBe('No se pudo solicitar el enlace. Inténtalo de nuevo en unos minutos.')
  expect(textOf(tree)).not.toContain('Revisa tu correo')
  expect(button(tree).props.disabled).toBe(false)
  expect(textOf(button(tree))).toBe('Enviar enlace')
  expect(nodes(tree).find(node => node.type === 'input')?.props.value).toBe('owned@example.test')
}

beforeEach(() => {
  fixture.index = 0; fixture.states = []
  vi.clearAllMocks()
  fixture.createClient.mockReturnValue({ auth: { resetPasswordForEmail: fixture.resetPasswordForEmail } })
  fixture.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
  vi.stubGlobal('window', { location: { origin: 'https://owned.test' } })
  email('owned@example.test')
})
afterEach(() => { vi.unstubAllGlobals() })

it('preserves a neutral accepted response and the existing recovery redirect', async () => {
  await submit()
  expect(fixture.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith('owned@example.test', {
    redirectTo: 'https://owned.test/sign-in/reset',
  })
  const tree = view()
  expect(textOf(tree)).toContain('Revisa tu correo')
  expect(textOf(tree)).toContain('Si existe una cuenta con ese email')
  expect(nodes(tree).some(node => node.props.role === 'alert')).toBe(false)
  expect(nodes(tree).some(node => node.type === 'form')).toBe(false)
})

it.each([
  { code: 'unexpected_failure', message: 'SMTP internal key=private-provider-secret' },
  { code: 'over_email_send_rate_limit', message: 'Rate limit for owned@example.test', status: 429 },
  { code: 'user_not_found', message: 'User owned@example.test does not exist' },
])('keeps SDK rejection $code generic and retryable without claiming success', async sdkError => {
  fixture.resetPasswordForEmail.mockResolvedValue({ data: null, error: sdkError })
  await submit()
  expectRetryableFailure()
  const visible = textOf(view())
  expect(visible).not.toContain(sdkError.message)
  expect(visible).not.toContain(sdkError.code)
  expect(visible).not.toContain('private-provider-secret')
})

it('handles a rejected network promise and restores the form', async () => {
  fixture.resetPasswordForEmail.mockRejectedValue(new Error('Network failure token=private-access-token'))
  await submit()
  expectRetryableFailure()
  expect(textOf(view())).not.toContain('private-access-token')
})

it('handles client initialization failure without leaking configuration', async () => {
  fixture.createClient.mockImplementationOnce(() => { throw new Error('private-service-key') })
  await submit()
  expectRetryableFailure()
  expect(fixture.resetPasswordForEmail).not.toHaveBeenCalled()
  expect(textOf(view())).not.toContain('private-service-key')
})

it('clears the previous error while retrying and waits for acceptance before success', async () => {
  fixture.resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { message: 'SMTP failure' } })
  await submit()
  expectRetryableFailure()
  let accept!: (value: { data: object; error: null }) => void
  fixture.resetPasswordForEmail.mockReturnValueOnce(new Promise(resolve => { accept = resolve }))
  const pending = submit(), tree = view()
  expect(button(tree).props.disabled).toBe(true)
  expect(textOf(button(tree))).toBe('Enviando…')
  expect(nodes(tree).some(node => node.props.role === 'alert')).toBe(false)
  expect(textOf(tree)).not.toContain('Revisa tu correo')
  accept({ data: {}, error: null })
  await pending
  expect(textOf(view())).toContain('Revisa tu correo')
  expect(fixture.resetPasswordForEmail).toHaveBeenCalledTimes(2)
})
