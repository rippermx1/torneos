import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_2048_RETENTION_DAYS, RETENTION_2048_STORAGE_KEY, Retention2048,
  reportPlayer2048Activity, type Retention2048Mode } from '../lib/game/retention-2048'

function fixture(at = '2026-10-15T15:00:00.000Z') {
  const data = new Map<string, string>()
  let now = Date.parse(at), writes = 0
  const storage = { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { writes++; data.set(key, value) } }
  const options = { getStorage: () => storage, category: 'observed_browser' as const, now: () => now }
  return { data, storage, options, create: () => new Retention2048(options), writes: () => writes,
    at: (value: string) => { now = Date.parse(value) } }
}

describe('qualified local 2048 play days', () => {
  it('does not qualify a page/ready/snapshot, unsupported mode, tournament or training', () => {
    const f = fixture(), retention = f.create()
    expect(retention.snapshot()).toMatchObject({ daysPlayed: [], firstDay: null, lastDay: null,
      d1: { status: 'unknown' }, d7: { status: 'unknown' } })
    for (const mode of ['ready', 'tournament', 'training']) retention.recordPlay(mode as Retention2048Mode)
    expect(f.writes()).toBe(0)
    expect(f.data.size).toBe(0)
  })

  it('counts one Santiago day for multiple qualified practices and daily challenges', () => {
    const f = fixture(), retention = f.create()
    retention.recordPlay('practice'); retention.recordPlay('daily'); retention.recordPlay('practice')
    expect(retention.snapshot()).toMatchObject({ firstDay: '2026-10-15', lastDay: '2026-10-15',
      daysPlayed: ['2026-10-15'], daysPlayedCount: 1, quality: { coverage: 'local_best_effort' } })
    expect(f.writes()).toBe(1)
    expect(f.data.get(RETENTION_2048_STORAGE_KEY)).not.toMatch(/browserId|userId|seed|score|board/)
  })

  it('uses Chile midnight rather than UTC and matures D1 only after the target day ends', () => {
    const f = fixture('2026-10-15T02:59:59.999Z'), retention = f.create()
    retention.recordPlay('practice')
    expect(retention.snapshot().firstDay).toBe('2026-10-14')
    f.at('2026-10-15T03:00:00.000Z')
    expect(retention.recordPlay('daily').d1).toEqual({ targetDay: '2026-10-15', matured: false, returnObserved: true, status: 'pending' })
    f.at('2026-10-16T02:59:59.999Z')
    expect(retention.snapshot().d1.status).toBe('pending')
    f.at('2026-10-16T03:00:00.000Z')
    expect(retention.snapshot().d1).toMatchObject({ status: 'returned', matured: true, returnObserved: true })
  })

  it('waits through the repeated final hour of Chile autumn, a 25 hour target day', () => {
    const f = fixture('2026-04-03T15:00:00.000Z'), retention = f.create()
    retention.recordPlay('practice')
    f.at('2026-04-04T15:00:00.000Z'); retention.recordPlay('daily')
    f.at('2026-04-05T03:59:59.999Z')
    expect(retention.snapshot()).toMatchObject({ today: '2026-04-04', d1: { status: 'pending', returnObserved: true } })
    f.at('2026-04-05T04:00:00.000Z')
    expect(retention.snapshot()).toMatchObject({ today: '2026-04-05', d1: { status: 'returned', matured: true } })
  })

  it('handles the skipped midnight of Chile spring and a calendar D7 across that shift', () => {
    const f = fixture('2026-09-05T15:00:00.000Z'), retention = f.create()
    retention.recordPlay('practice')
    f.at('2026-09-06T03:59:59.999Z')
    expect(retention.snapshot().today).toBe('2026-09-05')
    f.at('2026-09-06T04:00:00.000Z'); retention.recordPlay('daily')
    f.at('2026-09-07T02:59:59.999Z')
    expect(retention.snapshot().d1.status).toBe('pending')
    f.at('2026-09-07T03:00:00.000Z')
    expect(retention.snapshot().d1.status).toBe('returned')
    f.at('2026-09-12T15:00:00.000Z'); retention.recordPlay('practice')
    expect(retention.snapshot().d7).toEqual({ targetDay: '2026-09-12', matured: false, returnObserved: true, status: 'pending' })
    f.at('2026-09-13T03:00:00.000Z')
    expect(retention.snapshot().d7).toMatchObject({ status: 'returned', matured: true })
  })

  it('keeps gaps absent and reports a matured nonreturn only within intact local evidence', () => {
    const f = fixture(), retention = f.create()
    retention.recordPlay('practice')
    f.at('2026-10-23T03:00:00.000Z')
    expect(retention.snapshot()).toMatchObject({ daysPlayed: ['2026-10-15'],
      d1: { targetDay: '2026-10-16', status: 'not_returned', matured: true },
      d7: { targetDay: '2026-10-22', status: 'not_returned', matured: true } })
    expect(retention.snapshot().scope).toContain('no jugadores ni retención global')
    expect(f.writes()).toBe(1)
  })

  it('merges sequential writes from separately hydrated tabs and returns detached snapshots', () => {
    const f = fixture(), first = f.create(), second = f.create()
    first.recordPlay('practice')
    f.at('2026-10-16T15:00:00.000Z'); second.recordPlay('daily')
    first.recordPlay('practice')
    const snapshot = first.snapshot()
    expect(snapshot.daysPlayed).toEqual(['2026-10-15', '2026-10-16'])
    expect(snapshot.firstDay).toBe('2026-10-15')
    snapshot.daysPlayed.pop()
    expect(f.create().snapshot().daysPlayed).toHaveLength(2)
    expect(first.snapshot().daysPlayed).toHaveLength(2)
  })

  it('retains at most 180 played dates, preserves the original anchor and marks retention unknown', () => {
    const f = fixture('2026-01-01T15:00:00.000Z'), retention = f.create()
    for (let index = 0; index <= MAX_2048_RETENTION_DAYS; index++) {
      f.at(new Date(Date.UTC(2026, 0, 1 + index, 15)).toISOString())
      retention.recordPlay('practice')
    }
    const snapshot = f.create().snapshot()
    expect(snapshot.daysPlayed).toHaveLength(180)
    expect(snapshot.firstDay).toBe('2026-01-01')
    expect(snapshot.daysPlayed[0]).toBe('2026-01-02')
    expect(snapshot.quality).toMatchObject({ truncated: true, coverage: 'unknown' })
    expect(snapshot.d1.status).toBe('unknown')
    expect(snapshot.d7.status).toBe('unknown')
  })

  it('keeps synthetic days separate and never calls them observed retention', () => {
    const f = fixture(), synthetic = new Retention2048({ ...f.options, category: 'synthetic' })
    synthetic.recordPlay('practice')
    expect(f.data.has(`${RETENTION_2048_STORAGE_KEY}.synthetic`)).toBe(true)
    expect(f.data.has(RETENTION_2048_STORAGE_KEY)).toBe(false)
    f.at('2026-10-17T15:00:00.000Z')
    expect(synthetic.snapshot().d1.status).toBe('unknown')
    expect(f.create().snapshot().daysPlayed).toEqual([])
  })

  it('continues in memory with unknown retention when storage access, reads or writes fail', () => {
    const getters = [() => null, () => { throw new Error('denied') },
      () => ({ getItem: () => { throw new Error('read denied') }, setItem: () => {} }),
      () => ({ getItem: () => null, setItem: () => { throw new Error('quota') } })]
    for (const getStorage of getters) {
      const retention = new Retention2048({ getStorage, category: 'observed_browser', now: () => Date.parse('2026-10-15T15:00:00.000Z') })
      expect(retention.recordPlay('practice')).toMatchObject({ daysPlayed: ['2026-10-15'],
        quality: { storageStatus: 'unavailable', coverage: 'unknown' }, d1: { status: 'unknown' } })
    }
  })

  it.each(['{broken', JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, category: 'observed_browser',
    firstDay: '2026-02-30', daysPlayed: ['2026-02-30'], truncated: false, observationGap: false })])(
    'preserves corrupt bytes without inventing measured nonreturns: %s', raw => {
      const f = fixture(); f.data.set(RETENTION_2048_STORAGE_KEY, raw)
      const retention = f.create()
      retention.recordPlay('practice'); f.at('2026-10-30T15:00:00.000Z')
      expect(retention.snapshot()).toMatchObject({ quality: { storageStatus: 'corrupt', coverage: 'unknown' },
        d1: { status: 'unknown' }, d7: { status: 'unknown' } })
      expect(f.data.get(RETENTION_2048_STORAGE_KEY)).toBe(raw)
      expect(f.writes()).toBe(0)
    })

  it('does not backfill a rolled-back local date and persists the observation gap', () => {
    const f = fixture(), retention = f.create()
    retention.recordPlay('practice'); f.at('2026-10-14T15:00:00.000Z')
    expect(retention.recordPlay('daily')).toMatchObject({ daysPlayed: ['2026-10-15'], quality: { observationGap: true } })
    f.at('2026-10-20T15:00:00.000Z')
    expect(f.create().snapshot().d1.status).toBe('unknown')
  })

  it('marks lost storage as a gap within a live session without silently zeroing known days', () => {
    const f = fixture(), retention = f.create()
    retention.recordPlay('practice'); f.data.delete(RETENTION_2048_STORAGE_KEY)
    expect(retention.snapshot()).toMatchObject({ daysPlayed: ['2026-10-15'], quality: { observationGap: true } })
    retention.recordPlay('daily')
    expect(f.create().snapshot().quality.coverage).toBe('unknown')
  })

  it('contains an invalid clock rather than fabricating a date', () => {
    const f = fixture(), retention = new Retention2048({ ...f.options, now: () => Number.NaN })
    expect(retention.recordPlay('practice')).toMatchObject({ daysPlayed: [], today: null,
      quality: { observationGap: true, coverage: 'unknown' }, d1: { status: 'unknown' } })
  })
})

afterEach(() => vi.useRealTimers())
describe('optional account activity client', () => {
  it.each([[200, 'recorded'], [401, 'anonymous'], [503, 'unavailable'], [429, 'unavailable'], [403, 'unavailable'], [500, 'unavailable']] as const)(
    'maps HTTP %s without retry or client identity/date', async (status, expected) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status }))
      expect(await reportPlayer2048Activity('daily', { category: 'observed_browser', fetcher })).toEqual({ status: expected })
      expect(fetcher).toHaveBeenCalledTimes(1)
      const [url, request] = fetcher.mock.calls[0]
      expect(url).toBe('/api/2048/activity')
      expect(request).toMatchObject({ method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: '{"mode":"daily"}' })
      expect(request!.signal).toBeInstanceOf(AbortSignal)
      expect(JSON.parse(request!.body as string)).toEqual({ mode: 'daily' })
    })

  it('makes no request for synthetic observations or unsupported modes', async () => {
    const fetcher = vi.fn<typeof fetch>()
    expect(await reportPlayer2048Activity('practice', { category: 'synthetic', fetcher })).toEqual({ status: 'skipped' })
    expect(await reportPlayer2048Activity('training' as Retention2048Mode, { category: 'observed_browser', fetcher })).toEqual({ status: 'skipped' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('aborts and resolves unavailable on timeout even if a custom fetcher ignores cancellation', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}))
    const pending = reportPlayer2048Activity('practice', { category: 'observed_browser', fetcher, timeoutMs: 50 })
    await vi.advanceTimersByTimeAsync(50)
    expect(await pending).toEqual({ status: 'unavailable' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][1]!.signal!.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('contains a transport failure and clears its timeout without a queue or retry', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))
    expect(await reportPlayer2048Activity('practice', { category: 'observed_browser', fetcher })).toEqual({ status: 'unavailable' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
