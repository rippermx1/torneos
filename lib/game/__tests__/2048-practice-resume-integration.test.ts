import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Free2048Experience } from '../free-2048-experience'
import { Unity2048Session, type Practice2048Event, type TournamentUnityConfig } from '../unity-2048-session'
import { Practice2048CheckpointStore, PRACTICE_2048_CHECKPOINT_KEY, type Saved2048Practice } from '../2048-practice-checkpoint'
import { PERSONAL_2048_PROGRESS_KEY, PERSONAL_2048_RULES_VERSION } from '../personal-2048-progress'
import { SESSIONS_2048_STORAGE_KEY, readSessions2048 } from '../sessions-2048'
import { RETENTION_2048_STORAGE_KEY } from '../retention-2048'
import { getDaily2048Challenge } from '../daily-2048'
import { applyLocalPracticeMove } from '../local-practice'
import type { Direction } from '../engine'

const directions: readonly Direction[] = ['left', 'up', 'right', 'down']
const clock = Date.parse('2026-10-20T02:50:00Z') // 19 October, 23:50 in Chile.
const id = (serial: number) => `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(clock) })
afterEach(() => { vi.useRealTimers() })

function fixture() {
  const data = new Map<string, string>(), writes: string[] = []
  const storage: Storage = {
    get length() { return data.size },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { writes.push(key); data.set(key, value) },
    removeItem: key => { data.delete(key) }, clear: () => data.clear(),
  }
  let serial = 0
  const recordAccount = vi.fn(async () => ({ status: 'recorded' as const }))
  const mount = (category: 'observed_browser' | 'synthetic' = 'observed_browser') => {
    const free = new Free2048Experience({ getStorage: () => storage, category, now: Date.now,
      uuid: () => id(++serial), measureAccountActivity: true, recordAccount })
    const observe = vi.fn((event: Practice2048Event) => free.observe(event)), request = vi.fn(), publish = vi.fn()
    const session = new Unity2048Session(publish, request, undefined, undefined, observe)
    free.ready()
    return { free, session, observe, request, publish }
  }
  const store = (category: 'observed_browser' | 'synthetic' = 'observed_browser') => new Practice2048CheckpointStore({
    getStorage: () => storage, category, now: Date.now,
  })
  const ledger = () => {
    const value = readSessions2048(data.get(SESSIONS_2048_STORAGE_KEY) ?? null)
    expect(value).not.toBeNull(); return value!
  }
  return { data, writes, storage, mount, store, recordAccount, ledger }
}
type Mount = ReturnType<ReturnType<typeof fixture>['mount']>
function capture(mount: Mount, category: Saved2048Practice['category'] = 'observed_browser'): Saved2048Practice {
  mount.free.checkpoint()
  const core = mount.session.practiceCheckpoint(), metadata = mount.free.practiceCheckpointMetadata()
  expect(core).not.toBeNull(); expect(metadata).not.toBeNull()
  expect(core!.practiceId).toBe(metadata!.practiceId)
  return { version: 1, rulesVersion: PERSONAL_2048_RULES_VERSION, category, ...metadata!, savedAt: Date.now(), state: core!.state }
}
async function advanceTo(mount: Mount, validMoves: number) {
  const inputs: Direction[] = []
  for (let input = 0; input < 1000 && mount.session.snapshot().move_number - 2 < validMoves; input++) {
    expect(mount.session.snapshot().game_over).toBe(false)
    const direction = directions[input % directions.length]
    inputs.push(direction); await mount.session.move(direction)
  }
  expect(mount.session.snapshot().move_number - 2).toBe(validMoves)
  await Promise.resolve()
  return inputs
}
function nextValid(mount: Mount) {
  const state = mount.session.practiceCheckpoint()!.state
  const direction = directions.find(value => applyLocalPracticeMove(state, value).moved)
  expect(direction).toBeDefined(); return direction!
}
const gameplay = (session: Unity2048Session) => {
  const state = session.snapshot()
  return { cells: state.cells, score: state.score, moveNumber: state.move_number, gameOver: state.game_over }
}
const lifecycle = (f: ReturnType<typeof fixture>) => f.ledger().events.filter(event =>
  ['start', 'first-valid-move', '20-valid-moves', 'end', 'interrupted', 'restart'].includes(event.kind))

describe('actual 2048 practice recovery across reloads', () => {
  it('restores the same identity/start/RNG without a new practice or milestones, then reaches twenty through a real move', async () => {
    const f = fixture(), original = f.mount()
    await original.session.start('training-demo-0')
    const inputs = await advanceTo(original, 19), saved = capture(original)
    const checkpointStore = f.store(); expect(checkpointStore.write(saved)).toBe(true)
    const personalBefore = f.data.get(PERSONAL_2048_PROGRESS_KEY), retentionBefore = f.data.get(RETENTION_2048_STORAGE_KEY)
    const eventsBefore = lifecycle(f), practiceBefore = f.ledger().practices[0]
    expect(f.recordAccount).toHaveBeenCalledTimes(1)
    original.session.destroy()

    vi.setSystemTime(clock + 60_000)
    const reloaded = f.mount(), reopened = f.store().read().checkpoint!
    expect(reopened).toEqual(saved)
    const afterReady = f.ledger()
    expect(reloaded.free.canResumePractice(reopened)).toBe(true)
    expect(reloaded.session.canRestorePractice(reopened)).toBe(true)
    expect(reloaded.free.resumePractice(reopened)).toBe(true)
    expect(reloaded.session.restorePractice(reopened)).toBe(true)
    expect(reloaded.observe).not.toHaveBeenCalled()
    expect(f.recordAccount).toHaveBeenCalledTimes(1)
    expect(f.data.get(PERSONAL_2048_PROGRESS_KEY)).toBe(personalBefore)
    expect(f.data.get(RETENTION_2048_STORAGE_KEY)).toBe(retentionBefore)
    expect(f.ledger().practices).toEqual([practiceBefore])
    expect(f.ledger().sessions).toEqual(afterReady.sessions)
    expect(lifecycle(f)).toEqual(eventsBefore)
    expect(reloaded.free.practiceCheckpointMetadata()).toEqual({ practiceId: saved.practiceId, startedAt: saved.startedAt, bestBefore: saved.bestBefore })
    expect(reloaded.session.practiceCheckpoint()).toEqual({ practiceId: saved.practiceId, state: saved.state })
    expect(reloaded.free.snapshot().personal.history[0]).toMatchObject({ practiceId: saved.practiceId, startedAt: saved.startedAt, moves: 19, status: 'active' })

    const uninterrupted = new Unity2048Session(vi.fn(), vi.fn())
    await uninterrupted.start(saved.state.seed)
    for (const direction of inputs) await uninterrupted.move(direction)
    expect(gameplay(uninterrupted)).toEqual(gameplay(reloaded.session))
    const direction = nextValid(reloaded)
    await reloaded.session.move(direction); await uninterrupted.move(direction); await Promise.resolve()
    expect(gameplay(reloaded.session)).toEqual(gameplay(uninterrupted))
    expect(reloaded.session.practiceCheckpoint()!.state).toEqual(uninterrupted.practiceCheckpoint()!.state)
    expect(reloaded.observe.mock.calls.map(([event]) => event.type)).toEqual(['move'])
    expect(lifecycle(f).filter(event => event.kind === 'start')).toHaveLength(1)
    expect(lifecycle(f).filter(event => event.kind === 'first-valid-move')).toHaveLength(1)
    expect(lifecycle(f).filter(event => event.kind === '20-valid-moves')).toHaveLength(1)
    expect(f.ledger().practices[0]).toMatchObject({ id: saved.practiceId, startedAt: saved.startedAt, validMoves: 20, observationGap: false })
    expect(f.recordAccount).toHaveBeenCalledTimes(2)
    expect(reloaded.request).not.toHaveBeenCalled(); expect(original.request).not.toHaveBeenCalled()
  })

  it('survives two reloads across midnight Chile; restoration adds no day and the next valid move qualifies the new day', async () => {
    const f = fixture(), first = f.mount()
    await first.session.start('training-demo-0'); await advanceTo(first, 6)
    expect(first.free.snapshot().retention).toMatchObject({ today: '2026-10-19', daysPlayedCount: 1 })
    const saved = capture(first), firstStore = f.store(); expect(firstStore.write(saved)).toBe(true)
    first.session.destroy()
    vi.setSystemTime(clock + 60_000)
    const second = f.mount(), secondSaved = f.store().read().checkpoint!
    expect(second.free.resumePractice(secondSaved)).toBe(true); expect(second.session.restorePractice(secondSaved)).toBe(true)
    expect(f.recordAccount).toHaveBeenCalledTimes(1)
    const secondStore = f.store(); secondStore.read(); expect(secondStore.write(capture(second))).toBe(true)
    second.session.destroy()
    vi.setSystemTime(Date.parse('2026-10-20T03:05:00Z'))
    const third = f.mount(), thirdSaved = f.store().read().checkpoint!
    const beforeEvents = lifecycle(f)
    expect(third.free.resumePractice(thirdSaved)).toBe(true); expect(third.session.restorePractice(thirdSaved)).toBe(true)
    expect(third.session.practiceCheckpoint()).toEqual({ practiceId: saved.practiceId, state: saved.state })
    expect(third.free.practiceCheckpointMetadata()?.startedAt).toBe(saved.startedAt)
    expect(third.free.snapshot().retention).toMatchObject({ today: '2026-10-20', daysPlayedCount: 1, daysPlayed: ['2026-10-19'] })
    expect(f.recordAccount).toHaveBeenCalledTimes(1); expect(lifecycle(f)).toEqual(beforeEvents)
    await third.session.move(nextValid(third)); await Promise.resolve()
    expect(third.free.snapshot().retention).toMatchObject({ daysPlayedCount: 2, daysPlayed: ['2026-10-19', '2026-10-20'] })
    expect(f.recordAccount).toHaveBeenCalledTimes(2)
    expect(f.ledger().practices).toHaveLength(1)
    expect(lifecycle(f).filter(event => event.kind === 'start')).toHaveLength(1)
    expect(lifecycle(f).filter(event => event.kind === 'first-valid-move')).toHaveLength(1)
  })

  it('does not advance RNG, valid moves, days, observations or account activity on a no-op after restore', async () => {
    const f = fixture(), initial = f.mount()
    await initial.session.start('training-demo-0')
    let noOp: Direction | undefined
    for (let input = 0; input < 1000 && !initial.session.snapshot().game_over; input++) {
      const current = initial.session.practiceCheckpoint()!
      noOp = directions.find(direction => !applyLocalPracticeMove(current.state, direction).moved)
      if (current.state.moveNumber > 2 && noOp) break
      await initial.session.move(directions[input % 4])
    }
    expect(noOp).toBeDefined()
    const saved = capture(initial); await Promise.resolve(); initial.session.destroy()
    const resumed = f.mount()
    expect(resumed.free.resumePractice(saved)).toBe(true); expect(resumed.session.restorePractice(saved)).toBe(true)
    const before = new Map(f.data), board = resumed.session.practiceCheckpoint(), accounts = f.recordAccount.mock.calls.length
    await resumed.session.move(noOp!); await Promise.resolve()
    expect(resumed.session.practiceCheckpoint()).toEqual(board)
    expect(f.data).toEqual(before); expect(f.recordAccount).toHaveBeenCalledTimes(accounts)
    expect(resumed.observe).not.toHaveBeenCalled()
  })

  it.each(['missing', 'truncated'] as const)('resumes gameplay with %s observation history without inventing prior starts or milestones', async state => {
    const f = fixture(), initial = f.mount()
    await initial.session.start('training-demo-0'); await advanceTo(initial, 19)
    const saved = capture(initial); initial.session.destroy()
    if (state === 'missing') f.data.delete(SESSIONS_2048_STORAGE_KEY)
    else {
      const ledger = f.ledger()
      ledger.practices = []; ledger.events = ledger.events.filter(event => event.practiceId === null && event.previousPracticeId === null); ledger.truncated = true
      f.data.set(SESSIONS_2048_STORAGE_KEY, JSON.stringify(ledger))
    }
    const resumed = f.mount(), before = lifecycle(f), accounts = f.recordAccount.mock.calls.length
    expect(resumed.free.canResumePractice(saved)).toBe(true)
    expect(resumed.free.resumePractice(saved)).toBe(true); expect(resumed.session.restorePractice(saved)).toBe(true)
    expect(f.recordAccount).toHaveBeenCalledTimes(accounts)
    expect(f.ledger()).toMatchObject({ observationGap: true, practices: [] })
    expect(lifecycle(f)).toEqual(before)
    await resumed.session.move(nextValid(resumed)); resumed.free.checkpoint()
    expect(resumed.session.snapshot().move_number).toBe(22)
    expect(f.ledger().practices).toEqual([])
    expect(lifecycle(f)).toEqual(before)
    expect(resumed.free.snapshot().personal.history).toHaveLength(1)
    expect(resumed.free.snapshot().personal.history[0]).toMatchObject({ practiceId: saved.practiceId, startedAt: saved.startedAt, moves: 20 })
  })

  it('rejects an older checkpoint after legitimate progress advanced, without attaching a stale observer or board', async () => {
    const f = fixture(), initial = f.mount()
    await initial.session.start('training-demo-0'); await advanceTo(initial, 5)
    const old = capture(initial)
    await initial.session.move(nextValid(initial)); initial.free.checkpoint(); initial.session.destroy()
    const resumed = f.mount(), before = new Map(f.data), accounts = f.recordAccount.mock.calls.length
    expect(resumed.free.canResumePractice(old)).toBe(false); expect(resumed.free.resumePractice(old)).toBe(false)
    expect(resumed.free.practiceCheckpointMetadata()).toBeNull()
    expect(resumed.session.snapshot().started).toBe(false)
    expect(f.data).toEqual(before); expect(f.recordAccount).toHaveBeenCalledTimes(accounts)
  })

  it('never resurrects an ended original, its terminal board or its assisted continuation', async () => {
    const f = fixture(), initial = f.mount()
    await initial.session.start('training-demo-0'); await advanceTo(initial, 5)
    const old = capture(initial), privateStore = f.store(); expect(privateStore.write(old)).toBe(true)
    for (let input = 0; input < 1000 && !initial.session.snapshot().game_over; input++) await initial.session.move(directions[input % 4])
    expect(initial.session.snapshot().game_over).toBe(true)
    expect(initial.session.practiceCheckpoint()).toBeNull()
    const terminalState = initial.session.snapshot()
    const terminal: Saved2048Practice = { ...old, savedAt: Date.now(), state: { seed: old.state.seed, score: terminalState.score,
      moveNumber: terminalState.move_number, board: Array.from({ length: 4 }, (_, row) => terminalState.cells.slice(row * 4, row * 4 + 4)) } }
    const resumed = f.mount(), beforeEvents = lifecycle(f)
    expect(resumed.free.resumePractice(old)).toBe(false)
    expect(resumed.free.resumePractice(terminal)).toBe(false)
    expect(resumed.session.restorePractice(terminal)).toBe(false)
    expect(f.ledger().practices).toHaveLength(1); expect(lifecycle(f)).toEqual(beforeEvents)
    const offered = initial.session.snapshot().training
    expect(offered?.phase).toBe('offered')
    expect(initial.session.beginTrainingDemo(offered!.sourceId)).toBe(true)
    expect(initial.session.practiceCheckpoint()).toBeNull()
    expect(initial.session.canRestorePractice(old)).toBe(false)
    expect(resumed.free.resumePractice(old)).toBe(false)
  })

  it('excludes active daily/tournament modes and rejects a checkpoint from the other observation category', async () => {
    const f = fixture(), normal = f.mount()
    await normal.session.start('training-demo-0'); await advanceTo(normal, 3)
    const saved = capture(normal)
    const daily = f.mount(), challenge = getDaily2048Challenge(Date.now())
    expect(daily.free.selectNext('daily', challenge)).toBe(true)
    await daily.session.start(challenge.seed, { freeMode: 'daily' }); await daily.session.move('left')
    expect(daily.session.practiceCheckpoint()).toBeNull()
    expect(daily.free.practiceCheckpointMetadata()).toBeNull()
    expect(daily.free.canResumePractice(saved)).toBe(false); expect(daily.session.canRestorePractice(saved)).toBe(false)
    const config: TournamentUnityConfig = { startUrl: '/start', moveUrl: '/move', timeoutUrl: '/timeout' }
    const request = vi.fn(), tournament = new Unity2048Session(vi.fn(), request, config)
    expect(tournament.practiceCheckpoint()).toBeNull(); expect(tournament.restorePractice(saved)).toBe(false)
    expect(request).not.toHaveBeenCalled()
    const synthetic = f.mount('synthetic')
    expect(synthetic.free.canResumePractice(saved)).toBe(false)
    expect(synthetic.free.resumePractice(saved)).toBe(false)
    expect(synthetic.session.snapshot().started).toBe(false)
  })

  it('keeps private board/seed state outside analytics exports and prevents repeated attachment or restoring into a started session', async () => {
    const f = fixture(), original = f.mount('synthetic')
    await original.session.start('training-demo-0'); await advanceTo(original, 3)
    const saved = capture(original, 'synthetic'), privateStore = f.store('synthetic')
    expect(privateStore.write(saved)).toBe(true)
    expect(f.data.has(`${PRACTICE_2048_CHECKPOINT_KEY}.synthetic`)).toBe(true)
    expect(f.data.has(PRACTICE_2048_CHECKPOINT_KEY)).toBe(false)
    const resumed = f.mount('synthetic')
    expect(resumed.free.resumePractice(saved)).toBe(true); expect(resumed.session.restorePractice(saved)).toBe(true)
    const before = gameplay(resumed.session)
    expect(resumed.free.resumePractice(saved)).toBe(false); expect(resumed.session.restorePractice(saved)).toBe(false)
    expect(gameplay(resumed.session)).toEqual(before)
    await resumed.session.move(nextValid(resumed))
    const exported = resumed.free.exportJson()
    expect(exported).not.toMatch(/"(?:board|seed|state|rng|checkpoint)"/)
    expect(exported).not.toContain(saved.state.seed)
    expect(f.recordAccount).not.toHaveBeenCalled()
  })
})
