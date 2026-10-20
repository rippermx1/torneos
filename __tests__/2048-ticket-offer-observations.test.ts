import { describe, expect, it, vi } from 'vitest'
import { MAX_TICKET_OFFER_VIEWS, normalizeTicketOfferSource, readTicketOfferObservations,
  TicketOfferObservations, TICKET_OFFER_OBSERVATIONS_KEY } from '@/lib/games/2048/ticket-offer-observations'
import { Free2048Experience } from '@/lib/game/free-2048-experience'
import { getDaily2048Challenge } from '@/lib/game/daily-2048'

const at = Date.parse('2026-10-19T15:00:00Z')
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function fixture() {
  const data = new Map<string, string>(), writes: string[] = []
  const storage = { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, raw: string) => { writes.push(key); data.set(key, raw) } } as Storage
  let serial = 0, now = at
  const options = { getStorage: () => storage, category: 'observed_browser' as const, now: () => now, uuid: () => id(++serial) }
  return { data, writes, storage, options, setTime: (value: number) => { now = value } }
}
const exported = (free: Free2048Experience) => JSON.parse(free.exportJson())

describe('local ticket information observations', () => {
  it('stores only a view identity, normalized source and UTC time, with truthful retained counts', () => {
    const { options, data } = fixture(), ledger = new TicketOfferObservations(options)
    expect(data.size).toBe(0)
    ledger.recordView('practice'); ledger.recordView('result'); ledger.recordView('https://private.test?email=personal')
    const result = ledger.snapshot()
    expect(result.summary).toEqual({ retainedViews: 3, bySource: { practice: 1, result: 1, direct: 1 } })
    expect(result.quality).toEqual({ storageStatus: 'ready', coverage: 'local_best_effort', truncated: false, observationGap: false })
    expect(result.scope).toMatch(/No son personas únicas/)
    expect(result.views[0]).toEqual({ id: id(1), source: 'practice', at })
    expect(new TicketOfferObservations(options).snapshot()).toEqual(result)
    const raw = data.get(TICKET_OFFER_OBSERVATIONS_KEY)!
    expect(raw).not.toMatch(/email|private|score|board|seed|account|cookie|signup|payment|grant/)
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['capturedAt', 'category', 'observationGap', 'truncated', 'version', 'views'])
  })
  it('normalizes absent, array and arbitrary query values to direct without storing their contents', () => {
    expect(normalizeTicketOfferSource('practice')).toBe('practice')
    expect(normalizeTicketOfferSource('result')).toBe('result')
    for (const value of [undefined, null, '', 'direct', 'Practice', ['practice'], { from: 'result' }, 'account@private.test', '//outside.test']) {
      expect(normalizeTicketOfferSource(value)).toBe('direct')
    }
  })
  it('keeps observed and synthetic visits in different keys without changing either category', () => {
    const { options, data } = fixture(), observed = new TicketOfferObservations(options)
    const synthetic = new TicketOfferObservations({ ...options, category: 'synthetic' })
    observed.recordView('practice'); synthetic.recordView('result')
    expect(data.size).toBe(2)
    expect(observed.snapshot()).toMatchObject({ category: 'observed_browser', summary: { retainedViews: 1, bySource: { practice: 1, result: 0 } } })
    expect(synthetic.snapshot()).toMatchObject({ category: 'synthetic', summary: { retainedViews: 1, bySource: { result: 1, practice: 0 } } })
    expect(data.has(`${TICKET_OFFER_OBSERVATIONS_KEY}.synthetic`)).toBe(true)
  })
  it('bounds retained views and exposes unknown coverage, without resurrecting pruned views from an old observer', () => {
    const { options } = fixture(), older = new TicketOfferObservations(options), newer = new TicketOfferObservations(options)
    for (let n = 0; n < MAX_TICKET_OFFER_VIEWS; n++) older.recordView('practice')
    newer.recordView('result')
    expect(older.snapshot()).toMatchObject({ truncated: true, quality: { coverage: 'unknown' },
      summary: { retainedViews: MAX_TICKET_OFFER_VIEWS, bySource: { practice: MAX_TICKET_OFFER_VIEWS - 1, result: 1 } } })
    expect(older.snapshot().views.some(view => view.id === id(1))).toBe(false)
    expect(newer.snapshot().views.map(view => view.id)).toEqual(older.snapshot().views.map(view => view.id))
  })
  it('reads fresh observations from other sequential mounts before recording another view', () => {
    const { options } = fixture(), first = new TicketOfferObservations(options), second = new TicketOfferObservations(options)
    first.recordView('practice'); second.recordView('result'); first.recordView(null)
    expect(second.snapshot().summary).toEqual({ retainedViews: 3, bySource: { practice: 1, result: 1, direct: 1 } })
  })
  it.each(['invalid-json', JSON.stringify({ version: 1, email: 'private' }), ' '.repeat(65_537)])('fails closed on malformed stored bytes without overwriting or inventing a view', raw => {
    const { options, data, writes } = fixture()
    data.set(TICKET_OFFER_OBSERVATIONS_KEY, raw)
    const ledger = new TicketOfferObservations(options)
    expect(ledger.recordView('practice')).toBe(false)
    expect(ledger.snapshot()).toMatchObject({ quality: { storageStatus: 'corrupt', coverage: 'unknown' }, summary: { retainedViews: 0 } })
    expect(data.get(TICKET_OFFER_OBSERVATIONS_KEY)).toBe(raw); expect(writes).toEqual([])
  })
  it('rejects unknown fields, duplicate IDs, invalid timestamps, categories and over-bound data as a whole', () => {
    const { options, data } = fixture(), ledger = new TicketOfferObservations(options)
    ledger.recordView('practice')
    const valid = JSON.parse(data.get(TICKET_OFFER_OBSERVATIONS_KEY)!)
    const invalid = [
      { ...valid, userId: 'private' }, { ...valid, category: 'other' }, { ...valid, capturedAt: -1 },
      { ...valid, views: [{ ...valid.views[0], score: 123 }] }, { ...valid, views: [valid.views[0], valid.views[0]] },
      { ...valid, views: [{ ...valid.views[0], at: at + 1 }] }, { ...valid, views: [{ ...valid.views[0], source: 'checkout' }] },
      { ...valid, views: [{ ...valid.views[0], id: 'user@email.test' }] },
      { ...valid, views: Array.from({ length: MAX_TICKET_OFFER_VIEWS + 1 }, (_, n) => ({ id: id(n + 1), source: 'direct', at })) },
    ]
    expect(readTicketOfferObservations(JSON.stringify(valid))).not.toBeNull()
    for (const value of invalid) expect(readTicketOfferObservations(JSON.stringify(value))).toBeNull()
  })
  it('blocks on a valid ledger stored under the wrong category rather than adopting its views', () => {
    const { options, data } = fixture()
    new TicketOfferObservations({ ...options, category: 'synthetic' }).recordView('result')
    const raw = data.get(`${TICKET_OFFER_OBSERVATIONS_KEY}.synthetic`)!
    data.set(TICKET_OFFER_OBSERVATIONS_KEY, raw)
    const observed = new TicketOfferObservations(options)
    expect(observed.recordView('practice')).toBe(false)
    expect(observed.snapshot()).toMatchObject({ category: 'observed_browser', quality: { storageStatus: 'corrupt' }, summary: { retainedViews: 0 } })
    expect(data.get(TICKET_OFFER_OBSERVATIONS_KEY)).toBe(raw)
  })
  it('tolerates denied storage, blocked writes and unsuccessful verification without throwing or counting a false view', () => {
    for (const getStorage of [() => null, () => { throw new Error('denied') },
      () => ({ getItem: () => null, setItem: () => { throw new Error('quota') } }),
      () => ({ getItem: () => null, setItem: () => {} })]) {
      const ledger = new TicketOfferObservations({ getStorage, category: 'observed_browser', now: () => at, uuid: () => id(1) })
      expect(() => ledger.recordView('practice')).not.toThrow()
      expect(ledger.recordView('practice')).toBe(false)
      expect(ledger.snapshot()).toMatchObject({ quality: { storageStatus: 'unavailable', coverage: 'unknown' }, summary: { retainedViews: 0 } })
    }
  })
  it('rejects broken identities and dates, marks clock rollback and duplicate view IDs without doubling counts', () => {
    const { options, setTime } = fixture()
    for (const patch of [{ now: () => Infinity }, { now: () => at + 0.1 }, { uuid: () => 'invalid' }]) {
      const invalid = new TicketOfferObservations({ ...options, ...patch })
      expect(invalid.recordView('practice')).toBe(false)
      expect(invalid.snapshot()).toMatchObject({ observationGap: true, summary: { retainedViews: 0 } })
    }
    const ledger = new TicketOfferObservations(options)
    ledger.recordView('practice'); setTime(at - 1); ledger.recordView('result')
    expect(ledger.snapshot()).toMatchObject({ observationGap: true, quality: { coverage: 'unknown' }, summary: { retainedViews: 2 } })
    const repeated = new TicketOfferObservations({ ...options, uuid: () => id(999) })
    repeated.recordView('practice'); expect(repeated.recordView('result')).toBe(false)
    expect(repeated.snapshot().summary.retainedViews).toBe(3)
  })
})

describe('ticket observations isolated from all 2048 progress', () => {
  it('writes only its key even after daily expiry; export adds only a separate section and never sends account activity', async () => {
    const { options, data, writes, setTime } = fixture()
    const recordAccount = vi.fn(async () => ({ status: 'recorded' as const })), changed = vi.fn()
    const free = new Free2048Experience({ ...options, measureAccountActivity: true, recordAccount, changed })
    free.ready(); free.observe({ type: 'start', score: 0, highestTile: 2, moves: 0, practiceId: id(900) })
    free.observe({ type: 'move', score: 64, highestTile: 16, moves: 1, practiceId: id(900) })
    free.observe({ type: 'end', score: 64, highestTile: 16, moves: 1, practiceId: id(900) })
    free.observe({ type: 'training', assisted: true, practiceId: id(900), score: 999, highestTile: 128, moves: 9,
      training: { stage: 'offered', sourceId: id(900), continuationId: null, validMoves: 0 } })
    free.observeRewarded({ type: 'rewarded', mode: 'demo', stage: 'request', at, requestId: id(901), sourceId: id(900) })
    const challenge = getDaily2048Challenge(at)
    free.selectNext('daily', challenge); free.observe({ type: 'start', score: 0, highestTile: 2, moves: 0, practiceId: id(902) })
    free.observe({ type: 'move', score: 4, highestTile: 4, moves: 1, practiceId: id(902) })
    await Promise.resolve()
    const before = new Map(data)
    writes.length = 0; changed.mockClear(); setTime(challenge.closesAt + 1)
    const tickets = new TicketOfferObservations(options)
    tickets.recordView('result'); tickets.recordView('practice')
    expect(new Map([...data].filter(([key]) => key !== TICKET_OFFER_OBSERVATIONS_KEY))).toEqual(before)
    expect(writes).toEqual([TICKET_OFFER_OBSERVATIONS_KEY, TICKET_OFFER_OBSERVATIONS_KEY])
    expect(recordAccount).toHaveBeenCalledTimes(2); expect(changed).not.toHaveBeenCalled()
    setTime(at)
    const ticketWritesBeforeExport = writes.filter(key => key === TICKET_OFFER_OBSERVATIONS_KEY).length
    const result = exported(free)
    expect(result.ticketOfferObservations.summary).toEqual({ retainedViews: 2, bySource: { practice: 1, result: 1, direct: 0 } })
    expect(result.personalProgress.bestScore).toBe(64)
    expect(result.localReturn.daysPlayedCount).toBe(1)
    expect(result.trainingDemonstrationObservations.entries).toHaveLength(1)
    expect(result.rewardedDemonstrationObservations.summary.retainedRequests).toBe(1)
    expect(writes.filter(key => key === TICKET_OFFER_OBSERVATIONS_KEY)).toHaveLength(ticketWritesBeforeExport)
  })
  it('synthetic information visits alone do not create play, records, retention or account calls', () => {
    const { options, data } = fixture(), recordAccount = vi.fn()
    new TicketOfferObservations({ ...options, category: 'synthetic' }).recordView('practice')
    expect([...data.keys()]).toEqual([`${TICKET_OFFER_OBSERVATIONS_KEY}.synthetic`])
    const free = new Free2048Experience({ ...options, category: 'synthetic', recordAccount, measureAccountActivity: true })
    const result = exported(free)
    expect(result.personalProgress.history).toEqual([]); expect(result.localReturn.daysPlayedCount).toBe(0)
    expect(result.ticketOfferObservations).toMatchObject({ category: 'synthetic', summary: { retainedViews: 1 } })
    expect(result.rewardedDemonstrationObservations.summary.retainedDemoApplications).toBe(0)
    expect(recordAccount).not.toHaveBeenCalled()
  })
})
