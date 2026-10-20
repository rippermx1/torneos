import { describe, expect, it } from 'vitest'
import { MAX_TRAINING_2048_OBSERVATIONS, TRAINING_2048_OBSERVATIONS_KEY, Training2048Observations,
  readTraining2048Observations, type Training2048ObservationStage } from '@/lib/game/2048-training-observations'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const event = (stage: Training2048ObservationStage, validMoves = 0, sourceId = id(1), continuationId = stage === 'offered' ? null : id(2)) => ({
  type: 'training', assisted: true, score: 99_999_999, highestTile: 65_536, moves: 900,
  training: { stage, sourceId, continuationId, validMoves },
})
function fixture(category: 'observed_browser' | 'synthetic' = 'observed_browser') {
  const data = new Map<string, string>(), writes: string[] = []
  let now = Date.parse('2026-10-16T15:00:00Z')
  const options = { category, now: () => now, getStorage: () => ({ getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { writes.push(key); data.set(key, value) } }) }
  return { data, writes, options, tick: () => { now++ } }
}

describe('training demonstration ledger', () => {
  it('observes one offer/continuation, deduplicates callbacks and freezes the terminal result without gameplay data', () => {
    const { data, options } = fixture(), ledger = new Training2048Observations(options)
    expect(ledger.observe(event('started'))).toBe(false)
    expect(ledger.observe(event('offered'))).toBe(true)
    expect(ledger.observe(event('offered'))).toBe(false)
    expect(ledger.observe(event('started'))).toBe(true)
    expect(ledger.observe(event('move', 1))).toBe(true)
    expect(ledger.observe(event('move', 1))).toBe(false)
    expect(ledger.observe(event('ended', 1))).toBe(true)
    const closed = ledger.snapshot()
    expect(ledger.observe(event('started', 0, id(1), id(3)))).toBe(false)
    expect(ledger.observe(event('move', 2))).toBe(false)
    expect(ledger.observe(event('ended', 1))).toBe(false)
    expect(ledger.snapshot()).toEqual(closed)
    expect(closed.summary).toEqual({ retainedOffers: 1, retainedStarts: 1, continuationsWithValidMoves: 1,
      retainedValidMoves: 1, retainedEnds: 1, retainedInterruptions: 0 })
    expect(new Training2048Observations(options).snapshot()).toEqual(closed)
    expect(readTraining2048Observations(data.get(TRAINING_2048_OBSERVATIONS_KEY)!)).not.toBeNull()
    expect(ledger.exportJson()).not.toMatch(/"(?:board|seed|score|highestTile|moves|userId|email|impressions|revenue|provider)"/)
    expect(closed.scope).toMatch(/no impresiones.*ingresos.*retención comercial/)
  })
  it('rejects a replacement continuation and stale/invalid counters', () => {
    const { options } = fixture(), ledger = new Training2048Observations(options)
    ledger.observe(event('offered')); ledger.observe(event('started')); ledger.observe(event('move', 1))
    expect(ledger.observe(event('started', 0, id(1), id(3)))).toBe(false)
    expect(ledger.observe(event('move', 2, id(1), id(3)))).toBe(false)
    expect(ledger.observe(event('move', 0))).toBe(false)
    expect(ledger.observe(event('move', Number.MAX_SAFE_INTEGER))).toBe(false)
    expect(ledger.observe({ ...event('move', 2), assisted: false })).toBe(false)
    expect(ledger.observe({ ...event('move', 2), training: { ...event('move', 2).training, seed: 'private' } })).toBe(false)
    expect(ledger.snapshot().entries[0]).toMatchObject({ continuationId: id(2), validMoves: 1, status: 'active' })
  })
  it('records interruption independently and marks a missing move observation as incomplete', () => {
    const { options } = fixture(), ledger = new Training2048Observations(options)
    ledger.observe(event('offered')); ledger.observe(event('started')); ledger.observe(event('interrupted', 2))
    expect(ledger.snapshot()).toMatchObject({ observationGap: true, quality: { coverage: 'unknown' },
      entries: [{ status: 'interrupted', validMoves: 2 }], summary: { retainedInterruptions: 1 } })
  })
  it('preserves sequential tabs and consumes the same-millisecond start only once', () => {
    const { options } = fixture(), first = new Training2048Observations(options)
    first.observe(event('offered'))
    const second = new Training2048Observations(options)
    first.observe(event('started'))
    expect(second.observe(event('started', 0, id(1), id(3)))).toBe(false)
    second.observe(event('offered', 0, id(4)))
    expect(first.snapshot().entries).toHaveLength(2)
    expect(first.snapshot().entries.find(entry => entry.sourceId === id(1))?.continuationId).toBe(id(2))
  })
  it('bounds retained sources and reports that older observations were truncated', () => {
    const { options, tick } = fixture(), ledger = new Training2048Observations(options)
    for (let count = 1; count <= MAX_TRAINING_2048_OBSERVATIONS + 1; count++) { ledger.observe(event('offered', 0, id(count))); tick() }
    expect(ledger.snapshot()).toMatchObject({ truncated: true, quality: { coverage: 'unknown' }, summary: { retainedOffers: MAX_TRAINING_2048_OBSERVATIONS } })
    expect(ledger.snapshot().entries.some(entry => entry.sourceId === id(1))).toBe(false)
  })
  it('keeps synthetic observations in their own key', () => {
    const { data, options } = fixture('synthetic')
    new Training2048Observations(options).observe(event('offered'))
    expect(data.has(TRAINING_2048_OBSERVATIONS_KEY)).toBe(false)
    expect(data.has(`${TRAINING_2048_OBSERVATIONS_KEY}.synthetic`)).toBe(true)
    expect(new Training2048Observations({ ...options, category: 'observed_browser' }).snapshot().entries).toEqual([])
  })
  it.each(['not-json', JSON.stringify({ version: 1, board: [[2]] })])('preserves corrupt stored bytes and continues locally', raw => {
    const { data, options, writes } = fixture()
    data.set(TRAINING_2048_OBSERVATIONS_KEY, raw)
    const ledger = new Training2048Observations(options)
    expect(ledger.observe(event('offered'))).toBe(true)
    expect(ledger.snapshot()).toMatchObject({ quality: { storageStatus: 'corrupt', coverage: 'unknown' }, summary: { retainedOffers: 1 } })
    expect(data.get(TRAINING_2048_OBSERVATIONS_KEY)).toBe(raw); expect(writes).toEqual([])
  })
  it('does not block the demonstration when obtaining or writing storage is denied', () => {
    for (const getStorage of [() => { throw new Error('blocked') }, () => ({ getItem: () => null, setItem: () => { throw new Error('quota') } })]) {
      const ledger = new Training2048Observations({ category: 'observed_browser', getStorage })
      expect(() => { ledger.observe(event('offered')); ledger.observe(event('started')); ledger.observe(event('move', 1)) }).not.toThrow()
      expect(ledger.snapshot()).toMatchObject({ quality: { storageStatus: 'unavailable' }, summary: { retainedValidMoves: 1 } })
    }
  })
})
