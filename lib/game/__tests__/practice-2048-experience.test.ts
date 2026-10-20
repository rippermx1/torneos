import { expect, it, vi } from 'vitest'
import { Practice2048Experience } from '../practice-2048-experience'
import { Unity2048Session } from '../unity-2048-session'
import { PERSONAL_2048_PROGRESS_KEY } from '../personal-2048-progress'
import { SESSIONS_2048_STORAGE_KEY, summarizeSessions2048, readSessions2048 } from '../sessions-2048'

function fixture() {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) } } as Storage
  let id = 0, now = 10000
  const options = { getStorage: () => storage, now: () => now++, uuid: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}` }
  return { data, options }
}

it('persists real session progress through moves, restart and reload; hidden/cleanup do not complete a practice', async () => {
  const { data, options } = fixture()
  const experience = new Practice2048Experience(options)
  const session = new Unity2048Session(vi.fn(), vi.fn(), undefined, undefined, experience.observe)
  experience.ready()
  await session.start('experience')
  for (const direction of ['left', 'down', 'right', 'up'] as const) await session.move(direction)
  const score = session.snapshot().score
  expect(experience.snapshot().bestScore).toBe(score)
  experience.visibility(false); experience.visibility(true); experience.checkpoint(); session.destroy()
  expect(experience.snapshot().history[0].status).toBe('active')
  const reloaded = new Practice2048Experience(options)
  expect(reloaded.snapshot()).toMatchObject({ bestScore: score, currentPracticeId: null })
  reloaded.ready()
  const another = new Unity2048Session(vi.fn(), vi.fn(), undefined, undefined, reloaded.observe)
  await another.start('next'); await another.move('left'); await another.start('restart')
  expect(reloaded.snapshot().history).toHaveLength(3)
  expect(reloaded.snapshot().history.filter(entry => entry.status === 'interrupted')).toHaveLength(1)
  expect(reloaded.snapshot().bestScore).toBeGreaterThanOrEqual(score)
  const ledger = readSessions2048(data.get(SESSIONS_2048_STORAGE_KEY)!)!
  expect(ledger.practices.filter(practice => practice.status === 'ended')).toHaveLength(0)
  expect(ledger.events.filter(event => event.kind === 'paused')).toHaveLength(1)
  expect(JSON.stringify(ledger)).not.toMatch(/"(board|seed|score|cells)"/)
})

it('keeps synthetic records and observations outside observed practice', () => {
  const { data, options } = fixture()
  const synthetic = new Practice2048Experience({ ...options, category: 'synthetic' })
  synthetic.ready()
  synthetic.observe({ type: 'start', score: 0, highestTile: 2, moves: 0 })
  synthetic.observe({ type: 'move', score: 1000, highestTile: 128, moves: 20 })
  expect(data.has(PERSONAL_2048_PROGRESS_KEY)).toBe(false)
  const observed = new Practice2048Experience(options)
  expect(observed.snapshot().bestScore).toBe(0)
  const report = summarizeSessions2048(readSessions2048(data.get(SESSIONS_2048_STORAGE_KEY)!))
  expect(JSON.stringify(report)).not.toContain('1000')
})

it('refreshes the pre-game mark when another tab has updated it', () => {
  const { options } = fixture()
  const first = new Practice2048Experience(options)
  const second = new Practice2048Experience(options)
  second.observe({ type: 'start', score: 0, highestTile: 2, moves: 0 })
  second.observe({ type: 'move', score: 1024, highestTile: 128, moves: 100 })
  first.observe({ type: 'start', score: 0, highestTile: 2, moves: 0 })
  expect(first.snapshot().bestBefore).toBe(1024)
})

it('plays in memory when obtaining localStorage is denied', () => {
  const experience = new Practice2048Experience({ getStorage: () => { throw new Error('denied') } })
  experience.ready()
  experience.observe({ type: 'start', score: 0, highestTile: 2, moves: 0 })
  experience.observe({ type: 'move', score: 16, highestTile: 8, moves: 3 })
  expect(experience.snapshot()).toMatchObject({ bestScore: 16, storageStatus: 'unavailable' })
})
