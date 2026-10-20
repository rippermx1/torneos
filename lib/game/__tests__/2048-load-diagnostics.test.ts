import { describe, expect, it, vi } from 'vitest'
import { Load2048Diagnostics, LOAD_2048_DIAGNOSTICS_KEY, MAX_2048_LOAD_ATTEMPTS,
  MAX_2048_LOAD_DIAGNOSTICS_BYTES, readLoad2048Diagnostics, type Load2048Category,
  type Load2048DiagnosticsSnapshot } from '../2048-load-diagnostics'
import runtimeBuilds from '../runtime-builds.json'

const uuid = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
function fixture(category: Load2048Category = 'observed_browser') {
  const data = new Map<string, string>()
  const storage = { getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value) }) }
  let at = 1000, mono = 100, serial = 0
  const changed = vi.fn()
  const options = { getStorage: () => storage, category, now: () => at, monotonicNow: () => mono,
    uuid: () => uuid(++serial), changed }
  const current = new Load2048Diagnostics(options)
  const key = `${LOAD_2048_DIAGNOSTICS_KEY}${category === 'synthetic' ? '.synthetic' : ''}`
  return { data, storage, options, current, key, changed,
    time: (wall: number, monotonic = mono) => { at = wall; mono = monotonic },
    another: () => new Load2048Diagnostics(options) }
}
function decoded(value: Load2048Diagnostics) {
  const raw = value.exportJson(), parsed = readLoad2048Diagnostics(raw)
  expect(parsed).not.toBeNull(); expect(parsed).toEqual(JSON.parse(raw))
  return parsed!
}

describe('one factual local Unity load attempt', () => {
  it('can export before Unity readiness without creating a load or touching gameplay', () => {
    const f = fixture()
    expect(f.storage.getItem).not.toHaveBeenCalled()
    expect(decoded(f.current)).toEqual({ format: 'torneos.2048.load-diagnostics', version: 1, category: 'observed_browser',
      entries: [], capturedAt: 1000, truncated: false, observationGap: false, storageStatus: 'ready' })
    expect(f.current.currentId()).toBeNull(); expect(f.storage.setItem).not.toHaveBeenCalled()
    expect(f.current.ready()).toBe(false); expect(f.current.leave()).toBe(false)
  })
  it('begins once, measures monotonic duration and links only the first actual gameplay entry', () => {
    const f = fixture(), id = f.current.begin()
    expect(id).toBe(uuid(1)); expect(f.current.begin(uuid(100))).toBe(id)
    expect(f.current.linkPractice(uuid(99), 'new', 'practice')).toBe(false)
    f.time(1800, 725.9)
    expect(f.current.ready()).toBe(true)
    f.time(1900, 800)
    expect(f.current.linkPractice(uuid(99), 'resumed', 'practice')).toBe(true)
    expect(f.current.linkPractice(uuid(100), 'new', 'daily')).toBe(false)
    expect(decoded(f.current).entries).toEqual([{ id, build: runtimeBuilds['2048'], startedAt: 1000, result: 'ready', durationMs: 625,
      practiceId: uuid(99), entry: 'resumed', mode: 'practice', entryAt: 1900, retryOf: null }])
  })
  it.each(['ready', 'error', 'timeout', 'inconclusive'] as const)('keeps %s as the first outcome and ignores duplicates and late callbacks', first => {
    const f = fixture(); f.current.begin(); f.time(1100, 200)
    const firstResult = first === 'ready' ? f.current.ready() : first === 'inconclusive' ? f.current.leave() : f.current.fail(first)
    expect(firstResult).toBe(true)
    const writes = f.storage.setItem.mock.calls.length
    f.time(1200, 300)
    expect(f.current.ready()).toBe(false); expect(f.current.fail('error')).toBe(false)
    expect(f.current.fail('timeout')).toBe(false); expect(f.current.leave()).toBe(false)
    expect(f.storage.setItem).toHaveBeenCalledTimes(writes)
    expect(decoded(f.current).entries[0]).toMatchObject({ result: first, durationMs: 100 })
  })
  it('records retry lineage without changing the failed original or treating it as another gameplay start', () => {
    const f = fixture(), original = f.current.begin()!; f.time(1100, 200); f.current.fail('timeout')
    f.time(1500, 600); const retry = f.another(); retry.begin(original)
    f.time(1600, 700); retry.ready(); retry.linkPractice(uuid(50), 'new', 'daily')
    const records = decoded(retry).entries
    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({ id: original, result: 'timeout', practiceId: null, retryOf: null })
    expect(records[1]).toMatchObject({ result: 'ready', retryOf: original, practiceId: uuid(50), mode: 'daily' })
    expect(decoded(f.current).entries).toEqual(records)
  })
  it('keeps a previously abandoned loading record unknown until its own instance explicitly leaves', () => {
    const f = fixture(); const first = f.current.begin()!
    f.time(2000, 1100); const other = f.another(); other.begin(first)
    expect(decoded(other).entries[0].result).toBe('loading')
    expect(f.current.leave()).toBe(true)
    expect(decoded(other).entries[0]).toMatchObject({ result: 'inconclusive', durationMs: 1000 })
  })
  it('rejects invalid linkage and opaque payloads instead of storing their contents', () => {
    const f = fixture(); f.current.begin(); f.time(1100, 200); f.current.ready()
    expect(f.current.linkPractice('private@example.test', 'new', 'practice')).toBe(false)
    expect(f.current.linkPractice(uuid(2), 'invalid' as 'new', 'practice')).toBe(false)
    expect(f.current.linkPractice(uuid(2), 'new', 'invalid' as 'practice')).toBe(false)
    expect(f.current.fail('private@example.test' as 'error')).toBe(false)
    const result = decoded(f.current)
    expect(result.entries[0].practiceId).toBeNull()
    expect(JSON.stringify(result)).not.toMatch(/private|email|url|board|seed|score|cells|summary/i)
  })
  it('separates synthetic storage and never lets a malformed category write to ordinary observations', () => {
    const f = fixture(); f.current.begin()
    const synthetic = new Load2048Diagnostics({ ...f.options, category: 'synthetic' }); synthetic.begin()
    expect(readLoad2048Diagnostics(f.data.get(f.key)!)!.category).toBe('observed_browser')
    expect(readLoad2048Diagnostics(f.data.get(`${f.key}.synthetic`)!)!.category).toBe('synthetic')
    const bad = new Load2048Diagnostics({ ...f.options, category: 'bad' as Load2048Category })
    const before = new Map(f.data)
    expect(bad.begin()).toBeNull(); expect(decoded(bad)).toMatchObject({ category: 'synthetic', storageStatus: 'corrupt', entries: [] })
    expect(f.data).toEqual(before)
  })
})

describe('strict parser and bounded privacy projection', () => {
  function good() { const f = fixture(); f.current.begin(); f.time(1200, 200); f.current.ready(); return decoded(f.current) }
  function reject(change: (snapshot: Load2048DiagnosticsSnapshot) => unknown) {
    const value = good(), changed = change(value)
    expect(readLoad2048Diagnostics(JSON.stringify(changed ?? value))).toBeNull()
  }
  it('rejects extra/missing keys, wrong versions/categories/statuses and arbitrary errors', () => {
    expect(readLoad2048Diagnostics(null)).toBeNull(); expect(readLoad2048Diagnostics('{private@example.test')).toBeNull()
    for (const field of ['summary', 'error', 'url', 'email', 'board', 'seed']) reject(value => ({ ...value, [field]: 'private@example.test' }))
    reject(value => ({ ...value, version: 2 })); reject(value => ({ ...value, format: 'other' }))
    reject(value => ({ ...value, category: 'other' })); reject(value => ({ ...value, storageStatus: 'verified' }))
    reject(value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'capturedAt')))
    reject(value => { Object.assign(value.entries[0], { rawError: 'private@example.test' }) })
    reject(value => { value.entries[0].build = 'https://private.example/test' })
  })
  it('rejects duplicate identities, incoherent futures/durations, impossible links and retry cycles', () => {
    reject(value => { value.entries.push({ ...value.entries[0], id: value.entries[0].id.toUpperCase() }) })
    reject(value => { value.entries[0].startedAt = value.capturedAt + 1 })
    reject(value => { value.entries[0].durationMs = -1 })
    reject(value => { value.entries[0].durationMs = value.capturedAt + 1 })
    reject(value => { value.entries[0].durationMs = 0.5 })
    reject(value => { value.entries[0].result = 'loading' })
    reject(value => { value.entries[0].practiceId = uuid(5) })
    reject(value => { Object.assign(value.entries[0], { practiceId: uuid(5), entry: 'new', mode: 'practice', entryAt: value.capturedAt + 1 }) })
    reject(value => { value.entries[0].retryOf = value.entries[0].id })
    reject(value => { value.entries[0].retryOf = uuid(999) })
    reject(value => { const first = value.entries[0]; first.retryOf = uuid(2); value.entries.push({ ...first, id: uuid(2), retryOf: first.id }) })
    reject(value => { const first = value.entries[0]; value.entries.push({ ...first, id: uuid(2), startedAt: value.capturedAt, durationMs: 0 }); first.retryOf = uuid(2) })
  })
  it('bounds entry count and UTF-8 size without trusting an injected summary', () => {
    const value = good()
    value.entries = Array.from({ length: MAX_2048_LOAD_ATTEMPTS + 1 }, (_, index) => ({ ...value.entries[0], id: uuid(index + 1) }))
    expect(readLoad2048Diagnostics(JSON.stringify(value))).toBeNull()
    expect(readLoad2048Diagnostics(' '.repeat(MAX_2048_LOAD_DIAGNOSTICS_BYTES + 1))).toBeNull()
    expect(readLoad2048Diagnostics('é'.repeat(MAX_2048_LOAD_DIAGNOSTICS_BYTES / 2 + 1))).toBeNull()
    const raw = JSON.stringify(good())
    expect(readLoad2048Diagnostics(' '.repeat(MAX_2048_LOAD_DIAGNOSTICS_BYTES - raw.length) + raw)).not.toBeNull()
  })
  it('deep-copies snapshots and reads its own exports idempotently without gameplay or network access', () => {
    const f = fixture(); f.current.begin()
    const first = decoded(f.current); first.entries[0].build = 'mutated'
    expect(decoded(f.current).entries[0].build).toBe(runtimeBuilds['2048'])
    expect(readLoad2048Diagnostics(JSON.stringify(readLoad2048Diagnostics(f.current.exportJson())))).toEqual(decoded(f.current))
    expect([...f.data.keys()]).toEqual([LOAD_2048_DIAGNOSTICS_KEY])
  })
})

describe('clock quality and memory fallback', () => {
  it('uses unknown duration for monotonic rollback or elapsed time beyond the wall-clock capture', () => {
    for (const [wall, mono] of [[1200, 99], [1000, 500], [1200, NaN], [1200, Infinity]]) {
      const f = fixture(); f.current.begin(); f.time(wall, mono)
      expect(f.current.ready()).toBe(true)
      expect(decoded(f.current)).toMatchObject({ observationGap: true, entries: [{ result: 'ready', durationMs: null }] })
    }
  })
  it('keeps capturedAt monotonic under a wall rollback and does not invent an entry timestamp before load start', () => {
    const f = fixture(); f.current.begin(); f.time(900, 110)
    expect(f.current.ready()).toBe(true)
    expect(f.current.linkPractice(uuid(2), 'new', 'practice')).toBe(false)
    expect(decoded(f.current)).toMatchObject({ capturedAt: 1000, observationGap: true, entries: [{ durationMs: null, entryAt: null }] })
  })
  it('returns a valid empty unknown-quality export on an invalid clock or UUID', () => {
    const f = fixture(); f.time(NaN)
    expect(f.current.begin()).toBeNull(); expect(decoded(f.current)).toMatchObject({ entries: [], observationGap: true, capturedAt: 0 })
    const bad = new Load2048Diagnostics({ ...f.options, now: () => 1000, uuid: () => 'private@example.test' })
    expect(bad.begin()).toBeNull(); expect(decoded(bad).entries).toEqual([])
    const throws = new Load2048Diagnostics({ ...f.options, now: () => { throw new Error('secret') } })
    expect(throws.begin()).toBeNull(); expect(throws.exportJson()).not.toContain('secret')
  })
  it.each(['getStorage', 'getItem', 'setItem'] as const)('continues observing in memory after %s throws, without exposing the raw error', method => {
    const f = fixture(), rawError = 'private@example.test credential detail'
    if (method !== 'getStorage') f.storage[method].mockImplementation(() => { throw new Error(rawError) })
    const current = method === 'getStorage' ? new Load2048Diagnostics({ ...f.options, getStorage: () => { throw new Error(rawError) } }) : f.current
    expect(current.begin()).toBeTruthy(); f.time(1200, 200); expect(current.ready()).toBe(true)
    const result = decoded(current)
    expect(result).toMatchObject({ storageStatus: 'unavailable', observationGap: true, entries: [{ result: 'ready' }] })
    expect(current.exportJson()).not.toContain(rawError)
  })
  it('detects a refused write/readback and retains the attempt only as memory evidence', () => {
    const f = fixture(); f.storage.setItem.mockImplementation(() => {})
    f.current.begin(); f.time(1100, 200); f.current.fail('error')
    expect(decoded(f.current)).toMatchObject({ storageStatus: 'unavailable', observationGap: true, entries: [{ result: 'error' }] })
    expect(f.data.size).toBe(0)
  })
  it('preserves malformed stored bytes and keeps subsequent diagnostic facts separate in memory', () => {
    const f = fixture(), raw = '{private@example.test'
    f.data.set(f.key, raw); f.current.begin(); f.time(1200, 200); f.current.ready()
    expect(decoded(f.current)).toMatchObject({ storageStatus: 'corrupt', observationGap: true, entries: [{ result: 'ready' }] })
    expect(f.data.get(f.key)).toBe(raw); expect(f.storage.setItem).not.toHaveBeenCalled()
    expect(f.current.exportJson()).not.toContain('private')
  })
  it('contains observer failures rather than stopping a load', () => {
    const f = fixture(), current = new Load2048Diagnostics({ ...f.options, changed: () => { throw new Error('UI failed') } })
    expect(current.begin()).toBeTruthy(); f.time(1200, 200); expect(current.ready()).toBe(true)
    expect(decoded(current).entries[0].result).toBe('ready')
  })
  it('exports canonical order even when storage fails and a new attempt starts under wall rollback', () => {
    const f = fixture(); f.current.begin(); f.time(1200, 200); f.current.ready()
    const newer = f.another(); newer.snapshot()
    f.storage.getItem.mockImplementation(() => { throw new Error('denied') }); f.time(900, 300)
    newer.begin()
    expect(decoded(newer)).toMatchObject({ storageStatus: 'unavailable', observationGap: true,
      entries: [{ startedAt: 900 }, { startedAt: 1000 }] })
  })
  it('keeps the export bounded after switching from a full stored ledger to memory-only observation', () => {
    const f = fixture(); f.current.begin()
    const full = decoded(f.current)
    full.entries = Array.from({ length: MAX_2048_LOAD_ATTEMPTS }, (_, index) => ({ ...full.entries[0], id: uuid(index + 10) }))
    f.data.set(f.key, JSON.stringify(full))
    const memory = f.another(); memory.snapshot()
    f.storage.getItem.mockImplementation(() => { throw new Error('denied') }); f.time(2000, 1100)
    expect(memory.begin()).toBeTruthy()
    expect(decoded(memory)).toMatchObject({ storageStatus: 'unavailable', truncated: true, observationGap: true })
    expect(decoded(memory).entries).toHaveLength(MAX_2048_LOAD_ATTEMPTS)
  })
})

describe('bounded cross-tab merge and observable interleavings', () => {
  it('preserves independent attempts and monotonic outcome/linkage when two tabs alternate writes', () => {
    const f = fixture(), second = f.another(), one = f.current.begin()!
    f.time(1100, 200); const two = second.begin()!
    f.time(1200, 300); f.current.ready(); f.current.linkPractice(uuid(50), 'new', 'practice')
    f.time(1300, 400); second.fail('timeout')
    const result = decoded(second)
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]).toMatchObject({ id: one, result: 'ready', practiceId: uuid(50) })
    expect(result.entries[1]).toMatchObject({ id: two, result: 'timeout' })
    expect(decoded(f.current)).toEqual(result)
  })
  it.each(['before-write', 'after-write'] as const)('merges another tab observed %s instead of losing its attempt', interleaving => {
    const f = fixture(), other = f.another(); f.current.begin(); f.time(1200, 300)
    let injected = false, reads = 0
    if (interleaving === 'before-write') {
      f.storage.getItem.mockImplementation(key => {
        const raw = f.data.get(key) ?? null
        if (++reads === 2 && !injected) { injected = true; other.begin() }
        return raw
      })
    } else f.storage.setItem.mockImplementation((key, raw) => {
      f.data.set(key, raw)
      if (!injected) { injected = true; other.begin() }
    })
    expect(f.current.ready()).toBe(true)
    expect(injected).toBe(true)
    expect(decoded(f.current)).toMatchObject({ storageStatus: 'ready', entries: [{ result: 'ready' }, { result: 'loading' }] })
    expect(readLoad2048Diagnostics(f.data.get(f.key)!)!.entries).toHaveLength(2)
  })
  it('fails closed on identity conflicts without overwriting the foreign bytes', () => {
    const f = fixture(); f.current.begin()
    const foreign = decoded(f.current); foreign.entries[0].build = 'unity-2048-008'
    const raw = JSON.stringify(foreign); f.data.set(f.key, raw)
    f.time(1200, 200); expect(f.current.ready()).toBe(true)
    expect(decoded(f.current)).toMatchObject({ storageStatus: 'conflict', observationGap: true, entries: [{ build: runtimeBuilds['2048'], result: 'ready' }] })
    expect(f.data.get(f.key)).toBe(raw)
  })
  it('does not resurrect pruned entries from an old clean instance and exposes missing retry ancestors as truncated', () => {
    const f = fixture(), original = f.current.begin()!
    for (let index = 1; index <= MAX_2048_LOAD_ATTEMPTS + 3; index++) {
      f.time(1000 + index * 10, 100 + index * 10); f.another().begin(original)
    }
    const result = decoded(f.current)
    expect(result.entries).toHaveLength(MAX_2048_LOAD_ATTEMPTS); expect(result.truncated).toBe(true)
    expect(result.entries.some(entry => entry.id === original)).toBe(false)
    expect(f.current.ready()).toBe(false)
    expect(decoded(f.current).entries).toEqual(result.entries)
  })
})
