import { describe, expect, it } from 'vitest'
import { DAILY_2048_PROGRESS_KEY, DAILY_2048_RULES_VERSION, Daily2048Progress,
  getDaily2048Challenge, readDaily2048Challenge } from '../lib/game/daily-2048'

const at = (value: string) => Date.parse(value)
function store(initial?: string) {
  const values = new Map<string, string>(initial ? [[DAILY_2048_PROGRESS_KEY, initial]] : [])
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

describe('2048 challenge calendar', () => {
  it('uses Chile dates and changes challenge at the actual local midnight', () => {
    const last = getDaily2048Challenge(at('2026-10-16T02:59:59.999Z'))
    const next = getDaily2048Challenge(at('2026-10-16T03:00:00Z'))
    expect(last.day).toBe('2026-10-15')
    expect(next.day).toBe('2026-10-16')
    expect(last.closesAt).toBe(next.startsAt)
    expect(last.seed).toBe(getDaily2048Challenge(at('2026-10-15T15:00:00Z')).seed)
    expect(last.id).not.toBe(next.id)
    expect(last).toMatchObject({ targetTile: 128, rulesVersion: DAILY_2048_RULES_VERSION })
  })

  it('uses 25 hours on the repeated autumn day and 23 hours on the skipped spring midnight', () => {
    const autumn = getDaily2048Challenge(at('2026-04-04T15:00:00Z'))
    expect(autumn.startsAt).toBe(at('2026-04-04T03:00:00Z'))
    expect(autumn.closesAt).toBe(at('2026-04-05T04:00:00Z'))
    expect(autumn.closesAt - autumn.startsAt).toBe(25 * 3_600_000)
    expect(getDaily2048Challenge(at('2026-04-05T03:30:00Z')).id).toBe(autumn.id)
    const spring = getDaily2048Challenge(at('2026-09-06T15:00:00Z'))
    expect(spring.startsAt).toBe(at('2026-09-06T04:00:00Z'))
    expect(spring.closesAt).toBe(at('2026-09-07T03:00:00Z'))
    expect(spring.closesAt - spring.startsAt).toBe(23 * 3_600_000)
  })

  it('parses only an exact canonical definition and rejects changes or extra data', () => {
    const definition = getDaily2048Challenge(at('2026-10-15T15:00:00Z'))
    expect(readDaily2048Challenge(definition)).toEqual(definition)
    for (const invalid of [null, [], { ...definition, seed: 'other' }, { ...definition, targetTile: 256 },
      { ...definition, closesAt: definition.closesAt + 1 }, { ...definition, serverNow: definition.closesAt },
      { ...definition, rulesVersion: 'other' }, { ...definition, extra: true }]) expect(readDaily2048Challenge(invalid)).toBeNull()
    expect(() => getDaily2048Challenge(Number.NaN)).toThrow(RangeError)
  })
})

describe('private daily 2048 progress', () => {
  it('counts unique attempts and grants the goal only after an advancing valid move', () => {
    let now = at('2026-10-15T15:00:00Z')
    const storage = store(), challenge = getDaily2048Challenge(now), progress = new Daily2048Progress({ getStorage: () => storage, now: () => now })
    progress.begin(challenge, 'practice-1'); progress.begin(challenge, 'practice-1')
    progress.observe({ type: 'start', score: 0, highestTile: 128, moves: 0 })
    expect(progress.snapshot().record).toMatchObject({ attempts: 1, goalReached: false, status: 'active' })
    progress.observe({ type: 'move', score: 0, highestTile: 128, moves: 0 })
    expect(progress.snapshot().record?.goalReached).toBe(false)
    now++
    progress.observe({ type: 'move', score: 128, highestTile: 128, moves: 1 })
    expect(progress.snapshot(challenge.day).record).toMatchObject({ score: 128, highestTile: 128, goalReached: true })
    progress.observe({ type: 'end', score: 128, highestTile: 128, moves: 1 })
    const reload = new Daily2048Progress({ getStorage: () => storage, now: () => now })
    reload.begin(challenge, 'practice-1')
    expect(reload.snapshot(challenge.id).record).toMatchObject({ attempts: 1, status: 'completed', goalReached: true })
    reload.begin(challenge, 'practice-2')
    expect(reload.snapshot().record).toMatchObject({ attempts: 2, score: 128, highestTile: 128, goalReached: true, status: 'active' })
    expect(storage.getItem(DAILY_2048_PROGRESS_KEY)).not.toMatch(/seed|board|cells/)
  })

  it('does not grant a goal on start, terminal callbacks, no-ops, duplicates or assistance', () => {
    const now = at('2026-10-15T15:00:00Z'), storage = store(), challenge = getDaily2048Challenge(now)
    const progress = new Daily2048Progress({ getStorage: () => storage, now: () => now })
    progress.begin(challenge, 'a')
    progress.observe({ type: 'move', score: 4, highestTile: 4, moves: 1 })
    progress.observe({ type: 'move', score: 1_024, highestTile: 128, moves: 1 })
    progress.observe({ type: 'end', score: 1_024, highestTile: 128, moves: 20 })
    expect(progress.snapshot().record).toMatchObject({ score: 4, highestTile: 4, goalReached: false, status: 'completed' })
    progress.begin(challenge, 'b')
    progress.observe({ type: 'move', score: 1_024, highestTile: 128, moves: 20, assisted: true })
    progress.observe({ type: 'move', score: 1_024, highestTile: 128, moves: 21 })
    expect(progress.snapshot().record).toMatchObject({ goalReached: false, score: 4, status: 'interrupted' })
  })

  it('preserves the move counter across a tracker retry and rejects a future challenge without attributing events to the previous one', () => {
    const now = at('2026-10-15T15:00:00Z'), storage = store(), challenge = getDaily2048Challenge(now)
    const first = new Daily2048Progress({ getStorage: () => storage, now: () => now })
    first.begin(challenge, 'retry'); first.observe({ type: 'move', score: 4, highestTile: 4, moves: 1 })
    const retry = new Daily2048Progress({ getStorage: () => storage, now: () => now })
    retry.begin(challenge, 'retry'); retry.observe({ type: 'move', score: 128, highestTile: 128, moves: 1 })
    expect(retry.snapshot().record).toMatchObject({ attempts: 1, score: 4, goalReached: false })
    retry.begin(getDaily2048Challenge(challenge.closesAt), 'future')
    retry.observe({ type: 'move', score: 128, highestTile: 128, moves: 2 })
    expect(retry.snapshot().record).toMatchObject({ attempts: 1, score: 4, goalReached: false })
  })

  it('rejects noncanonical persisted progress including sensitive fields and goals reached after close', () => {
    const now = at('2026-10-15T15:00:00Z'), challenge = getDaily2048Challenge(now), initial = store()
    const first = new Daily2048Progress({ getStorage: () => initial, now: () => now })
    first.begin(challenge, 'a'); first.observe({ type: 'move', score: 128, highestTile: 128, moves: 1 })
    const raw = initial.getItem(DAILY_2048_PROGRESS_KEY)!
    for (const change of [
      (data: Record<string, unknown>) => { data.seed = 'forbidden' },
      (data: Record<string, unknown>) => { data.rulesVersion = 'future-rules' },
      (data: Record<string, unknown>) => { const entries = data.entries as { attempts: { goalReachedAt: number }[] }[]; entries[0].attempts[0].goalReachedAt = challenge.closesAt },
    ]) {
      const data = JSON.parse(raw) as Record<string, unknown>; change(data)
      const corruptRaw = JSON.stringify(data), corrupt = store(corruptRaw)
      const tracker = new Daily2048Progress({ getStorage: () => corrupt, now: () => now })
      expect(tracker.snapshot()).toMatchObject({ storageStatus: 'invalid', entries: [] })
      tracker.begin(challenge, 'b')
      expect(corrupt.getItem(DAILY_2048_PROGRESS_KEY)).toBe(corruptRaw)
    }
  })

  it('expires at the exact closing instant and never credits a late move to either day', () => {
    let now = at('2026-09-06T15:00:00Z')
    const storage = store(), challenge = getDaily2048Challenge(now), progress = new Daily2048Progress({ getStorage: () => storage, now: () => now })
    progress.begin(challenge, 'old')
    now = challenge.closesAt
    progress.observe({ type: 'move', score: 128, highestTile: 128, moves: 1 })
    expect(progress.snapshot(challenge.id).record).toMatchObject({ status: 'expired', score: 0, goalReached: false })
    expect(progress.snapshot().record).toBeNull()
    progress.begin(challenge, 'late')
    expect(progress.snapshot(challenge.day).record?.attempts).toBe(1)
    const next = getDaily2048Challenge(now)
    progress.begin(next, 'new')
    expect(progress.snapshot(next.id).record).toMatchObject({ attempts: 1, score: 0, goalReached: false })
  })

  it('retains a goal reached just before close after later expiry', () => {
    let now = at('2026-10-15T15:00:00Z')
    const storage = store(), challenge = getDaily2048Challenge(now), progress = new Daily2048Progress({ getStorage: () => storage, now: () => now })
    progress.begin(challenge, 'a'); now = challenge.closesAt - 1
    progress.observe({ type: 'move', score: 128, highestTile: 128, moves: 1 }); now++
    expect(progress.snapshot(challenge.id).record).toMatchObject({ goalReached: true, status: 'expired' })
    expect(new Daily2048Progress({ getStorage: () => storage, now: () => now }).snapshot(challenge.id).record?.goalReached).toBe(true)
  })

  it('keeps only 30 Chile calendar dates instead of a fixed-hour window', () => {
    let now = at('2026-08-20T15:00:00Z')
    const storage = store(), progress = new Daily2048Progress({ getStorage: () => storage, now: () => now })
    for (let i = 0; i < 31; i++) {
      now = at('2026-08-20T15:00:00Z') + i * 86_400_000
      progress.begin(getDaily2048Challenge(now), `practice-${i}`)
    }
    expect(progress.snapshot().entries).toHaveLength(30)
    expect(progress.snapshot().entries.at(-1)?.day).toBe('2026-08-21')
    expect(progress.snapshot('2026-08-20').record).toBeNull()
  })

  it('isolates synthetic observations and returns independent public aggregates', () => {
    const now = at('2026-10-15T15:00:00Z'), storage = store(), challenge = getDaily2048Challenge(now)
    const synthetic = new Daily2048Progress({ getStorage: () => storage, category: 'synthetic', now: () => now })
    synthetic.begin(challenge, 'qa'); synthetic.observe({ type: 'move', score: 128, highestTile: 128, moves: 1 })
    const observed = new Daily2048Progress({ getStorage: () => storage, now: () => now })
    expect(observed.snapshot().entries).toEqual([])
    expect(storage.values.has(`${DAILY_2048_PROGRESS_KEY}.synthetic`)).toBe(true)
    const snapshot = synthetic.snapshot()
    snapshot.entries[0].score = 99_999
    expect(synthetic.snapshot().record?.score).toBe(128)
  })

  it('tolerates corrupt, denied and unavailable storage without overwriting prior bytes', () => {
    const now = at('2026-10-15T15:00:00Z'), challenge = getDaily2048Challenge(now), corrupt = store('{corrupt')
    const progress = new Daily2048Progress({ getStorage: () => corrupt, now: () => now })
    progress.begin(challenge, 'a'); progress.observe({ type: 'move', score: 128, highestTile: 128, moves: 1 })
    expect(progress.snapshot()).toMatchObject({ storageStatus: 'invalid', record: { goalReached: true } })
    expect(corrupt.getItem(DAILY_2048_PROGRESS_KEY)).toBe('{corrupt')
    for (const getStorage of [() => null, () => { throw Error('denied') }, () => ({ getItem: () => null, setItem: () => { throw Error('quota') } })]) {
      const tracker = new Daily2048Progress({ getStorage, now: () => now })
      tracker.begin(challenge, 'a'); tracker.observe({ type: 'move', score: 128, highestTile: 128, moves: 1 })
      expect(tracker.snapshot()).toMatchObject({ storageStatus: 'unavailable', record: { goalReached: true } })
    }
  })
})
