import { describe, expect, it, vi } from 'vitest'
import { MAX_REWARDED_OBSERVATION_EVENTS, MAX_REWARDED_OBSERVATION_REQUESTS, REWARDED_OBSERVATIONS_STORAGE_KEY,
  RewardedObservations, readRewardedObservations, type RewardedObservationEvent } from '@/lib/ads/rewarded-observations'
import { Free2048Experience } from '@/lib/game/free-2048-experience'
import { getDaily2048Challenge } from '@/lib/game/daily-2048'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const at = Date.parse('2026-10-19T15:00:00Z')
const event = (stage: RewardedObservationEvent['stage'], patch: Partial<RewardedObservationEvent> = {}): RewardedObservationEvent => ({
  type: 'rewarded', stage, requestId: id(1), sourceId: id(2), mode: 'demo', at, ...patch,
})
function fixture(category: 'demonstration' | 'synthetic' = 'demonstration') {
  const data = new Map<string, string>(), writes: string[] = []
  const storage = { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); writes.push(key) } } as Storage
  const options = { category, getStorage: () => storage }
  return { data, writes, storage, options }
}

describe('separate local rewarded demonstration observations', () => {
  it('records controller availability/request/application without claiming displayed offers, ads or revenue', () => {
    const { options, data } = fixture(), ledger = new RewardedObservations(options)
    ledger.observe(event('availability')); ledger.observe(event('request')); ledger.observe(event('grant'))
    const result = ledger.snapshot()
    expect(result.summary).toMatchObject({ retainedAvailabilityEvaluations: 1, retainedRequests: 1, retainedDemoApplications: 1 })
    expect(result.scope).toMatch(/Availability es evaluación.*no prueba de oferta mostrada/)
    expect(result.scope).toMatch(/no impresiones.*ingresos.*retención comercial/)
    expect(result.quality).toMatchObject({ storageStatus: 'ready', coverage: 'local_best_effort' })
    expect(new RewardedObservations(options).snapshot()).toEqual(result)
    expect(readRewardedObservations(data.get(REWARDED_OBSERVATIONS_STORAGE_KEY)!)).not.toBeNull()
    expect(JSON.stringify(result)).not.toMatch(/"(?:board|score|seed|rng|userId|accountId|email|cookies|impressions|income|revenue|providerPayload)"/)
  })
  it('records duplicate callbacks as ignored and never counts a second applied benefit', () => {
    const { options } = fixture(), ledger = new RewardedObservations(options)
    ledger.observe(event('request')); ledger.observe(event('grant'))
    expect(ledger.observe(event('grant'))).toBe(true)
    expect(ledger.observe(event('grant'))).toBe(false)
    expect(ledger.observe(event('ignored_duplicate', { code: 'duplicate', at: at + 1 }))).toBe(true)
    expect(ledger.snapshot().summary).toMatchObject({ retainedDemoApplications: 1, retainedIgnoredDuplicateEvents: 2 })
    expect(ledger.snapshot().events.filter(row => row.stage === 'grant')).toHaveLength(1)
  })
  it('records a late callback after timeout as ignored instead of an application', () => {
    const { options } = fixture(), ledger = new RewardedObservations(options)
    ledger.observe(event('request')); ledger.observe(event('timeout', { code: 'timeout' }))
    ledger.observe(event('grant', { at: at + 1 }))
    expect(ledger.snapshot().summary).toMatchObject({ retainedDemoApplications: 0, retainedTimeouts: 1, retainedIgnoredLateEvents: 1 })
    expect(ledger.snapshot().events.at(-1)).toMatchObject({ stage: 'ignored_late', code: 'late' })
  })
  it('keeps a busy evaluation from cancelling the pending request in observation history', () => {
    const { options } = fixture(), ledger = new RewardedObservations(options)
    ledger.observe(event('request')); ledger.observe(event('rejected', { code: 'busy' })); ledger.observe(event('grant'))
    expect(ledger.snapshot().summary).toMatchObject({ retainedDemoApplications: 1, retainedRejections: 1, retainedIgnoredLateEvents: 0 })
  })
  it('records failure/closure paths and explicit ignored callbacks without creating any applications', () => {
    const { options } = fixture(), ledger = new RewardedObservations(options)
    const outcomes = ['rejected', 'closed', 'no_fill', 'error', 'cancelled', 'invalidated', 'ignored_duplicate', 'ignored_late'] as const
    outcomes.forEach((stage, index) => ledger.observe(event(stage, { requestId: id(10 + index),
      code: stage === 'error' ? 'provider_error' : stage === 'rejected' ? 'grant_rejected' : stage === 'ignored_duplicate' ? 'duplicate' : stage === 'ignored_late' ? 'late' : stage })))
    expect(ledger.snapshot().summary).toMatchObject({ retainedDemoApplications: 0, retainedRejections: 1, retainedClosedEvents: 1,
      retainedNoFillEvents: 1, retainedErrors: 1, retainedCancellations: 1, retainedInvalidations: 1, retainedIgnoredDuplicateEvents: 1, retainedIgnoredLateEvents: 1 })
  })
  it('does not rebind a request to another source', () => {
    const { options } = fixture(), ledger = new RewardedObservations(options)
    ledger.observe(event('request'))
    expect(ledger.observe(event('grant', { sourceId: id(3) }))).toBe(false)
    expect(ledger.snapshot()).toMatchObject({ observationGap: true, quality: { coverage: 'unknown' }, summary: { retainedDemoApplications: 0 } })
  })
  it('excludes real provider grants from a public demo ledger and separates synthetic provider tests', () => {
    const { data, options } = fixture(), demo = new RewardedObservations(options)
    demo.observe(event('rejected', { mode: 'provider', requestId: null, sourceId: null, code: 'provider_not_configured' }))
    expect(demo.observe(event('grant', { mode: 'provider' }))).toBe(false)
    const synthetic = new RewardedObservations({ ...options, category: 'synthetic' })
    synthetic.observe(event('request', { mode: 'provider' })); synthetic.observe(event('grant', { mode: 'provider' }))
    expect(synthetic.snapshot().category).toBe('synthetic')
    expect(synthetic.snapshot().summary.retainedDemoApplications).toBe(0)
    expect(data.has(`${REWARDED_OBSERVATIONS_STORAGE_KEY}.synthetic`)).toBe(true)
    expect(demo.snapshot().events).toHaveLength(1)
  })
  it('bounds retained requests and events, exposing incomplete coverage', () => {
    const { options } = fixture(), ledger = new RewardedObservations(options)
    for (let count = 1; count <= MAX_REWARDED_OBSERVATION_REQUESTS + 1; count++) ledger.observe(event('request', { requestId: id(count), at: at + count }))
    expect(ledger.snapshot().summary.retainedRequests).toBe(MAX_REWARDED_OBSERVATION_REQUESTS)
    for (let count = 0; count <= MAX_REWARDED_OBSERVATION_EVENTS; count++) ledger.observe(event('availability', { requestId: null, sourceId: null, at: at + 1000 + count }))
    expect(ledger.snapshot().events).toHaveLength(MAX_REWARDED_OBSERVATION_EVENTS)
    expect(ledger.snapshot()).toMatchObject({ truncated: true, quality: { coverage: 'unknown' } })
  })
  it.each(['not-json', JSON.stringify({ version: 1, cookie: 'private' })])('preserves corrupt stored bytes while observing only in memory', raw => {
    const { options, data, writes } = fixture()
    data.set(REWARDED_OBSERVATIONS_STORAGE_KEY, raw)
    const ledger = new RewardedObservations(options)
    ledger.observe(event('request')); ledger.observe(event('grant'))
    expect(ledger.snapshot()).toMatchObject({ quality: { storageStatus: 'corrupt', coverage: 'unknown' }, summary: { retainedDemoApplications: 1 } })
    expect(data.get(REWARDED_OBSERVATIONS_STORAGE_KEY)).toBe(raw); expect(writes).toEqual([])
  })
  it('rejects arbitrary provider fields, unbounded codes, invalid identifiers/times and tampered stored duplicates', () => {
    const { options, data } = fixture(), ledger = new RewardedObservations(options)
    for (const patch of [{ providerPayload: { secret: 'private' } }, { code: 'private arbitrary details' }, { sourceId: 'account@email.test' }, { at: Infinity }, { at: at + 0.5 }]) {
      expect(ledger.observe({ ...event('request'), ...patch })).toBe(false)
    }
    expect(data.size).toBe(0)
    ledger.observe(event('request')); ledger.observe(event('grant'))
    const raw = JSON.parse(data.get(REWARDED_OBSERVATIONS_STORAGE_KEY)!)
    raw.events.push(event('grant', { at: at - 1 }))
    expect(readRewardedObservations(JSON.stringify(raw))).toBeNull()
  })
  it('observes storage denial without throwing into gameplay and labels clock rollback as incomplete', () => {
    for (const getStorage of [() => { throw new Error('denied') }, () => ({ getItem: () => null, setItem: () => { throw new Error('quota') } })]) {
      const ledger = new RewardedObservations({ category: 'demonstration', getStorage })
      expect(() => { ledger.observe(event('request')); ledger.observe(event('grant', { at: at - 1 })) }).not.toThrow()
      expect(ledger.snapshot()).toMatchObject({ observationGap: true, quality: { storageStatus: 'unavailable', coverage: 'unknown' }, summary: { retainedDemoApplications: 1 } })
    }
  })
  it('merges sequential local observers without losing independent requests', () => {
    const { options } = fixture(), first = new RewardedObservations(options), second = new RewardedObservations(options)
    first.observe(event('request')); second.observe(event('request', { requestId: id(3), sourceId: id(4) }))
    first.observe(event('grant')); second.observe(event('grant', { requestId: id(3), sourceId: id(4) }))
    expect(first.snapshot().summary).toMatchObject({ retainedRequests: 2, retainedDemoApplications: 2 })
  })
})

describe('Free2048Experience rewarded observer isolation', () => {
  it('writes only the rewarded key and does not expire daily state, alter normal progress or send account activity', async () => {
    const { storage, data, writes } = fixture()
    let now = at, serial = 100
    const recordAccount = vi.fn(async () => ({ status: 'recorded' as const })), changed = vi.fn()
    const free = new Free2048Experience({ getStorage: () => storage, category: 'observed_browser', now: () => now,
      uuid: () => id(++serial), measureAccountActivity: true, recordAccount, changed })
    free.ready(); free.observe({ type: 'start', score: 0, highestTile: 2, moves: 0, practiceId: id(2) })
    free.observe({ type: 'move', score: 64, highestTile: 16, moves: 1, practiceId: id(2) })
    free.observe({ type: 'end', score: 64, highestTile: 16, moves: 1, practiceId: id(2) })
    const challenge = getDaily2048Challenge(now)
    free.selectNext('daily', challenge); free.observe({ type: 'start', score: 0, highestTile: 2, moves: 0, practiceId: id(5) })
    free.observe({ type: 'move', score: 4, highestTile: 4, moves: 1, practiceId: id(5) })
    await Promise.resolve()
    const before = new Map(data); writes.length = 0; changed.mockClear()
    now = challenge.closesAt + 1
    for (const row of [event('availability'), event('request'), event('timeout', { code: 'timeout' }), event('ignored_late', { code: 'late' })]) free.observeRewarded(row)
    expect(new Map([...data].filter(([key]) => key !== REWARDED_OBSERVATIONS_STORAGE_KEY))).toEqual(before)
    expect(writes.every(key => key === REWARDED_OBSERVATIONS_STORAGE_KEY)).toBe(true)
    expect(recordAccount).toHaveBeenCalledTimes(2); expect(changed).not.toHaveBeenCalled()
    const exported = JSON.parse(free.exportJson())
    expect(exported.rewardedDemonstrationObservations.summary).toMatchObject({ retainedRequests: 1, retainedDemoApplications: 0, retainedTimeouts: 1, retainedIgnoredLateEvents: 1 })
    expect(exported.personalProgress.bestScore).toBe(64)
    expect(exported.localReturn.daysPlayedCount).toBe(1)
  })
  it('never creates qualified play, account calls or observed-category data from synthetic rewarded events alone', () => {
    const { storage, data } = fixture(), recordAccount = vi.fn()
    const free = new Free2048Experience({ getStorage: () => storage, category: 'synthetic', recordAccount, measureAccountActivity: true })
    free.observeRewarded(event('request')); free.observeRewarded(event('grant'))
    expect(recordAccount).not.toHaveBeenCalled()
    expect(free.snapshot().retention.daysPlayedCount).toBe(0); expect(free.snapshot().personal.history).toEqual([])
    expect(data.has(REWARDED_OBSERVATIONS_STORAGE_KEY)).toBe(false)
    expect(JSON.parse(free.exportJson()).rewardedDemonstrationObservations).toMatchObject({ category: 'synthetic', summary: { retainedDemoApplications: 1 } })
  })
})
