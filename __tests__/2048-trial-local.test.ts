import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_2048_TRIAL_LOCAL_BYTES, parse2048TrialLocalExport, TRIAL_2048_LOCAL_IMPORT_ERROR } from '@/lib/analytics/2048-trial-local'
import { Free2048Experience } from '@/lib/game/free-2048-experience'
import { Sessions2048 } from '@/lib/game/sessions-2048'
import { TicketOfferObservations } from '@/lib/games/2048/ticket-offer-observations'

const base = Date.parse('2026-10-19T15:00:00Z')
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function fixture() {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } } as Storage
  let now = base, serial = 0
  const options = { getStorage: () => storage, category: 'observed_browser' as const, now: () => now, uuid: () => id(++serial) }
  const free = new Free2048Experience(options)
  const play = (sourceId: string, moves = 1) => {
    free.observe({ type: 'start', score: 0, highestTile: 2, moves: 0, practiceId: sourceId })
    for (let move = 1; move <= moves; move++) free.observe({ type: 'move', score: move * 4, highestTile: 4, moves: move, practiceId: sourceId })
    free.observe({ type: 'end', score: moves * 4, highestTile: 4, moves, practiceId: sourceId })
  }
  free.ready()
  const json = () => JSON.parse(free.exportJson())
  return { options, free, values, play, json, setTime: (at: number) => { now = at } }
}
afterEach(() => { vi.unstubAllGlobals() })

describe('safe local 2048 trial summary', () => {
  it('recalculates retained practice activation and local return from a real Free export, ignoring supplied summaries', () => {
    const f = fixture()
    f.play(id(900), 20); f.setTime(base + 7200_000); f.play(id(901), 1)
    const exported = f.json()
    exported.observations.summary = { startedPractices: 999999, firstValidMoves: 999999, private: 'raw-secret@example.test' }
    exported.localReturn.daysPlayedCount = 999999
    exported.localReturn.d1 = { status: 'returned', matured: true, returnObserved: true }
    exported.scope = 'raw-secret@example.test'
    const result = parse2048TrialLocalExport(JSON.stringify(exported))
    expect(result.practice).toEqual([{ category: 'observed_browser', sessions: 1, started: 2, firstValidMove: 2, twentyValidMoves: 1,
      ended: 2, interrupted: 0, observedSecondPracticeWithin24h: true,
      quality: { coverage: 'local_best_effort', storageStatus: 'ready', truncated: false, observationGap: false } }])
    expect(result.localReturn).toMatchObject({ category: 'observed_browser', daysPlayed: 1,
      d1: { status: 'pending', matured: false, returnObserved: false }, d7: { status: 'pending', matured: false, returnObserved: false } })
    expect(JSON.stringify(result)).not.toContain('raw-secret')
    expect(JSON.stringify(result)).not.toContain(id(900))
    expect(JSON.stringify(result)).not.toMatch(/"(?:browserId|practiceId|score|highestTile|board|seed|userId|email|scopeFromFile|filename)"/)
    expect(result.scope).toContain('retorno orgánico')
  })
  it('separates synthetic and observed practice while excluding daily, tournament and training sessions', () => {
    const f = fixture(); f.play(id(900), 1)
    for (const [category, mode] of [['synthetic', 'practice'], ['observed_browser', 'daily'], ['observed_browser', 'training'], ['observed_browser', 'tournament']] as const) {
      const extra = new Sessions2048({ ...f.options, category, mode, build: 'unity-2048-007', rulesVersion: '2048-practice-v1' })
      extra.ready(); extra.start(`${category}-${mode}`); extra.validMove(`${category}-${mode}`, 1); extra.end(`${category}-${mode}`)
    }
    const result = parse2048TrialLocalExport(JSON.stringify(f.json()))
    expect(result.practice).toHaveLength(2)
    expect(result.practice?.map(row => [row.category, row.started, row.firstValidMove])).toEqual([
      ['observed_browser', 1, 1], ['synthetic', 1, 1],
    ])
  })
  it('counts demo training, confirmed demo applications and ticket views directly from strict ledgers', () => {
    const f = fixture(); f.play(id(900), 1)
    for (const stage of ['offered', 'started', 'move', 'ended'] as const) f.free.observe({ type: 'training', assisted: true,
      practiceId: id(900), score: 5000, highestTile: 512, moves: 100,
      training: { stage, sourceId: id(900), continuationId: stage === 'offered' ? null : id(901), validMoves: stage === 'offered' || stage === 'started' ? 0 : 1 } })
    const rewarded = (stage: 'request' | 'grant' | 'cancelled' | 'timeout' | 'error' | 'no_fill' | 'ignored_duplicate' | 'ignored_late', request: number) =>
      f.free.observeRewarded({ type: 'rewarded', mode: 'demo', sourceId: id(900 + request), requestId: id(990 + request), at: base, stage })
    rewarded('request', 1); rewarded('grant', 1); rewarded('ignored_duplicate', 1)
    for (const [request, stage] of [[2, 'cancelled'], [3, 'timeout'], [4, 'error'], [5, 'no_fill'], [6, 'ignored_late']] as const) {
      rewarded('request', request); rewarded(stage, request)
    }
    const tickets = new TicketOfferObservations(f.options)
    tickets.recordView('practice'); tickets.recordView('result'); tickets.recordView('unknown')
    const raw = f.json()
    raw.trainingDemonstrationObservations.summary = { retainedOffers: 100, retainedStarts: 100 }
    raw.rewardedDemonstrationObservations.summary = { retainedDemoApplications: 100 }
    raw.ticketOfferObservations.summary = { retainedViews: 100, bySource: { result: 100 } }
    const result = parse2048TrialLocalExport(JSON.stringify(raw))
    expect(result.training).toMatchObject({ category: 'observed_browser', offered: 1, started: 1, withValidMove: 1, validMoves: 1, ended: 1, interrupted: 0 })
    expect(result.rewardedDemo).toMatchObject({ category: 'demonstration', requests: 6, applied: 1, cancelled: 1, timeouts: 1,
      errors: 1, noFill: 1, ignoredDuplicate: 1, ignoredLate: 1 })
    expect(result.ticketOffer).toMatchObject({ category: 'observed_browser', views: 3, bySource: { practice: 1, result: 1, direct: 1 } })
    expect(JSON.stringify(result)).not.toContain('5000')
  })
  it('never turns an injected synthetic provider grant into a demo application, impression, sale or revenue', () => {
    const f = fixture()
    const synthetic = new Free2048Experience({ ...f.options, category: 'synthetic' })
    synthetic.ready(); synthetic.observeRewarded({ type: 'rewarded', mode: 'provider', at: base, stage: 'request', requestId: id(900), sourceId: id(901) })
    synthetic.observeRewarded({ type: 'rewarded', mode: 'provider', at: base, stage: 'grant', requestId: id(900), sourceId: id(901) })
    const result = parse2048TrialLocalExport(synthetic.exportJson())
    expect(result.rewardedDemo).toMatchObject({ category: 'synthetic', requests: 0, applied: 0 })
    expect(JSON.stringify(result)).not.toMatch(/"(?:impressions|providerGrants|revenue|sales|players)"/)
    expect(result.localReturn?.d1.status).toBe('unknown')
  })
  it('keeps absent older optional sections unknown, and a missing main ledger unknown rather than reporting zero use', () => {
    const f = fixture(), raw = f.json()
    for (const field of ['localReturn', 'trainingDemonstrationObservations', 'rewardedDemonstrationObservations', 'ticketOfferObservations']) delete raw[field]
    raw.observations.ledger = null
    const result = parse2048TrialLocalExport(JSON.stringify(raw))
    expect(result).toMatchObject({ practice: null, localReturn: null, training: null, rewardedDemo: null, ticketOffer: null })
  })
  it('observes a second activated practice within 24h without calling it organic, and preserves pending/incomplete uncertainty', () => {
    const f = fixture(); f.play(id(900), 1)
    expect(parse2048TrialLocalExport(JSON.stringify(f.json())).practice?.[0].observedSecondPracticeWithin24h).toBeNull()
    f.setTime(base + 86_400_000)
    expect(parse2048TrialLocalExport(JSON.stringify(f.json())).practice?.[0].observedSecondPracticeWithin24h).toBe(false)
    f.play(id(901), 1)
    expect(parse2048TrialLocalExport(JSON.stringify(f.json())).practice?.[0].observedSecondPracticeWithin24h).toBe(true)
    const incomplete = f.json(); incomplete.observations.ledger.truncated = true
    expect(parse2048TrialLocalExport(JSON.stringify(incomplete)).practice?.[0]).toMatchObject({ observedSecondPracticeWithin24h: null, quality: { coverage: 'incomplete' } })
  })
  it('recomputes D1/D7 only after the target Chile day ends, including DST dates, without trusting supplied status', () => {
    const f = fixture(), raw = f.json()
    const retention = raw.localReturn
    Object.assign(retention, { firstDay: '2026-09-05', daysPlayed: ['2026-09-05', '2026-09-06'], today: '2026-09-06', daysPlayedCount: 999,
      d1: { status: 'returned', matured: true, returnObserved: false }, d7: { status: 'returned', matured: true, returnObserved: true } })
    expect(parse2048TrialLocalExport(JSON.stringify(raw)).localReturn).toMatchObject({ daysPlayed: 2,
      d1: { status: 'pending', matured: false, returnObserved: true }, d7: { status: 'pending', matured: false, returnObserved: false } })
    retention.today = '2026-09-07'
    expect(parse2048TrialLocalExport(JSON.stringify(raw)).localReturn?.d1).toEqual({ status: 'returned', matured: true, returnObserved: true })
    retention.today = '2026-09-13'
    expect(parse2048TrialLocalExport(JSON.stringify(raw)).localReturn?.d7).toEqual({ status: 'not_returned', matured: true, returnObserved: false })
    retention.truncated = true; retention.quality.truncated = true
    expect(parse2048TrialLocalExport(JSON.stringify(raw)).localReturn?.d1.status).toBe('unknown')
  })
  it('recomputes quality conservatively and retains unknown coverage if quality evidence is absent', () => {
    const f = fixture(), raw = f.json()
    raw.ticketOfferObservations.truncated = true; raw.ticketOfferObservations.quality.truncated = true
    raw.ticketOfferObservations.quality.coverage = 'local_best_effort'
    expect(parse2048TrialLocalExport(JSON.stringify(raw)).ticketOffer?.quality.coverage).toBe('incomplete')
    delete raw.trainingDemonstrationObservations.quality
    expect(parse2048TrialLocalExport(JSON.stringify(raw)).training?.quality).toMatchObject({ storageStatus: 'unknown', coverage: 'unknown' })
  })
  it('rejects malformed, duplicate, oversized and unknown-version records with only a fixed sanitized error', () => {
    const f = fixture(); f.play(id(900), 1)
    const mutate = (change: (value: ReturnType<typeof f.json>) => void) => { const value = f.json(); change(value); return JSON.stringify(value) }
    const invalid = ['{"private@example.test":', '[]', 'null',
      mutate(value => { value.version = 2 }), mutate(value => { value.observations.version = 2 }),
      mutate(value => { value.personalProgress.version = 2 }), mutate(value => { value.observations.ledger.version = 2 }),
      mutate(value => { value.observations.ledger.practices.push(value.observations.ledger.practices[0]) }),
      mutate(value => { value.trainingDemonstrationObservations.version = 2 }),
      mutate(value => { value.rewardedDemonstrationObservations.version = 2 }),
      mutate(value => { value.ticketOfferObservations.version = 2 }),
      mutate(value => { value.localReturn.version = 2 }),
      mutate(value => { value.localReturn.daysPlayed = ['2026-02-30']; value.localReturn.firstDay = '2026-02-30' }),
      mutate(value => { value.ticketOfferObservations.views = [{ id: id(1), source: 'result', at: -1 }] }),
      mutate(value => { value.trainingDemonstrationObservations.quality.storageStatus = 'private@example.test' }),
      mutate(value => { value.filename = 'personal-private@example.test.json' }),
      ' '.repeat(MAX_2048_TRIAL_LOCAL_BYTES + 1),
      JSON.stringify({ ...f.json(), scope: 'é'.repeat(1_300_000) }),
    ]
    for (const raw of invalid) {
      expect(() => parse2048TrialLocalExport(raw)).toThrowError(TRIAL_2048_LOCAL_IMPORT_ERROR)
      try { parse2048TrialLocalExport(raw) } catch (error) { expect((error as Error).message).toBe(TRIAL_2048_LOCAL_IMPORT_ERROR) }
    }
  })
  it('is pure and returns only one file summary, replacing rather than merging browsers implicitly', () => {
    const first = fixture(); first.play(id(900), 20)
    const second = fixture(); second.play(id(901), 1)
    const firstRaw = JSON.stringify(first.json()), secondRaw = JSON.stringify(second.json())
    const fetcher = vi.fn(() => { throw new Error('network forbidden') })
    vi.stubGlobal('fetch', fetcher)
    vi.stubGlobal('localStorage', new Proxy({}, { get: () => { throw new Error('storage forbidden') } }))
    const one = parse2048TrialLocalExport(firstRaw), two = parse2048TrialLocalExport(secondRaw)
    expect(one.practice?.[0].twentyValidMoves).toBe(1); expect(two.practice?.[0].twentyValidMoves).toBe(0)
    expect(two.practice?.[0].started).toBe(1)
    expect(parse2048TrialLocalExport(firstRaw)).toEqual(one)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
