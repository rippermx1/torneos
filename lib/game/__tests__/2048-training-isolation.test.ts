import { expect, it, vi } from 'vitest'
import { Free2048Experience } from '../free-2048-experience'
import { Practice2048Experience } from '../practice-2048-experience'
import { Unity2048Session, type Practice2048Event } from '../unity-2048-session'
import { TRAINING_2048_OBSERVATIONS_KEY } from '../2048-training-observations'
import { PERSONAL_2048_PROGRESS_KEY } from '../personal-2048-progress'
import { getDaily2048Challenge } from '../daily-2048'

const sourceId = '11111111-1111-4111-8111-111111111111'
const continuationId = '22222222-2222-4222-8222-222222222222'
const normal = (type: 'start' | 'move' | 'end', score: number, moves: number, practiceId = sourceId): Practice2048Event => ({
  type, score, highestTile: score ? 16 : 2, moves, practiceId,
})
const training = (stage: 'offered' | 'started' | 'move' | 'ended' | 'interrupted', validMoves = 0): Practice2048Event => ({
  type: 'training', assisted: true, practiceId: sourceId, score: 999_999, highestTile: 65_536, moves: 999,
  training: { stage, sourceId, continuationId: stage === 'offered' ? null : continuationId, validMoves },
})
function fixture() {
  const data = new Map<string, string>(), writes: string[] = []
  let now = Date.parse('2026-10-16T15:00:00Z'), id = 0
  const storage = { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { writes.push(key); data.set(key, value) } } as Storage
  const options = { getStorage: () => storage, category: 'observed_browser' as const, now: () => now,
    uuid: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}` }
  return { data, writes, options, setTime: (value: number) => { now = value } }
}
const normalBytes = (data: Map<string, string>) => [...data].filter(([key]) => !key.startsWith(TRAINING_2048_OBSERVATIONS_KEY))

it('defensively ignores assisted and training events in the actual personal adapter', () => {
  const { data, options, writes } = fixture(), practice = new Practice2048Experience(options)
  practice.ready(); practice.observe(normal('start', 0, 0)); practice.observe(normal('move', 64, 3)); practice.observe(normal('end', 64, 3))
  const before = practice.snapshot(), bytes = new Map(data); writes.length = 0
  for (const event of [training('offered'), training('started'), training('move', 1), training('ended', 1),
    { ...normal('move', 999_999, 999), assisted: true }]) practice.observe(event)
  expect(practice.snapshot()).toEqual(before); expect(data).toEqual(bytes); expect(writes).toEqual([])
  expect(before.history[0]).toMatchObject({ practiceId: sourceId, score: 64, status: 'completed', assisted: false })
})

it('isolates higher assisted scores, no normal writes/RPC/days, then counts the next normal practice', async () => {
  const { data, options, writes, setTime } = fixture()
  const recordAccount = vi.fn(async () => ({ status: 'recorded' as const }))
  const free = new Free2048Experience({ ...options, measureAccountActivity: true, recordAccount })
  free.ready(); free.observe(normal('start', 0, 0)); free.observe(normal('move', 64, 3)); free.observe(normal('end', 64, 3))
  await Promise.resolve()
  const personal = free.snapshot().personal, before = normalBytes(data); writes.length = 0
  setTime(Date.parse('2026-10-17T15:00:00Z'))
  for (const event of [training('offered'), training('started'), training('move', 1), training('ended', 1)]) free.observe(event)
  expect(free.snapshot().personal).toEqual(personal)
  expect(free.snapshot().retention.daysPlayedCount).toBe(1)
  expect(normalBytes(data)).toEqual(before)
  expect(writes.every(key => key === TRAINING_2048_OBSERVATIONS_KEY)).toBe(true)
  expect(recordAccount).toHaveBeenCalledTimes(1)
  const exported = JSON.parse(free.exportJson())
  expect(exported.personalProgress).toEqual(personal)
  expect(exported.trainingDemonstrationObservations.summary).toMatchObject({ retainedOffers: 1, retainedStarts: 1, retainedEnds: 1 })
  expect(exported.trainingDemonstrationObservations).not.toHaveProperty('score')
  expect(JSON.stringify(exported)).not.toMatch(/"(?:board|seed|rng|access_token|userId|email)"/)
  free.observe(normal('start', 0, 0, continuationId)); free.observe(normal('move', 128, 1, continuationId))
  await Promise.resolve()
  expect(free.snapshot().personal).toMatchObject({ bestScore: 128, currentPracticeId: continuationId })
  expect(free.snapshot().retention.daysPlayedCount).toBe(2); expect(recordAccount).toHaveBeenCalledTimes(2)
})

it('does not qualify a play day or send account activity from training-only observations', () => {
  const { options } = fixture(), recordAccount = vi.fn()
  const free = new Free2048Experience({ ...options, measureAccountActivity: true, recordAccount })
  for (const event of [training('offered'), training('started'), training('move', 1), training('interrupted', 1)]) free.observe(event)
  expect(free.snapshot().retention.daysPlayedCount).toBe(0)
  expect(free.snapshot().personal.history).toEqual([]); expect(recordAccount).not.toHaveBeenCalled()
})

it('leaves active daily state byte-identical even when an assisted callback arrives after daily expiry', () => {
  const { data, options, writes, setTime } = fixture(), recordAccount = vi.fn(async () => ({ status: 'recorded' as const }))
  const free = new Free2048Experience({ ...options, measureAccountActivity: true, recordAccount }), challenge = getDaily2048Challenge(options.now())
  free.ready(); free.selectNext('daily', challenge); free.observe(normal('start', 0, 0)); free.observe(normal('move', 64, 1))
  const before = normalBytes(data); writes.length = 0
  setTime(challenge.closesAt + 1)
  for (const event of [training('offered'), training('started'), training('move', 1),
    { ...normal('move', 999_999, 999), assisted: true }]) free.observe(event)
  expect(normalBytes(data)).toEqual(before)
  expect(writes.every(key => key === TRAINING_2048_OBSERVATIONS_KEY)).toBe(true)
  expect(recordAccount).toHaveBeenCalledTimes(1)
})

it('uses the real engine and shared original identity through offer, continuation and a new normal game', async () => {
  const { data, options, writes } = fixture(), recordAccount = vi.fn(async () => ({ status: 'recorded' as const }))
  const free = new Free2048Experience({ ...options, measureAccountActivity: true, recordAccount })
  const session = new Unity2048Session(vi.fn(), vi.fn(), undefined, undefined, free.observe)
  free.ready(); await session.start('training-demo-0')
  for (let input = 0; input < 1000 && !session.snapshot().game_over; input++) await session.move((['left', 'up', 'right', 'down'] as const)[input % 4])
  const offered = session.snapshot().training!
  expect(offered.phase).toBe('offered')
  const personal = free.snapshot().personal, before = normalBytes(data)
  expect(personal.history[0]).toMatchObject({ practiceId: offered.sourceId, score: 1756, status: 'completed' })
  writes.length = 0
  expect(session.beginTrainingDemo(offered.sourceId)).toBe(true)
  await session.move(offered.alternativeDirections[0])
  for (let input = 0; input < 1000 && !session.snapshot().game_over; input++) await session.move((['left', 'up', 'right', 'down'] as const)[input % 4])
  expect(session.snapshot().score).toBeGreaterThan(1756)
  expect(free.snapshot().personal).toEqual(personal); expect(normalBytes(data)).toEqual(before)
  expect(recordAccount).toHaveBeenCalledTimes(1)
  expect(writes.every(key => key === TRAINING_2048_OBSERVATIONS_KEY)).toBe(true)
  const demo = JSON.parse(free.exportJson()).trainingDemonstrationObservations
  expect(demo.entries[0]).toMatchObject({ sourceId: offered.sourceId, status: 'ended' })
  expect(demo.summary.retainedValidMoves).toBeGreaterThan(0)
  await session.start('ordinary-again'); await session.move('left'); await session.move('down')
  expect(free.snapshot().personal.history).toHaveLength(2)
  expect(recordAccount).toHaveBeenCalledTimes(2)
})

it('keeps normal gameplay functional when its separate training ledger is corrupt', async () => {
  const { data, options } = fixture()
  data.set(TRAINING_2048_OBSERVATIONS_KEY, 'keep-corrupt-demo-bytes')
  const free = new Free2048Experience(options), session = new Unity2048Session(vi.fn(), vi.fn(), undefined, undefined, free.observe)
  free.ready(); await session.start('training-demo-0')
  for (let input = 0; input < 1000 && !session.snapshot().game_over; input++) await session.move((['left', 'up', 'right', 'down'] as const)[input % 4])
  expect(data.get(TRAINING_2048_OBSERVATIONS_KEY)).toBe('keep-corrupt-demo-bytes')
  expect(free.snapshot().personal.bestScore).toBe(1756)
  expect(session.beginTrainingDemo(session.snapshot().training!.sourceId)).toBe(true)
  await session.move('left')
  expect(session.snapshot().game_over).toBe(false)
  expect(free.snapshot().personal.bestScore).toBe(1756)
  expect(data.get(PERSONAL_2048_PROGRESS_KEY)).toBeDefined()
})

it('keeps a real assisted continuation usable in memory when local storage is denied', async () => {
  const free = new Free2048Experience({ category: 'observed_browser', getStorage: () => { throw new Error('blocked') } })
  const session = new Unity2048Session(vi.fn(), vi.fn(), undefined, undefined, free.observe)
  free.ready(); await session.start('training-demo-0')
  for (let input = 0; input < 1000 && !session.snapshot().game_over; input++) await session.move((['left', 'up', 'right', 'down'] as const)[input % 4])
  expect(session.beginTrainingDemo(session.snapshot().training!.sourceId)).toBe(true)
  await session.move('left')
  expect(session.snapshot().game_over).toBe(false)
  expect(free.snapshot().personal).toMatchObject({ bestScore: 1756, storageStatus: 'unavailable' })
  expect(JSON.parse(free.exportJson()).trainingDemonstrationObservations).toMatchObject({ quality: { storageStatus: 'unavailable' }, summary: { retainedStarts: 1 } })
})

it('keeps synthetic assisted observations outside the observed browser and account channel', () => {
  const { options, data } = fixture(), recordAccount = vi.fn()
  const free = new Free2048Experience({ ...options, category: 'synthetic', measureAccountActivity: true, recordAccount })
  free.observe(training('offered')); free.observe(training('started')); free.observe(training('move', 1))
  expect(recordAccount).not.toHaveBeenCalled()
  expect(data.has(TRAINING_2048_OBSERVATIONS_KEY)).toBe(false)
  expect(data.has(`${TRAINING_2048_OBSERVATIONS_KEY}.synthetic`)).toBe(true)
  expect(free.snapshot().personal.history).toEqual([])
  expect(free.snapshot().retention.daysPlayedCount).toBe(0)
})
