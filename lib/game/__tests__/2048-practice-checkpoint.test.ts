import { describe, expect, it, vi } from 'vitest'
import { applyLocalPracticeMove, createLocalPracticeGame, type LocalPracticeState } from '../local-practice'
import { PERSONAL_2048_RULES_VERSION } from '../personal-2048-progress'
import { MAX_2048_PRACTICE_CHECKPOINT_BYTES, PRACTICE_2048_CHECKPOINT_KEY, Practice2048CheckpointStore,
  parseSaved2048Practice, type Saved2048Practice } from '../2048-practice-checkpoint'

const now = 2000, category = 'observed_browser'
function saved(): Saved2048Practice {
  return { version: 1, rulesVersion: PERSONAL_2048_RULES_VERSION, category, practiceId: '00000000-0000-4000-8000-000000000001',
    startedAt: 1000, savedAt: 1500, bestBefore: 400, state: createLocalPracticeGame('practice:local:checkpoint') }
}
function storage(initial: string | null = null) {
  const data = new Map<string, string>()
  if (initial !== null) data.set(PRACTICE_2048_CHECKPOINT_KEY, initial)
  const api = { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value) }),
    removeItem: vi.fn((key: string) => { data.delete(key) }) }
  const options = { getStorage: () => api, category: 'observed_browser' as const, now: () => now }
  return { data, api, options, store: new Practice2048CheckpointStore(options) }
}
const projected = (state: LocalPracticeState): LocalPracticeState => ({ board: state.board.map(row => [...row]), score: state.score, seed: state.seed, moveNumber: state.moveNumber })

describe('strict private practice recovery state', () => {
  it('preserves the complete playable state and next deterministic spawns without sharing mutable arrays', () => {
    const original = saved()
    for (const direction of ['left', 'up', 'right', 'down', 'left', 'up'] as const) {
      original.state = projected({ ...original.state, ...applyLocalPracticeMove(original.state, direction) })
    }
    const restored = parseSaved2048Practice(JSON.parse(JSON.stringify(original)), category, now)!
    expect(restored).toEqual(original)
    for (const direction of ['right', 'down', 'left', 'up'] as const) {
      const nextOriginal = applyLocalPracticeMove(original.state, direction), nextRestored = applyLocalPracticeMove(restored.state, direction)
      expect(nextRestored).toEqual(nextOriginal)
      original.state = projected({ ...original.state, ...nextOriginal }); restored.state = projected({ ...restored.state, ...nextRestored })
    }
    const isolated = parseSaved2048Practice(original, category, now)!
    isolated.state.board[0][0] = 8192; isolated.state.seed = 'changed'; isolated.practiceId = 'changed'
    expect(original.state.board[0][0]).not.toBe(8192)
    expect(original.state.seed).toBe('practice:local:checkpoint')
    expect(original.practiceId).not.toBe('changed')
  })

  it.each([
    ['unknown top-level field', (value: Saved2048Practice) => ({ ...value, assisted: false })],
    ['daily mode field', (value: Saved2048Practice) => ({ ...value, mode: 'daily' })],
    ['training field', (value: Saved2048Practice) => ({ ...value, training: null })],
    ['unknown state field', (value: Saved2048Practice) => ({ ...value, state: { ...value.state, gameOver: false } })],
    ['version', (value: Saved2048Practice) => ({ ...value, version: 2 })],
    ['rules', (value: Saved2048Practice) => ({ ...value, rulesVersion: '2048-daily-v1' })],
    ['category', (value: Saved2048Practice) => ({ ...value, category: 'synthetic' })],
    ['future date', (value: Saved2048Practice) => ({ ...value, savedAt: now + 1 })],
    ['reverse dates', (value: Saved2048Practice) => ({ ...value, startedAt: value.savedAt + 1 })],
    ['invalid date', (value: Saved2048Practice) => ({ ...value, startedAt: NaN })],
    ['fractional timestamp', (value: Saved2048Practice) => ({ ...value, savedAt: 1500.5 })],
    ['negative mark', (value: Saved2048Practice) => ({ ...value, bestBefore: -1 })],
    ['infinite score', (value: Saved2048Practice) => ({ ...value, state: { ...value.state, score: Infinity } })],
    ['fractional move', (value: Saved2048Practice) => ({ ...value, state: { ...value.state, moveNumber: 2.5 } })],
    ['move before two initial tiles', (value: Saved2048Practice) => ({ ...value, state: { ...value.state, moveNumber: 1 } })],
    ['unsafe move', (value: Saved2048Practice) => ({ ...value, state: { ...value.state, moveNumber: Number.MAX_SAFE_INTEGER + 1 } })],
    ['daily seed', (value: Saved2048Practice) => ({ ...value, state: { ...value.state, seed: '2048-daily-v1:2026-10-20' } })],
    ['empty seed', (value: Saved2048Practice) => ({ ...value, state: { ...value.state, seed: '' } })],
    ['oversized seed', (value: Saved2048Practice) => ({ ...value, state: { ...value.state, seed: 'x'.repeat(129) } })],
    ['unsafe seed', (value: Saved2048Practice) => ({ ...value, state: { ...value.state, seed: 'private\nseed' } })],
    ['missing key', (value: Saved2048Practice) => { const partial = { ...value } as Partial<Saved2048Practice>; delete partial.bestBefore; return partial }],
  ])('rejects %s without throwing', (_label, transform) => {
    expect(parseSaved2048Practice(transform(saved()), category, now)).toBeNull()
  })

  it.each([null, [], {}, true, 12, 'raw'])('rejects malformed input: %s', value => {
    expect(parseSaved2048Practice(value, category, now)).toBeNull()
  })

  it('does not expose exceptions from a hostile input object', () => {
    const value = new Proxy({}, { ownKeys() { throw new Error('unsafe') } })
    expect(parseSaved2048Practice(value, category, now)).toBeNull()
  })

  it('requires exactly sixteen dense cells with zero or safe powers of two and a playable nonempty board', () => {
    const terminal = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]
    const hole = [0, 0, 0, 0]; delete hole[1]
    const cases = [[], [[2]], [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], terminal,
      Array.from({ length: 4 }, () => [0, 0, 0, 0]), [hole, [2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]]
    for (const tile of [-2, 1, 3, 2.5, NaN, Infinity, 2 ** 52 - 1, Number.MAX_SAFE_INTEGER + 1]) {
      cases.push([[tile, 0, 0, 0], [2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    }
    for (const board of cases) expect(parseSaved2048Practice({ ...saved(), state: { ...saved().state, board } }, category, now)).toBeNull()
    expect(parseSaved2048Practice(saved(), category, NaN)).toBeNull()
    expect(parseSaved2048Practice(saved(), 'other' as typeof category, now)).toBeNull()
    const symbol = { ...saved(), [Symbol('hidden')]: true }
    expect(parseSaved2048Practice(symbol, category, now)).toBeNull()
    const boardWithMetadata = saved(); Object.assign(boardWithMetadata.state.board, { assisted: false })
    expect(parseSaved2048Practice(boardWithMetadata, category, now)).toBeNull()
    const rowWithMetadata = saved(); Object.assign(rowWithMetadata.state.board[0], { training: null })
    expect(parseSaved2048Practice(rowWithMetadata, category, now)).toBeNull()
  })
})

describe('private checkpoint storage', () => {
  it('is lazy, stores in its own category key and returns independent copies on every read and snapshot', () => {
    const fixture = storage()
    expect(fixture.api.getItem).not.toHaveBeenCalled()
    expect(fixture.store.snapshot()).toEqual({ status: 'ready', checkpoint: null })
    const original = saved()
    expect(fixture.store.write(original)).toBe(true)
    original.state.board[0][0] = 16384
    const first = fixture.store.read(); first.checkpoint!.state.board[0][0] = 8192
    const second = fixture.store.snapshot(); second.checkpoint!.state.board[1][0] = 4096
    expect(fixture.store.snapshot().checkpoint).toEqual(saved())
    expect([...fixture.data.keys()]).toEqual([PRACTICE_2048_CHECKPOINT_KEY])
    expect(fixture.store.clear()).toBe(true)
    expect(fixture.store.snapshot()).toEqual({ status: 'ready', checkpoint: null })
    expect(fixture.data.has(PRACTICE_2048_CHECKPOINT_KEY)).toBe(false)
  })

  it('keeps synthetic and observed state separate and rejects a checkpoint from another category', () => {
    const fixture = storage(JSON.stringify(saved()))
    const synthetic = new Practice2048CheckpointStore({ ...fixture.options, category: 'synthetic' })
    expect(synthetic.read()).toEqual({ status: 'ready', checkpoint: null })
    expect(synthetic.write({ ...saved(), category: 'synthetic' })).toBe(true)
    expect(fixture.data.has(`${PRACTICE_2048_CHECKPOINT_KEY}.synthetic`)).toBe(true)
    expect(fixture.store.read().checkpoint).toEqual(saved())
    expect(synthetic.write(saved())).toBe(false)
    expect(synthetic.snapshot().status).toBe('invalid')
    expect(fixture.data.get(PRACTICE_2048_CHECKPOINT_KEY)).toBe(JSON.stringify(saved()))
  })

  it.each(['{bad json', 'null', '{"format":"unknown"}', 'x'.repeat(MAX_2048_PRACTICE_CHECKPOINT_BYTES + 1),
    `{"payload":"${'é'.repeat(8192)}"}`])('leaves invalid or oversized bytes intact and distinguishes them from inaccessible storage', raw => {
    const { store, api, data } = storage(raw)
    expect(store.read()).toEqual({ status: 'invalid', checkpoint: null })
    expect(store.write(saved())).toBe(false); expect(store.clear()).toBe(false)
    expect(api.setItem).not.toHaveBeenCalled(); expect(api.removeItem).not.toHaveBeenCalled()
    expect(data.get(PRACTICE_2048_CHECKPOINT_KEY)).toBe(raw)
  })

  it.each(['getStorage', 'getItem', 'setItem', 'removeItem'] as const)('reports unavailable on %s failures without throwing or claiming persistence', method => {
    const fixture = storage(JSON.stringify(saved()))
    const fail = () => { throw new Error('private storage failure') }
    if (method === 'getStorage') {
      const unavailable = new Practice2048CheckpointStore({ ...fixture.options, getStorage: fail })
      expect(unavailable.read()).toEqual({ status: 'unavailable', checkpoint: null }); expect(unavailable.write(saved())).toBe(false)
      return
    }
    if (method === 'getItem') fixture.api.getItem.mockImplementation(fail)
    else {
      fixture.store.read()
      fixture.api[method].mockImplementation(fail)
    }
    const result = method === 'removeItem' ? fixture.store.clear() : fixture.store.write(saved())
    expect(result).toBe(false); expect(fixture.store.snapshot()).toEqual({ status: 'unavailable', checkpoint: null })
    expect(fixture.data.get(PRACTICE_2048_CHECKPOINT_KEY)).toBe(JSON.stringify(saved()))
  })

  it('supports a denied/null store and validates future or impossible direct writes without touching storage', () => {
    const store = new Practice2048CheckpointStore({ getStorage: () => null, category, now: () => now })
    expect(store.read().status).toBe('unavailable'); expect(store.clear()).toBe(false)
    const fixture = storage()
    expect(fixture.store.write({ ...saved(), savedAt: now + 1 })).toBe(false)
    expect(fixture.api.setItem).not.toHaveBeenCalled(); expect(fixture.api.removeItem).not.toHaveBeenCalled()
    const invalidClock = new Practice2048CheckpointStore({ ...fixture.options, now: () => { throw new Error('clock') } })
    expect(invalidClock.write(saved())).toBe(false); expect(invalidClock.snapshot().status).toBe('invalid')
  })

  it('compares the exact original raw bytes before write and clear, including semantically equivalent changes', () => {
    const fixture = storage(JSON.stringify(saved()))
    fixture.store.read()
    const changed = JSON.stringify(saved(), null, 2)
    fixture.data.set(PRACTICE_2048_CHECKPOINT_KEY, changed)
    expect(fixture.store.write({ ...saved(), savedAt: 1600 })).toBe(false)
    expect(fixture.store.snapshot().status).toBe('conflict')
    expect(fixture.store.clear()).toBe(false)
    expect(fixture.data.get(PRACTICE_2048_CHECKPOINT_KEY)).toBe(changed)
    expect(fixture.api.setItem).not.toHaveBeenCalled(); expect(fixture.api.removeItem).not.toHaveBeenCalled()
    expect(fixture.store.read().status).toBe('ready')
    expect(fixture.store.write({ ...saved(), savedAt: 1600 })).toBe(true)
  })

  it('does not clear another tab’s newly stored state or recreate state that another tab removed', () => {
    const fixture = storage()
    fixture.store.read()
    const other = JSON.stringify(saved())
    fixture.data.set(PRACTICE_2048_CHECKPOINT_KEY, other)
    expect(fixture.store.clear()).toBe(false); expect(fixture.store.snapshot().status).toBe('conflict')
    expect(fixture.data.get(PRACTICE_2048_CHECKPOINT_KEY)).toBe(other)
    fixture.store.read(); fixture.data.delete(PRACTICE_2048_CHECKPOINT_KEY)
    expect(fixture.store.write(saved())).toBe(false); expect(fixture.data.has(PRACTICE_2048_CHECKPOINT_KEY)).toBe(false)
  })

  it('requires read-back confirmation instead of trusting a silently dropped write or removal', () => {
    const fixture = storage()
    fixture.api.setItem.mockImplementation(() => {})
    expect(fixture.store.write(saved())).toBe(false)
    expect(fixture.store.snapshot().status).toBe('unavailable')
    fixture.data.set(PRACTICE_2048_CHECKPOINT_KEY, JSON.stringify(saved())); fixture.store.read()
    fixture.api.removeItem.mockImplementation(() => {})
    expect(fixture.store.clear()).toBe(false); expect(fixture.store.snapshot().status).toBe('unavailable')
  })

  it('detects a competing change during mutation confirmation and never deletes the unexpected replacement', () => {
    const fixture = storage()
    const replacement = '{"other":"unknown bytes"}'
    fixture.api.setItem.mockImplementation(key => { fixture.data.set(key, replacement) })
    expect(fixture.store.write(saved())).toBe(false)
    expect(fixture.store.snapshot().status).toBe('conflict')
    expect(fixture.store.clear()).toBe(false)
    expect(fixture.data.get(PRACTICE_2048_CHECKPOINT_KEY)).toBe(replacement)
    expect(fixture.api.removeItem).not.toHaveBeenCalled()
  })

  it('marks a failed read-back unavailable and permits a later explicit read to discover what was actually saved', () => {
    const fixture = storage()
    let reads = 0
    fixture.api.getItem.mockImplementation(key => { if (++reads === 3) throw new Error('read-back failed'); return fixture.data.get(key) ?? null })
    expect(fixture.store.write(saved())).toBe(false)
    expect(fixture.store.snapshot().status).toBe('unavailable')
    expect(fixture.store.read()).toEqual({ status: 'ready', checkpoint: saved() })
  })
})
