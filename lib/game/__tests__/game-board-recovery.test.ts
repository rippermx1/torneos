import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[],
  effects: [] as { deps?: unknown[]; cleanup?: () => void }[], callbacks: [] as { deps: unknown[]; fn: unknown }[],
  pending: [] as (() => void)[], stateIndex: 0, refIndex: 0, effectIndex: 0, callbackIndex: 0 }))
vi.mock('react', async () => ({ ...await vi.importActual('react'),
  memo: (fn: unknown) => fn,
  useState: (initial: unknown) => {
    const i = hooks.stateIndex++; if (hooks.states.length <= i) hooks.states[i] = initial
    return [hooks.states[i], (value: unknown) => { hooks.states[i] = typeof value === 'function' ? value(hooks.states[i]) : value }]
  },
  useRef: (initial: unknown) => { const i = hooks.refIndex++; return hooks.refs[i] ?? (hooks.refs[i] = { current: initial }) },
  useCallback: (fn: unknown, deps: unknown[]) => {
    const i = hooks.callbackIndex++, prev = hooks.callbacks[i]
    if (!prev || deps.some((dep, index) => dep !== prev.deps[index])) hooks.callbacks[i] = { deps, fn }
    return hooks.callbacks[i].fn
  },
  useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
    const i = hooks.effectIndex++, prev = hooks.effects[i]
    if (!prev || deps.some((dep, index) => dep !== prev.deps?.[index])) {
      hooks.pending.push(() => { prev?.cleanup?.(); hooks.effects[i] = { deps, cleanup: effect() } })
    }
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/link', () => ({ default: 'a' }))
import { GameBoardClient } from '@/components/game/game-board-client'

const config = { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout',
  playWindowEnd: '2026-10-01T17:00:00Z', leaderboardUrl: '/ranking' }
const initial = { stateConfirmed: true, gameId: 'g1', status: 'active',
  board: [[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], score: 4, moveNumber: 2, moveCount: 0,
  gameOver: false, endReason: null, endedAt: null, deadlineAt: '2026-10-01T16:00:01Z', serverNow: '2026-10-01T16:00:00Z' }
const final = { ...initial, status: 'completed', gameOver: true, score: 128, moveCount: 1, moveNumber: 3,
  board: [[4,8,16,2],[8,16,32,64],[16,32,64,128],[32,64,128,256]], endReason: 'no_moves', endedAt: '2026-10-01T16:00:01Z' }
function render() {
  hooks.stateIndex = hooks.refIndex = hooks.effectIndex = hooks.callbackIndex = 0
  const tree = GameBoardClient({ config }); for (const effect of hooks.pending.splice(0)) effect()
  return tree
}
function state() { return hooks.states[0] as Record<string, unknown> }
async function load(data: Record<string, unknown>) {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(data)); vi.stubGlobal('fetch', fetch)
  render(); await vi.advanceTimersByTimeAsync(0); render(); return fetch
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date','performance','setTimeout','clearTimeout','setInterval','clearInterval'] })
  vi.setSystemTime(new Date('2026-10-01T16:00:00Z'))
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.callbacks = []; hooks.pending = []
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, clearTimeout }))
})
afterEach(() => { for (const effect of hooks.effects) effect.cleanup?.(); vi.unstubAllGlobals(); vi.useRealTimers() })

it.each([['completed','no_moves'],['completed','timeout'],['abandoned','self_ended']])('loads a %s/%s result and stops its timer', async (status, endReason) => {
  const fetch = await load({ ...final, status, endReason })
  expect(state()).toMatchObject({ gameOver: true, score: 128, board: final.board, moveNumber: 3, resultStatus: status, endReason })
  await vi.advanceTimersByTimeAsync(2000)
  expect(state().timedOut).toBe(endReason === 'timeout'); expect(fetch).toHaveBeenCalledTimes(1)
})
it('uses the full server result from timeout rather than ending locally with the previous score', async () => {
  const fetch = await load(initial); fetch.mockResolvedValueOnce(Response.json({ ...final, timedOut: false }))
  await vi.advanceTimersByTimeAsync(1000); render()
  expect(state()).toMatchObject({ gameOver: true, timedOut: false, score: 128, board: final.board, endReason: 'no_moves' })
  expect(fetch.mock.calls.map(call => call[0])).toEqual(['/start','/timeout'])
})
it('does not fabricate a terminal result on failed expiration persistence', async () => {
  const fetch = await load(initial); fetch.mockResolvedValueOnce(Response.json({ code: 'GAME_CLOSURE_UNCONFIRMED' }, { status: 503 }))
  await vi.advanceTimersByTimeAsync(1000); render()
  expect(state()).toMatchObject({ gameOver: false, score: 4, board: initial.board })
  expect(hooks.states[3]).toContain('No se confirmó el cierre')
  await vi.advanceTimersByTimeAsync(2000); expect(fetch).toHaveBeenCalledTimes(2)
})
it('keeps a valid game active when the server rejects expiration and supplies 45 seconds', async () => {
  const fetch = await load(initial)
  fetch.mockResolvedValueOnce(Response.json({ ...initial, deadlineAt: '2026-10-01T16:00:46Z', serverNow: '2026-10-01T16:00:01Z' }))
  await vi.advanceTimersByTimeAsync(1000); render(); await vi.advanceTimersByTimeAsync(1000)
  expect(state().gameOver).toBe(false); expect(hooks.states[4]).toBe(44); expect(fetch).toHaveBeenCalledTimes(2)
})
it('recovers a lost response through a read without replaying the optimistic direction', async () => {
  const fetch = await load({ ...initial, deadlineAt: '2026-10-01T16:01:00Z' })
  fetch.mockRejectedValueOnce(new Error('lost move response'))
  window.dispatchEvent(Object.assign(new Event('keydown'), { key: 'ArrowLeft' }))
  await vi.advanceTimersByTimeAsync(0)
  const errorView = render()
  expect(hooks.states[3]).toContain('No se confirmó el movimiento')
  fetch.mockResolvedValueOnce(Response.json(final))
  errorView.props.children[1].props.onClick()
  await vi.advanceTimersByTimeAsync(0); render()
  expect(state()).toMatchObject({ gameOver: true, score: 128, board: final.board })
  expect(fetch.mock.calls.map(call => call[0])).toEqual(['/start','/move','/start'])
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ recoverOnly: true, gameId: 'g1' })
})
it('handles a direction rejected because another tab already completed the game', async () => {
  const fetch = await load({ ...initial, deadlineAt: '2026-10-01T16:01:00Z' })
  fetch.mockResolvedValueOnce(Response.json(final, { status: 400 }))
  window.dispatchEvent(Object.assign(new Event('keydown'), { key: 'ArrowLeft' }))
  await vi.advanceTimersByTimeAsync(0); render()
  expect(state()).toMatchObject({ gameOver: true, score: 128, moveNumber: 3, board: final.board })
  expect(hooks.states[3]).toBeNull()
  window.dispatchEvent(Object.assign(new Event('keydown'), { key: 'ArrowRight' }))
  expect(fetch).toHaveBeenCalledTimes(2)
})
