import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'

const fixture = vi.hoisted(() => ({
  stateIndex: 0, refIndex: 0, effectIndex: 0, states: [] as unknown[], refs: [] as { current: unknown }[],
  effects: [] as { deps?: unknown[]; cleanup?: () => void }[], commits: [] as (() => void)[], fetch: vi.fn(),
}))
vi.mock('react', async () => ({
  ...await vi.importActual('react'),
  useId: () => 'confirmation-email',
  useState: (initial: unknown) => {
    const index = fixture.stateIndex++
    if (!(index in fixture.states)) fixture.states[index] = typeof initial === 'function' ? initial() : initial
    return [fixture.states[index], (value: unknown) => {
      fixture.states[index] = typeof value === 'function' ? value(fixture.states[index]) : value
    }]
  },
  useRef: (initial: unknown) => fixture.refs[fixture.refIndex++] ??= { current: initial },
  useEffect: (effect: () => (() => void) | void, deps?: unknown[]) => {
    const index = fixture.effectIndex++, previous = fixture.effects[index]
    if (!previous || !deps || deps.length !== previous.deps?.length || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))) {
      fixture.commits.push(() => {
        previous?.cleanup?.()
        const cleanup = effect()
        fixture.effects[index] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined }
      })
    }
  },
}))

import { ResendVerificationButton } from '@/components/auth/resend-verification-button'

type Node = ReactElement<Record<string, unknown>>
let props: Parameters<typeof ResendVerificationButton>[0]
function nodes(value: ReactNode): Node[] {
  return Children.toArray(value).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...nodes(child.props.children as ReactNode)] : [])
}
function text(value: ReactNode): string {
  return Children.toArray(value).map(child => isValidElement<Record<string, unknown>>(child)
    ? text(child.props.children as ReactNode) : String(child)).join(' ').replace(/\s+/g, ' ')
}
function view() {
  fixture.stateIndex = 0; fixture.refIndex = 0; fixture.effectIndex = 0
  const result = ResendVerificationButton(props)
  fixture.commits.splice(0).forEach(commit => commit())
  return result
}
function button() { return nodes(view()).find(node => node.type === 'button')! }
function setEmail(value: string) {
  const input = nodes(view()).find(node => node.type === 'input')!
  ;(input.props.onChange as (event: unknown) => void)({ target: { value } })
}
function submit() {
  const form = view(), preventDefault = vi.fn()
  const result = form.props.onSubmit({ preventDefault } as unknown as React.FormEvent)
  expect(preventDefault).toHaveBeenCalledOnce()
  return result
}
function unmount() {
  fixture.effects.forEach(effect => effect.cleanup?.())
  fixture.effects = []
}
function accepted(seconds?: number) {
  return Response.json({ message: 'Provider text should not be used', ...(seconds === undefined ? {} : { retryAfterSeconds: seconds }) }, { status: 202 })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  fixture.stateIndex = 0; fixture.refIndex = 0; fixture.effectIndex = 0
  fixture.states = []; fixture.refs = []; fixture.effects = []; fixture.commits = []
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime('2026-10-22T13:00:00Z')
  fixture.fetch.mockReset().mockResolvedValue(accepted())
  vi.stubGlobal('fetch', fixture.fetch)
  props = { email: 'owned@example.test' }
})
afterEach(() => { unmount(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('provides an explicit bounded email form without a session or automatic requests', () => {
  props = {}
  const tree = view(), input = nodes(tree).find(node => node.type === 'input')!
  expect(input.props).toMatchObject({ id: 'confirmation-email', type: 'email', value: '', maxLength: 254, required: true })
  expect(nodes(tree).find(node => node.type === 'label')?.props.htmlFor).toBe(input.props.id)
  expect(button().props.disabled).toBe(false)
  expect(fixture.fetch).not.toHaveBeenCalled()
})

it('posts the email only in the request body and uses the free default destination', async () => {
  setEmail(' owned@example.test ')
  await submit()
  expect(fixture.fetch).toHaveBeenCalledOnce()
  const [url, options] = fixture.fetch.mock.calls[0]
  expect(url).toBe('/api/auth/resend-confirmation')
  expect(options).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: { 'content-type': 'application/json' } })
  expect(JSON.parse(options.body)).toEqual({ email: 'owned@example.test', next: '/play' })
  expect(text(view())).toContain('Si hay una cuenta pendiente para ese correo')
  expect(text(view())).not.toContain('Provider text')
  expect(text(button())).toContain('60s')
  expect(button().props.disabled).toBe(true)
})

it.each(['/play/2048/ticket?from=practice', '/tournaments/10000000-0000-0000-0000-000000000001'])(
  'preserves a selected internal return %s', async destination => {
    props.returnTo = destination
    await submit()
    expect(JSON.parse(fixture.fetch.mock.calls[0][1].body).next).toBe(destination)
  },
)

it.each(['https://outside.test', '//outside.test', '/onboarding?next=/onboarding', '/play?' + 'x'.repeat(2050)])(
  'replaces an unsafe, looping or oversized return with free practice: %s', async destination => {
    props.returnTo = destination
    await submit()
    expect(JSON.parse(fixture.fetch.mock.calls[0][1].body).next).toBe('/play')
  },
)

it.each(['', 'invalid', 'two@@example.test', 'a b@example.test', 'a'.repeat(255) + '@example.test'])(
  'rejects invalid email locally without disclosing account information: %s', async address => {
    setEmail(address)
    await submit()
    expect(fixture.fetch).not.toHaveBeenCalled()
    expect(text(view())).toContain('Revisa el email e inténtalo nuevamente.')
  },
)

it('ignores a duplicate submit before React can render the loading state', async () => {
  const response = deferred<Response>()
  fixture.fetch.mockReturnValueOnce(response.promise)
  const form = view(), event = { preventDefault: vi.fn() } as unknown as React.FormEvent
  const first = form.props.onSubmit(event), second = form.props.onSubmit(event)
  expect(fixture.fetch).toHaveBeenCalledOnce()
  expect(button().props.disabled).toBe(true)
  response.resolve(accepted())
  await Promise.all([first, second])
  expect(text(view())).toContain('Si hay una cuenta pendiente')
})

it('starts signup with a wait and releases it after 60 seconds without sending automatically', async () => {
  props.initialCooldownSeconds = 60
  expect(text(button())).toContain('60s')
  await submit()
  expect(fixture.fetch).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(60000)
  expect(button().props.disabled).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
  expect(fixture.fetch).not.toHaveBeenCalled()
  await submit()
  expect(fixture.fetch).toHaveBeenCalledOnce()
})

it('honors a quota retry duration and rejects programmatic submits during the wait', async () => {
  fixture.fetch.mockResolvedValueOnce(Response.json({ error: 'Account/provider details', retryAfterSeconds: 3 },
    { status: 429, headers: { 'Retry-After': '9' } }))
  await submit()
  expect(text(view())).toContain('Espera antes de solicitar otro enlace.')
  expect(text(button())).toContain('3s')
  expect(text(view())).not.toContain('Account/provider')
  await submit()
  expect(fixture.fetch).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(1000)
  expect(text(button())).toContain('2s')
  await vi.advanceTimersByTimeAsync(2000)
  expect(button().props.disabled).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
  await submit()
  expect(fixture.fetch).toHaveBeenCalledTimes(2)
})

it('honors Retry-After when the quota body is absent or malformed', async () => {
  fixture.fetch.mockResolvedValueOnce(new Response('not-json', { status: 429, headers: { 'Retry-After': '7' } }))
  await submit()
  expect(text(button())).toContain('7s')
  expect(text(view())).toContain('Espera antes de solicitar otro enlace.')
})

it.each([0, -2, 1.5, Infinity, '20', 1000000])('uses the safe 60-second default for invalid server delay %s', async delay => {
  fixture.fetch.mockResolvedValueOnce(Response.json({ retryAfterSeconds: delay }, { status: 202 }))
  await submit()
  expect(text(button())).toContain('60s')
})

it('uses a valid accepted delay from the server', async () => {
  fixture.fetch.mockResolvedValueOnce(accepted(12))
  await submit()
  expect(text(button())).toContain('12s')
})

it.each([400, 403, 503, 500])('keeps HTTP %s neutral and retryable without account or provider details', async status => {
  fixture.fetch.mockResolvedValueOnce(Response.json({ error: 'No such account owned@example.test; private-provider-secret' }, { status }))
  await submit()
  const output = text(view())
  expect(output).toContain(status === 400 ? 'Revisa el email e inténtalo nuevamente.' : 'No pudimos procesar la solicitud.')
  expect(output).not.toMatch(/No such account|private-provider|Si hay una cuenta pendiente/)
  expect(button().props.disabled).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})

it.each([200, 202])('does not claim success for malformed JSON with HTTP %s', async status => {
  fixture.fetch.mockResolvedValueOnce(new Response('invalid-json', { status }))
  await submit()
  expect(text(view())).toContain('No pudimos procesar la solicitud.')
  expect(text(view())).not.toContain('Si hay una cuenta pendiente')
  expect(button().props.disabled).toBe(false)
})

it('handles network failure and permits an explicit retry without leaking exception text', async () => {
  fixture.fetch.mockRejectedValueOnce(new Error('private-network-token'))
  await submit()
  expect(text(view())).not.toContain('private-network-token')
  expect(text(view())).toContain('No pudimos procesar la solicitud.')
  expect(button().props.disabled).toBe(false)
  await submit()
  expect(text(view())).toContain('Si hay una cuenta pendiente')
})

it('times out a hung request and ignores its late successful response', async () => {
  const response = deferred<Response>()
  fixture.fetch.mockReturnValueOnce(response.promise)
  const pending = submit()
  await vi.advanceTimersByTimeAsync(15000)
  expect(fixture.fetch.mock.calls[0][1].signal.aborted).toBe(true)
  expect(text(view())).toContain('No pudimos procesar la solicitud.')
  expect(button().props.disabled).toBe(false)
  response.resolve(accepted())
  await pending
  expect(text(view())).not.toContain('Si hay una cuenta pendiente')
  expect(button().props.disabled).toBe(false)
})

it('ignores an old response after changing email and cannot overwrite a newer request or its cooldown', async () => {
  const previous = deferred<Response>(), latest = deferred<Response>()
  fixture.fetch.mockReturnValueOnce(previous.promise).mockReturnValueOnce(latest.promise)
  const first = submit()
  setEmail('second@example.test')
  expect(fixture.fetch.mock.calls[0][1].signal.aborted).toBe(true)
  const second = submit()
  previous.resolve(Response.json({ retryAfterSeconds: 2 }, { status: 429 }))
  await first
  expect(text(button())).toContain('Solicitando enlace')
  expect(button().props.disabled).toBe(true)
  latest.resolve(accepted(25))
  await second
  expect(text(button())).toContain('25s')
  expect(text(view())).toContain('Si hay una cuenta pendiente')
})

it('aborts and ignores a response body that finishes after unmount, with no timers left', async () => {
  const body = deferred<object>()
  fixture.fetch.mockResolvedValueOnce({ status: 202, headers: new Headers(), json: () => body.promise })
  const pending = submit()
  await Promise.resolve()
  const states = [...fixture.states]
  unmount()
  expect(fixture.fetch.mock.calls[0][1].signal.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  body.resolve({ retryAfterSeconds: 60 })
  await pending
  expect(fixture.states).toEqual(states)
})
