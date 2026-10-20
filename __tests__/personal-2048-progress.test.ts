import { describe, expect, it } from 'vitest'
import { PERSONAL_2048_PROGRESS_KEY, PERSONAL_2048_RULES_VERSION, Personal2048Progress,
  type Personal2048Entry, type Personal2048Storage } from '../lib/game/personal-2048-progress'

function memoryStorage(initial: string | null = null) {
  let raw = initial
  const writes: string[] = []
  const storage: Personal2048Storage = {
    getItem: key => key === PERSONAL_2048_PROGRESS_KEY ? raw : null,
    setItem: (key, value) => { if (key === PERSONAL_2048_PROGRESS_KEY) { raw = value; writes.push(value) } },
  }
  return { storage, writes, raw: () => raw, replace: (value: string) => { raw = value } }
}

const entry = (patch: Partial<Personal2048Entry> = {}): Personal2048Entry => ({
  practiceId: 'practice-1', startedAt: 1_000, updatedAt: 2_000, rulesVersion: PERSONAL_2048_RULES_VERSION,
  score: 64, highestTile: 32, moves: 20, status: 'active', assisted: false, ...patch,
})

describe('private 2048 progress', () => {
  it('persists an active mark before game over and reads it after reload without a board or seed', () => {
    const store = memoryStorage(), progress = new Personal2048Progress(() => store.storage)
    const snapshot = progress.upsert(entry())
    expect(snapshot).toMatchObject({ bestScore: 64, bestTile: 32, storageStatus: 'ready', history: [entry()] })
    expect(new Personal2048Progress(() => store.storage).snapshot()).toEqual(snapshot)
    expect(Object.keys(JSON.parse(store.raw()!).history[0]).sort()).toEqual(Object.keys(entry()).sort())
    expect(store.raw()).not.toMatch(/board|seed|cells/)
  })

  it('upserts pause and bfcache observations without ending or duplicating a practice', () => {
    const store = memoryStorage(), progress = new Personal2048Progress(() => store.storage)
    progress.upsert(entry())
    progress.upsert(entry({ updatedAt: 3_000 }))
    progress.upsert(entry({ updatedAt: 4_000, moves: 21, score: 68 }))
    expect(progress.snapshot().history).toEqual([entry({ updatedAt: 4_000, moves: 21, score: 68 })])
    progress.upsert(entry({ updatedAt: 5_000, moves: 21, score: 68, status: 'interrupted' }))
    expect(progress.snapshot().history).toHaveLength(1)
    expect(progress.snapshot().history[0].status).toBe('interrupted')
  })

  it('retains the previous interrupted mark when a new practice begins', () => {
    const store = memoryStorage(), progress = new Personal2048Progress(() => store.storage)
    progress.upsert(entry({ status: 'interrupted' }))
    const next = entry({ practiceId: 'practice-2', startedAt: 3_000, updatedAt: 3_000, score: 0, highestTile: 2, moves: 0 })
    progress.upsert(next)
    expect(progress.snapshot()).toMatchObject({ bestScore: 64, bestTile: 32, history: [next, entry({ status: 'interrupted' })] })
  })

  it('freezes a completed result against later cleanup, assistance and active callbacks', () => {
    const store = memoryStorage(), progress = new Personal2048Progress(() => store.storage)
    progress.upsert(entry({ status: 'completed' }))
    const completed = progress.snapshot(), writes = store.writes.length
    progress.upsert(entry({ updatedAt: 3_000, score: 128, highestTile: 64, moves: 30 }))
    progress.upsert(entry({ updatedAt: 4_000, status: 'interrupted' }))
    progress.upsert(entry({ updatedAt: 5_000, score: 256, assisted: true }))
    expect(progress.snapshot()).toEqual(completed)
    expect(store.writes).toHaveLength(writes)
  })

  it('ignores assisted continuations and mismatching rule versions entirely', () => {
    const store = memoryStorage(), progress = new Personal2048Progress(() => store.storage)
    progress.upsert(entry())
    progress.upsert(entry({ practiceId: 'training-1', score: 1_024, highestTile: 256, assisted: true }))
    progress.upsert(entry({ practiceId: 'other-rules', rulesVersion: 'other-v1', score: 2_048 }))
    expect(progress.snapshot()).toMatchObject({ bestScore: 64, bestTile: 32, history: [entry()] })
    expect(store.writes).toHaveLength(1)
  })

  it('keeps only the five most recent practices while preserving older lifetime records', () => {
    const store = memoryStorage(), progress = new Personal2048Progress(() => store.storage)
    progress.upsert(entry({ practiceId: 'old-record', status: 'completed', score: 2_048, highestTile: 512 }))
    for (let i = 2; i <= 7; i++) progress.upsert(entry({ practiceId: `practice-${i}`, startedAt: i * 1_000, updatedAt: i * 1_000, status: 'interrupted' }))
    expect(progress.snapshot().history.map(item => item.practiceId)).toEqual(['practice-7', 'practice-6', 'practice-5', 'practice-4', 'practice-3'])
    expect(new Personal2048Progress(() => store.storage).snapshot()).toMatchObject({ bestScore: 2_048, bestTile: 512 })
  })

  it('ignores stale observations and changed identity metadata rather than lowering progress', () => {
    const store = memoryStorage(), progress = new Personal2048Progress(() => store.storage)
    progress.upsert(entry())
    progress.upsert(entry({ updatedAt: 1_500, score: 128 }))
    progress.upsert(entry({ updatedAt: 3_000, moves: 19 }))
    progress.upsert(entry({ updatedAt: 3_000, score: 60 }))
    progress.upsert(entry({ updatedAt: 3_000, highestTile: 16 }))
    progress.upsert(entry({ startedAt: 500, updatedAt: 3_000 }))
    expect(progress.snapshot().history).toEqual([entry()])
    expect(store.writes).toHaveLength(1)
  })

  it.each(['{broken', JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, rulesVersion: 'future-rules', bestScore: 0, bestTile: 0, history: [] })])(
    'preserves invalid or incompatible storage and still updates unsaved marks: %s', raw => {
      const store = memoryStorage(raw), progress = new Personal2048Progress(() => store.storage)
      expect(progress.snapshot().storageStatus).toBe('invalid')
      expect(progress.upsert(entry())).toMatchObject({ bestScore: 64, bestTile: 32, storageStatus: 'invalid', history: [entry()] })
      expect(store.raw()).toBe(raw)
      expect(store.writes).toHaveLength(0)
    })

  it('tolerates private storage access, read and write failures while preserving in-memory progress', () => {
    const getters: (() => Personal2048Storage | null)[] = [
      () => null,
      () => { throw new Error('Access denied') },
      () => ({ getItem: () => { throw new Error('Read denied') }, setItem: () => undefined }),
      () => ({ getItem: () => null, setItem: () => { throw new Error('Quota exceeded') } }),
    ]
    for (const getStorage of getters) {
      const progress = new Personal2048Progress(getStorage)
      expect(progress.upsert(entry())).toMatchObject({ bestScore: 64, storageStatus: 'unavailable', history: [entry()] })
      expect(progress.upsert(entry({ updatedAt: 3_000, score: 128, highestTile: 64, moves: 30 }))).toMatchObject({ bestScore: 128, bestTile: 64 })
    }
  })

  it('rejects malformed entries and persisted data without overwriting stored bytes', () => {
    const store = memoryStorage(), progress = new Personal2048Progress(() => store.storage)
    const invalid = [entry({ updatedAt: 999 }), entry({ score: Number.NaN }), entry({ highestTile: 3 }),
      entry({ moves: -1 }), { ...entry(), board: [[2]] }, { ...entry(), seed: 'private' }]
    for (const value of invalid) progress.upsert(value as Personal2048Entry)
    expect(progress.snapshot().history).toEqual([])
    expect(store.writes).toHaveLength(0)
    progress.upsert(entry())
    const raw = JSON.stringify({ ...JSON.parse(store.raw()!), bestScore: 0 })
    store.replace(raw)
    expect(new Personal2048Progress(() => store.storage).snapshot().storageStatus).toBe('invalid')
    progress.upsert(entry({ updatedAt: 3_000, score: 128, highestTile: 64, moves: 30 }))
    expect(progress.snapshot()).toMatchObject({ bestScore: 128, storageStatus: 'invalid' })
    expect(store.raw()).toBe(raw)
  })

  it('returns independent snapshots and preserves marks from sequential instances', () => {
    const store = memoryStorage(), first = new Personal2048Progress(() => store.storage), second = new Personal2048Progress(() => store.storage)
    first.upsert(entry({ status: 'completed', score: 1_024, highestTile: 256 }))
    second.upsert(entry({ practiceId: 'second', startedAt: 3_000, updatedAt: 3_000 }))
    first.upsert(entry({ practiceId: 'third', startedAt: 4_000, updatedAt: 4_000 }))
    const snapshot = first.snapshot()
    expect(snapshot).toMatchObject({ bestScore: 1_024, bestTile: 256 })
    expect(snapshot.history.map(item => item.practiceId)).toEqual(['third', 'second', 'practice-1'])
    snapshot.history[0].score = 99_999
    snapshot.history.pop()
    expect(first.snapshot().history).toHaveLength(3)
    expect(first.snapshot().history[0].score).toBe(64)
  })
})
