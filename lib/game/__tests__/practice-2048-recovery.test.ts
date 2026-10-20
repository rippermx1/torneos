import { afterEach, describe, expect, it, vi } from 'vitest'
import { Practice2048Recovery } from '../practice-2048-recovery'
import { PRACTICE_2048_CHECKPOINT_KEY, type Saved2048Practice } from '../2048-practice-checkpoint'
import { createLocalPracticeGame, applyLocalPracticeMove } from '../local-practice'
import { PERSONAL_2048_RULES_VERSION } from '../personal-2048-progress'
import { Unity2048Session, type Practice2048Event } from '../unity-2048-session'
import { Free2048Experience } from '../free-2048-experience'
import { readSessions2048, SESSIONS_2048_STORAGE_KEY } from '../sessions-2048'

const firstId = '00000000-0000-4000-8000-000000000001'
const nextId = '00000000-0000-4000-8000-000000000002'
function saved(): Saved2048Practice {
  const state = createLocalPracticeGame('recovery-natural')
  const moved = applyLocalPracticeMove(state, 'left')
  return { version: 1, rulesVersion: PERSONAL_2048_RULES_VERSION, category: 'observed_browser', practiceId: firstId,
    startedAt: 9_000, savedAt: 10_000, bestBefore: 512,
    state: { board: moved.board, score: moved.score, seed: state.seed, moveNumber: moved.moveNumber } }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(finish => { resolve = finish })
  return { promise, resolve }
}

/** Doubles isolate lease ordering, disposal and failed preconditions; the real store/engine validate all saved states. */
function fixture(initial: Saved2048Practice | null = saved(), category: 'observed_browser' | 'synthetic' = 'observed_browser') {
  const key = `${PRACTICE_2048_CHECKPOINT_KEY}${category === 'synthetic' ? '.synthetic' : ''}`
  const data = new Map<string, string>()
  if (initial) data.set(key, JSON.stringify(initial))
  const storage = { getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value) }),
    removeItem: vi.fn((key: string) => { data.delete(key) }) }
  let checkpoint: { practiceId: string; state: Saved2048Practice['state'] } | null = null
  let metadata: { practiceId: string; startedAt: number; bestBefore: number } | null = null
  let state = { started: false, game_over: false }
  let publish = () => {}
  let time = 11_000
  const session = {
    snapshot: vi.fn(() => ({ ...state })),
    start: vi.fn(async (seed?: string, options?: { freeMode?: 'practice' | 'daily' }) => {
      state = { started: true, game_over: false }
      checkpoint = options?.freeMode === 'daily' ? null : { practiceId: nextId, state: createLocalPracticeGame(seed) }
      metadata = checkpoint ? { practiceId: nextId, startedAt: time, bestBefore: 512 } : null
      publish()
    }),
    practiceCheckpoint: vi.fn(() => checkpoint && structuredClone(checkpoint)),
    canRestorePractice: vi.fn(() => !state.started),
    restorePractice: vi.fn((value: Saved2048Practice) => {
      checkpoint = { practiceId: value.practiceId, state: structuredClone(value.state) }
      state = { started: true, game_over: false }; publish(); return true
    }),
  }
  const experience = {
    canResumePractice: vi.fn(() => true),
    resumePractice: vi.fn((value: Saved2048Practice) => {
      metadata = { practiceId: value.practiceId, startedAt: value.startedAt, bestBefore: value.bestBefore }; return true
    }),
    practiceCheckpointMetadata: vi.fn(() => metadata && { ...metadata }),
  }
  const release = vi.fn()
  const acquireLock = vi.fn(async () => release as (() => void) | null)
  const changed = vi.fn()
  const options = { session: session as unknown as Unity2048Session, experience: experience as unknown as Free2048Experience,
    getStorage: () => storage, category, now: () => time, acquireLock, changed }
  const controller = new Practice2048Recovery(options)
  publish = () => controller.capture()
  return { controller, options, session, experience, data, key, storage, release, acquireLock, changed,
    time: (value: number) => { time = value }, checkpoint: (value: typeof checkpoint) => { checkpoint = value },
    metadata: (value: typeof metadata) => { metadata = value },
    move: () => {
      if (!checkpoint) throw new Error('No practice')
      const moved = applyLocalPracticeMove(checkpoint.state, 'down')
      checkpoint.state = { board: moved.board, score: moved.score, seed: checkpoint.state.seed, moveNumber: moved.moveNumber }
      publish()
    }, finish: () => { checkpoint = null; state.game_over = true; publish() } }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('private practice recovery controller', () => {
  it('reads lazily on ready, deep-clones its snapshot and never acquires a lease just to offer recovery', () => {
    const f = fixture()
    expect(f.storage.getItem).not.toHaveBeenCalled()
    f.controller.ready()
    expect(f.controller.snapshot()).toEqual({ status: 'ready', checkpoint: saved(), pending: false })
    expect(f.acquireLock).not.toHaveBeenCalled(); expect(f.storage.setItem).not.toHaveBeenCalled()
    f.controller.snapshot().checkpoint!.state.board[0][0] = 999
    expect(f.controller.snapshot().checkpoint).toEqual(saved())
  })
  it('rechecks storage under the acquired lease and installs observation identity before publishing the restored session', async () => {
    const f = fixture(), waited = deferred<(() => void) | null>()
    f.options.acquireLock.mockImplementationOnce(() => waited.promise)
    f.controller.ready()
    const pending = f.controller.resume()
    expect(f.controller.snapshot().pending).toBe(true)
    const newer = saved(); newer.savedAt = 10_500; newer.bestBefore = 1024
    f.data.set(f.key, JSON.stringify(newer))
    waited.resolve(f.release)
    expect(await pending).toBe(true)
    expect(f.experience.resumePractice).toHaveBeenCalledWith(newer)
    expect(f.session.restorePractice).toHaveBeenCalledWith(newer)
    expect(f.experience.resumePractice.mock.invocationCallOrder[0]).toBeLessThan(f.session.restorePractice.mock.invocationCallOrder[0])
    expect(f.session.start).not.toHaveBeenCalled()
    expect(f.storage.setItem).not.toHaveBeenCalled()
    expect(f.controller.snapshot()).toEqual({ status: 'ready', checkpoint: newer, pending: false })
    expect(f.release).not.toHaveBeenCalled()
  })
  it('captures subsequent real state with the original identity/date and avoids writes on repeated publishes', async () => {
    const f = fixture(); f.controller.ready(); await f.controller.resume()
    f.controller.capture(); f.controller.capture()
    expect(f.storage.setItem).not.toHaveBeenCalled()
    f.time(12_000); f.move()
    const stored = JSON.parse(f.data.get(f.key)!) as Saved2048Practice
    expect(stored).toMatchObject({ practiceId: firstId, startedAt: 9_000, savedAt: 12_000, bestBefore: 512 })
    expect(stored.state.moveNumber).toBeGreaterThan(saved().state.moveNumber)
    const writes = f.storage.setItem.mock.calls.length
    f.time(13_000); f.controller.capture()
    expect(f.storage.setItem).toHaveBeenCalledTimes(writes)
  })
  it('explicit new practice clears a valid previous checkpoint before starting and records only its new identity', async () => {
    const f = fixture(); f.controller.ready()
    expect(await f.controller.start('practice', 'new-natural')).toBe(true)
    expect(f.storage.removeItem.mock.invocationCallOrder[0]).toBeLessThan(f.session.start.mock.invocationCallOrder[0])
    expect(f.session.start).toHaveBeenCalledWith('new-natural', { freeMode: 'practice' })
    expect(f.controller.snapshot().checkpoint).toMatchObject({ practiceId: nextId, startedAt: 11_000, state: { seed: 'new-natural' } })
    expect(f.release).not.toHaveBeenCalled()
  })
  it('clears only its own saved practice when ending or entering assisted training, then releases its lease', async () => {
    const f = fixture(); await f.controller.resume(); f.finish()
    expect(f.data.has(f.key)).toBe(false)
    expect(f.release).toHaveBeenCalledTimes(1)
    expect(f.controller.snapshot()).toEqual({ status: 'ready', checkpoint: null, pending: false })
    f.controller.capture(); expect(f.release).toHaveBeenCalledTimes(1)
  })
  it('switches to daily without saving its board and releases an owned practice', async () => {
    const f = fixture(); await f.controller.resume()
    f.storage.setItem.mockClear()
    expect(await f.controller.start('daily', '2048-daily-v1:2026-10-20')).toBe(true)
    expect(f.session.start).toHaveBeenLastCalledWith('2048-daily-v1:2026-10-20', { freeMode: 'daily' })
    expect(f.data.has(f.key)).toBe(false); expect(f.storage.setItem).not.toHaveBeenCalled()
    expect(f.release).toHaveBeenCalledTimes(1)
  })
  it('does not touch a saved practice owned by another tab when starting daily', async () => {
    const f = fixture(); f.controller.ready(); const raw = f.data.get(f.key)
    expect(await f.controller.start('daily', 'daily')).toBe(true)
    expect(f.data.get(f.key)).toBe(raw); expect(f.acquireLock).not.toHaveBeenCalled()
  })
  it('preserves the last capture on destroy while releasing the lease once', async () => {
    const f = fixture(); await f.controller.resume(); const raw = f.data.get(f.key)
    f.controller.destroy(); f.controller.destroy(); f.controller.capture()
    expect(f.data.get(f.key)).toBe(raw); expect(f.release).toHaveBeenCalledTimes(1)
    expect(await f.controller.start('practice')).toBe(false); expect(await f.controller.resume()).toBe(false)
  })
  it('blocks restore into an already active game without requesting another lease', async () => {
    const f = fixture(); await f.controller.resume()
    expect(await f.controller.resume()).toBe(false)
    expect(f.acquireLock).toHaveBeenCalledTimes(1); expect(f.session.restorePractice).toHaveBeenCalledTimes(1)
    expect(f.controller.snapshot().status).toBe('busy'); expect(f.release).not.toHaveBeenCalled()
  })
  it.each(['canResumePractice', 'canRestorePractice'] as const)('preserves a stale save when %s rejects and releases its lease', async method => {
    const f = fixture(); const raw = f.data.get(f.key)
    if (method === 'canResumePractice') f.experience.canResumePractice.mockReturnValue(false)
    else f.session.canRestorePractice.mockReturnValue(false)
    expect(await f.controller.resume()).toBe(false)
    expect(f.controller.snapshot().status).toBe('stale')
    expect(f.experience.resumePractice).not.toHaveBeenCalled(); expect(f.session.restorePractice).not.toHaveBeenCalled()
    expect(f.data.get(f.key)).toBe(raw); expect(f.release).toHaveBeenCalledTimes(1)
  })
  it('reports a busy lease, preserves its save, and still allows an independent new practice in memory', async () => {
    const f = fixture(); const raw = f.data.get(f.key); f.acquireLock.mockResolvedValue(null)
    expect(await f.controller.resume()).toBe(false)
    expect(f.controller.snapshot().status).toBe('busy'); expect(f.session.restorePractice).not.toHaveBeenCalled()
    expect(await f.controller.start('practice', 'memory-only')).toBe(true)
    expect(f.data.get(f.key)).toBe(raw); expect(f.storage.setItem).not.toHaveBeenCalled()
    expect(f.session.start).toHaveBeenCalledWith('memory-only', { freeMode: 'practice' })
  })
  it('fails recovery clearly without Web Locks while ordinary new play remains usable', async () => {
    vi.stubGlobal('navigator', {})
    const f = fixture(), controller = new Practice2048Recovery({ ...f.options, acquireLock: undefined })
    controller.ready(); expect(controller.snapshot().status).toBe('unsupported')
    expect(await controller.resume()).toBe(false)
    expect(await controller.start('practice', 'memory-only')).toBe(true)
    expect(f.data.get(f.key)).toBe(JSON.stringify(saved()))
  })
  it.each(['start', 'resume'] as const)('serializes actions and invalidates awaited %s acquisition after disposal', async action => {
    const f = fixture(), lease = deferred<(() => void) | null>()
    f.acquireLock.mockImplementationOnce(() => lease.promise)
    const pending = action === 'start' ? f.controller.start('practice') : f.controller.resume()
    expect(await f.controller.start('daily')).toBe(false)
    expect(await f.controller.resume()).toBe(false)
    const notifications = f.changed.mock.calls.length
    f.controller.destroy(); lease.resolve(f.release)
    expect(await pending).toBe(false)
    expect(f.session.start).not.toHaveBeenCalled(); expect(f.session.restorePractice).not.toHaveBeenCalled()
    expect(f.release).toHaveBeenCalledTimes(1); expect(f.changed).toHaveBeenCalledTimes(notifications)
    expect(f.data.get(f.key)).toBe(JSON.stringify(saved()))
  })
  it('rereads a removed checkpoint after waiting, with no stale restore or write', async () => {
    const f = fixture(), lease = deferred<(() => void) | null>()
    f.acquireLock.mockImplementationOnce(() => lease.promise); f.controller.ready()
    const pending = f.controller.resume(); f.data.delete(f.key); lease.resolve(f.release)
    expect(await pending).toBe(false); expect(f.session.restorePractice).not.toHaveBeenCalled()
    expect(f.controller.snapshot().status).toBe('stale'); expect(f.release).toHaveBeenCalledTimes(1)
  })
  it('never overwrites a corrupt checkpoint while permitting a new memory-only practice', async () => {
    const f = fixture(); f.data.set(f.key, '{invalid private data')
    f.controller.ready(); expect(f.controller.snapshot().status).toBe('invalid')
    expect(await f.controller.resume()).toBe(false)
    expect(await f.controller.start('practice', 'memory-only')).toBe(true)
    expect(f.data.get(f.key)).toBe('{invalid private data')
    expect(f.controller.snapshot().status).toBe('invalid')
  })
  it('fails closed for recovery when storage access or lock acquisition fails, without blocking new play', async () => {
    const f = fixture()
    f.storage.getItem.mockImplementation(() => { throw new Error('denied') })
    expect(await f.controller.resume()).toBe(false)
    expect(f.controller.snapshot().status).toBe('unavailable')
    expect(await f.controller.start('practice', 'memory')).toBe(true)
    const other = fixture(); other.acquireLock.mockRejectedValue(new Error('lock denied'))
    expect(await other.controller.start('practice', 'memory')).toBe(true)
    expect(other.controller.snapshot().status).toBe('unavailable')
  })
  it('does not replace an externally changed save after CAS detects conflict, even on later captures', async () => {
    const f = fixture(); await f.controller.resume()
    const foreign = { ...saved(), practiceId: nextId }; const raw = JSON.stringify(foreign)
    f.data.set(f.key, raw); f.move()
    expect(f.controller.snapshot().status).toBe('conflict'); expect(f.data.get(f.key)).toBe(raw)
    f.move(); f.finish(); expect(f.data.get(f.key)).toBe(raw)
    expect(f.release).toHaveBeenCalledTimes(1)
  })
  it('rejects identity mismatch rather than persisting a board under unrelated observation metadata', async () => {
    const f = fixture(); await f.controller.resume()
    f.metadata({ practiceId: nextId, startedAt: 9_000, bestBefore: 512 }); f.move()
    expect(f.controller.snapshot().status).toBe('stale')
    expect(f.data.get(f.key)).toBe(JSON.stringify(saved()))
  })
  it('separates synthetic recovery and leaves ordinary browser saves untouched', async () => {
    const f = fixture({ ...saved(), category: 'synthetic' }, 'synthetic')
    f.data.set(PRACTICE_2048_CHECKPOINT_KEY, JSON.stringify(saved()))
    expect(await f.controller.resume()).toBe(true); f.time(12_000); f.move()
    expect(f.controller.snapshot().checkpoint?.category).toBe('synthetic')
    expect(f.data.get(PRACTICE_2048_CHECKPOINT_KEY)).toBe(JSON.stringify(saved()))
  })
  it('cannot restore a saved future timestamp after a device-clock rollback', async () => {
    const f = fixture(); f.time(9_500)
    expect(await f.controller.resume()).toBe(false)
    expect(f.controller.snapshot().status).toBe('invalid'); expect(f.session.restorePractice).not.toHaveBeenCalled()
  })
  it('holds the default browser lock until disposal and scopes it by observation category', async () => {
    const held = new Set<string>()
    const request = vi.fn(async (name: string, _options: unknown, callback: (lock: unknown) => Promise<void>) => {
      if (held.has(name)) return callback(null)
      held.add(name)
      try { await callback({ name }) } finally { held.delete(name) }
    })
    vi.stubGlobal('navigator', { locks: { request } })
    const first = fixture(), second = fixture()
    const a = new Practice2048Recovery({ ...first.options, acquireLock: undefined })
    const b = new Practice2048Recovery({ ...second.options, acquireLock: undefined })
    expect(await a.resume()).toBe(true)
    expect(await b.resume()).toBe(false); expect(b.snapshot().status).toBe('busy')
    expect(request).toHaveBeenCalledWith('torneos.2048.practice-recovery.v1.observed_browser',
      { mode: 'exclusive', ifAvailable: true }, expect.any(Function))
    const synthetic = fixture({ ...saved(), category: 'synthetic' }, 'synthetic')
    const c = new Practice2048Recovery({ ...synthetic.options, acquireLock: undefined })
    expect(await c.resume()).toBe(true)
    a.destroy(); for (let i = 0; i < 3; i++) await Promise.resolve()
    expect(await b.resume()).toBe(true)
    b.destroy(); c.destroy()
  })
  it('contains unexpected session failures and always clears pending state and its lease', async () => {
    const f = fixture(); f.session.start.mockRejectedValue(new Error('unexpected runtime failure'))
    expect(await f.controller.start('practice')).toBe(false)
    expect(f.controller.snapshot()).toMatchObject({ status: 'unavailable', pending: false })
    expect(f.release).toHaveBeenCalledTimes(1)
    const other = fixture(); other.session.canRestorePractice.mockImplementation(() => { throw new Error('unexpected') })
    expect(await other.controller.resume()).toBe(false)
    expect(other.controller.snapshot()).toMatchObject({ status: 'unavailable', pending: false })
    expect(other.release).toHaveBeenCalledTimes(1)
  })
  it('restores real Session + Free identity/RNG after natural play without duplicate lifecycle, marks or activity', async () => {
    const data = new Map<string, string>()
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) },
      removeItem: (key: string) => { data.delete(key) } } as Storage
    let time = Date.now() - 60_000, id = 0, leased = false
    const now = () => time++
    const acquireLock = async () => {
      if (leased) return null
      leased = true; return () => { leased = false }
    }
    const recordAccount = vi.fn().mockResolvedValue({ status: 'recorded' })
    function runtime() {
      const events: Practice2048Event[] = []
      const experience = new Free2048Experience({ getStorage: () => storage, category: 'observed_browser', now,
        measureAccountActivity: true, recordAccount,
        uuid: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}` })
      const session = new Unity2048Session(() => { recovery.capture() }, vi.fn(), undefined, undefined,
        event => { events.push(event); experience.observe(event) })
      const recovery = new Practice2048Recovery({ session, experience, getStorage: () => storage, category: 'observed_browser', now, acquireLock })
      experience.ready(); recovery.ready()
      return { experience, session, recovery, events }
    }
    const before = runtime()
    expect(await before.recovery.start('practice', 'recovery-real')).toBe(true)
    for (let input = 0; before.session.snapshot().move_number < 24 && input < 200; input++) {
      await before.session.move((['left', 'up', 'right', 'down'] as const)[input % 4])
    }
    const checkpoint = before.recovery.snapshot().checkpoint!
    expect(checkpoint.state.moveNumber).toBeGreaterThanOrEqual(24)
    const board = before.session.snapshot()
    const personal = before.experience.snapshot().personal
    before.experience.checkpoint(); before.recovery.destroy(); before.session.destroy()
    const ledgerBefore = readSessions2048(data.get(SESSIONS_2048_STORAGE_KEY)!)!
    const counts = (ledger: typeof ledgerBefore) => ['start', 'first-valid-move', '20-valid-moves', 'end', 'restart']
      .map(kind => ledger.events.filter(event => event.kind === kind).length)
    const accountCalls = recordAccount.mock.calls.length
    const after = runtime()
    expect(await after.recovery.resume()).toBe(true)
    expect(after.events).toEqual([])
    expect(after.session.snapshot()).toMatchObject({ cells: board.cells, score: board.score, move_number: board.move_number, started: true })
    expect(after.experience.snapshot().personal).toMatchObject({ currentPracticeId: checkpoint.practiceId,
      history: personal.history, bestBefore: personal.bestBefore })
    expect(counts(readSessions2048(data.get(SESSIONS_2048_STORAGE_KEY)!)!)).toEqual(counts(ledgerBefore))
    expect(recordAccount).toHaveBeenCalledTimes(accountCalls)
    const direction = (['left', 'up', 'right', 'down'] as const).find(value => applyLocalPracticeMove(checkpoint.state, value).moved)!
    const expected = applyLocalPracticeMove(checkpoint.state, direction)
    await after.session.move(direction)
    expect(after.session.snapshot()).toMatchObject({ cells: expected.board.flat(), score: expected.score, move_number: expected.moveNumber })
    expect(after.events).toHaveLength(1); expect(after.events[0]).toMatchObject({ type: 'move', practiceId: checkpoint.practiceId })
    after.recovery.destroy(); after.session.destroy()
  })
})
