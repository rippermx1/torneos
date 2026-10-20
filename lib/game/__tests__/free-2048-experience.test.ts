import { expect, it, vi } from 'vitest'
import { Free2048Experience } from '../free-2048-experience'
import { getDaily2048Challenge } from '../daily-2048'
import { Unity2048Session } from '../unity-2048-session'

function fixture(category: 'observed_browser' | 'synthetic' = 'observed_browser') {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } } as Storage
  let now = Date.parse('2026-10-15T15:00:00Z'), id = 0, available = true
  const options = { getStorage: () => storage, category, now: () => now, dailyNow: () => now,
    dailyAvailable: () => available, uuid: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}` }
  return { data, options, time: (at: number) => { now = at }, availability: (value: boolean) => { available = value } }
}
const start = { type: 'start', score: 0, highestTile: 2, moves: 0 } as const

it('keeps free practice marks separate from daily achievements across mode switches and retries', () => {
  const { options } = fixture()
  const game = new Free2048Experience(options)
  game.ready(); game.observe(start)
  expect(game.snapshot().retention.daysPlayedCount).toBe(0)
  game.observe({ type: 'move', score: 64, highestTile: 16, moves: 1 })
  const challenge = getDaily2048Challenge(options.now())
  game.selectNext('daily', challenge)
  game.observe({ type: 'interrupted', score: 64, highestTile: 16, moves: 1 }); game.observe(start)
  game.observe({ type: 'move', score: 512, highestTile: 128, moves: 1 })
  expect(game.snapshot()).toMatchObject({ mode: 'daily', personal: { bestScore: 64 }, daily: { record: { attempts: 1, goalReached: true } } })
  game.observe({ type: 'interrupted', score: 512, highestTile: 128, moves: 1 }); game.observe(start)
  expect(game.snapshot().daily.record).toMatchObject({ attempts: 2, goalReached: true, score: 512 })
  game.selectNext('practice'); game.observe({ type: 'interrupted', score: 0, highestTile: 2, moves: 0 }); game.observe(start)
  expect(game.snapshot().personal.history).toHaveLength(2)
  expect(game.snapshot().retention.daysPlayedCount).toBe(1)
  const exported = JSON.parse(game.exportJson())
  expect(exported).not.toHaveProperty('practice')
  expect(exported).not.toHaveProperty('daily')
  expect(exported.observations.ledger.sessions.map((item: { mode: string }) => item.mode).sort()).toEqual(['daily', 'practice'])
})

it('uses the real engine with an identical board and RNG sequence for a daily retry', async () => {
  const { options } = fixture()
  const free = new Free2048Experience(options), session = new Unity2048Session(vi.fn(), vi.fn(), undefined, undefined, free.observe)
  const challenge = getDaily2048Challenge(options.now())
  free.ready(); free.selectNext('daily', challenge); await session.start(challenge.seed)
  const initial = session.snapshot().cells
  await session.move('left'); await session.move('down')
  const moved = session.snapshot().cells
  await session.start(challenge.seed)
  expect(session.snapshot().cells).toEqual(initial)
  await session.move('left'); await session.move('down')
  expect(session.snapshot().cells).toEqual(moved)
  expect(free.snapshot().daily.record?.attempts).toBe(2)
})

it('qualifies only valid play, once per attempt/day, and discards stale account replies across midnight', async () => {
  const { options, time } = fixture()
  const replies: Array<(result: { status: 'recorded' | 'unavailable' }) => void> = []
  const recordAccount = vi.fn(() => new Promise<{ status: 'recorded' | 'unavailable' }>(resolve => replies.push(resolve)))
  const game = new Free2048Experience({ ...options, measureAccountActivity: true, recordAccount })
  game.ready(); game.observe(start)
  expect(recordAccount).not.toHaveBeenCalled()
  game.observe({ type: 'move', score: 4, highestTile: 4, moves: 1 })
  game.observe({ type: 'move', score: 8, highestTile: 4, moves: 2 })
  expect(recordAccount).toHaveBeenCalledTimes(1)
  time(Date.parse('2026-10-16T15:00:00Z'))
  expect(game.snapshot().accountStatus).toBe('idle')
  game.observe({ type: 'move', score: 12, highestTile: 8, moves: 3 })
  expect(recordAccount).toHaveBeenCalledTimes(2)
  replies[1]({ status: 'recorded' }); await Promise.resolve()
  replies[0]({ status: 'unavailable' }); await Promise.resolve()
  expect(game.snapshot().accountStatus).toBe('recorded')
  expect(game.snapshot().retention.daysPlayedCount).toBe(2)
})

it('blocks daily starts and credits while the server day is being resynchronized', () => {
  const { options, availability, time } = fixture()
  const game = new Free2048Experience(options), challenge = getDaily2048Challenge(options.now())
  game.selectNext('daily', challenge); game.observe(start)
  availability(false)
  expect(game.selectNext('daily', challenge)).toBe(false)
  game.observe({ type: 'move', score: 512, highestTile: 128, moves: 1 })
  expect(game.snapshot().daily.record?.goalReached).toBe(false)
  time(challenge.closesAt); availability(true)
  game.observe({ type: 'move', score: 1024, highestTile: 256, moves: 2 })
  expect(game.snapshot().daily.record).toMatchObject({ status: 'expired', goalReached: false })
})

it('never sends synthetic activity and does not expire stored daily data before a confirmed calendar', () => {
  const { data, options, time } = fixture('synthetic')
  const recordAccount = vi.fn()
  const game = new Free2048Experience({ ...options, measureAccountActivity: true, recordAccount })
  const challenge = getDaily2048Challenge(options.now())
  game.selectNext('daily', challenge); game.observe(start); game.observe({ type: 'move', score: 512, highestTile: 128, moves: 1 })
  expect(recordAccount).not.toHaveBeenCalled()
  const before = new Map(data)
  time(challenge.closesAt + 86400000 * 100)
  const reloaded = new Free2048Experience(options)
  reloaded.snapshot()
  expect(data).toEqual(before)
  time(challenge.serverNow)
  reloaded.setToday(challenge)
  expect(reloaded.snapshot().daily.record?.goalReached).toBe(true)
})
