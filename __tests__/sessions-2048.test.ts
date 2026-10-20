import { describe, expect, it } from 'vitest'
import {
  MAX_2048_OBSERVATION_SESSIONS, SESSIONS_2048_STORAGE_KEY, Sessions2048,
  readSessions2048, summarizeSessions2048, type Sessions2048Options,
} from '../lib/game/sessions-2048'

const context = { build: 'unity-2048-007', rulesVersion: '2048-classic-v1', category: 'observed_browser', mode: 'practice' } as const

function fixture() {
  const data = new Map<string, string>()
  let at = Date.UTC(2026, 9, 15, 15), serial = 0, writes = 0
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { writes++; data.set(key, value) } }
  const options = { ...context, getStorage: () => storage, now: () => at,
    uuid: () => `00000000-0000-0000-0000-${String(++serial).padStart(12, '0')}` }
  return { data, storage, options, observer: (overrides: Partial<Sessions2048Options> = {}) => new Sessions2048({ ...options, ...overrides }),
    tick: (ms = 1000) => { at += ms }, writes: () => writes,
    saved: () => readSessions2048(data.get(SESSIONS_2048_STORAGE_KEY) ?? null)! }
}

describe('2048 local browser observations', () => {
  it('does not access storage or record a session until a factual ready', () => {
    let reads = 0
    const f = fixture(), observer = f.observer({ getStorage: () => { reads++; throw new Error('Safari denied') } })
    expect(reads).toBe(0)
    expect(observer.snapshot()).toBeNull()
    expect(observer.start('practice-1')).toBe(false)
    observer.checkpoint()
    expect(reads).toBe(0)
    expect(() => observer.ready()).not.toThrow()
    expect(reads).toBe(1)
    expect(observer.snapshot()?.storageError).toBe(true)
    expect(summarizeSessions2048(observer.snapshot()).quality.coverage).toBe('incomplete')
  })

  it('keeps browser, mount session and host practice identities separate and deduplicates ready/start', () => {
    const f = fixture(), observer = f.observer()
    expect(observer.ready()).toBe(true)
    expect(observer.ready()).toBe(false)
    expect(observer.start('practice-1')).toBe(true)
    expect(observer.start('practice-1')).toBe(false)
    const ledger = observer.snapshot()!
    expect(ledger.sessions).toHaveLength(1)
    expect(ledger.practices).toHaveLength(1)
    expect(ledger.browserId).not.toBe(ledger.sessions[0].id)
    expect(ledger.practices[0].sessionId).toBe(ledger.sessions[0].id)
    expect(ledger.events.map(event => event.kind)).toEqual(['ready', 'start'])
  })

  it('records factual movement milestones once and does not write on every move', () => {
    const f = fixture(), observer = f.observer()
    observer.ready(); observer.start('practice-1')
    expect(observer.validMove('practice-1', 0)).toBe(false)
    observer.validMove('practice-1', 1)
    const afterFirst = f.writes()
    for (let count = 2; count < 20; count++) { f.tick(); observer.validMove('practice-1', count) }
    expect(f.writes()).toBe(afterFirst)
    f.tick(); observer.validMove('practice-1', 20)
    expect(observer.validMove('practice-1', 20)).toBe(false)
    expect(observer.validMove('practice-1', 1)).toBe(false)
    expect(observer.validMove('other-practice', 21)).toBe(false)
    const ledger = observer.snapshot()!
    expect(ledger.events.filter(event => event.kind === 'first-valid-move')).toHaveLength(1)
    expect(ledger.events.filter(event => event.kind === '20-valid-moves')).toHaveLength(1)
    expect(summarizeSessions2048(ledger)).toMatchObject({ startedPractices: 1, firstValidMoves: 1, twentyValidMoves: 1, endedPractices: 0 })
  })

  it('does not invent a first/twentieth milestone after missing movement observations', () => {
    const f = fixture(), observer = f.observer()
    observer.ready(); observer.start('practice-1')
    expect(observer.validMove('practice-1', 20)).toBe(true)
    expect(observer.validMove('practice-1', Number.POSITIVE_INFINITY)).toBe(false)
    const ledger = observer.snapshot()!
    expect(ledger.practices[0]).toMatchObject({ validMoves: 20, firstValidMoveAt: null, twentyValidMovesAt: null, observationGap: true })
    expect(summarizeSessions2048(ledger)).toMatchObject({ firstValidMoves: 0, twentyValidMoves: 0, quality: { observationGap: true, coverage: 'incomplete' } })
  })

  it('pause, bfcache-style return and cleanup checkpoints do not end or interrupt practice', () => {
    const f = fixture(), observer = f.observer()
    observer.ready(); observer.start('practice-1'); observer.validMove('practice-1', 1)
    f.tick(); observer.visibility(false); observer.visibility(false); observer.checkpoint()
    f.tick(30_000); observer.visibility(true); observer.visibility(true)
    observer.validMove('practice-1', 2); observer.checkpoint()
    const ledger = observer.snapshot()!
    expect(ledger.events.filter(event => event.kind === 'paused')).toHaveLength(1)
    expect(ledger.events.filter(event => event.kind === 'resumed')).toHaveLength(1)
    expect(ledger.events.some(event => event.kind === 'end' || event.kind === 'interrupted')).toBe(false)
    expect(ledger.practices[0]).toMatchObject({ id: 'practice-1', status: 'active', endedAt: null, validMoves: 2 })
  })

  it('restart interrupts an active practice once and starts a distinct identity with reset counters', () => {
    const f = fixture(), observer = f.observer()
    observer.ready(); observer.start('practice-1'); observer.validMove('practice-1', 1)
    f.tick(); expect(observer.restart('practice-1', 'practice-2')).toBe(true)
    expect(observer.restart('practice-1', 'practice-2')).toBe(false)
    observer.validMove('practice-2', 1)
    const ledger = observer.snapshot()!
    expect(ledger.practices.map(practice => [practice.id, practice.status, practice.validMoves])).toEqual([
      ['practice-1', 'interrupted', 1], ['practice-2', 'active', 1],
    ])
    expect(ledger.events.filter(event => event.kind === 'interrupted')).toHaveLength(1)
    expect(ledger.events.find(event => event.kind === 'restart')).toMatchObject({ practiceId: 'practice-2', previousPracticeId: 'practice-1' })
    expect(summarizeSessions2048(ledger)).toMatchObject({ restarts: 1, interruptedPractices: 1, startedPractices: 2 })
  })

  it('does not relabel a naturally ended game as interrupted on restart', () => {
    const f = fixture(), observer = f.observer()
    observer.ready(); observer.start('practice-1')
    f.tick(); observer.end('practice-1', 'no_moves')
    expect(observer.end('practice-1', 'no_moves')).toBe(false)
    expect(observer.interrupt('practice-1')).toBe(false)
    expect(observer.validMove('practice-1', 1)).toBe(false)
    observer.restart('practice-1', 'practice-2')
    const ledger = observer.snapshot()!
    expect(ledger.practices[0]).toMatchObject({ status: 'ended', reason: 'no_moves' })
    expect(ledger.events.filter(event => event.kind === 'end')).toHaveLength(1)
    expect(ledger.events.some(event => event.kind === 'interrupted')).toBe(false)
  })

  it('persists a restart with a clock that advances on each observation call', () => {
    const f = fixture()
    let at = 10_000
    const observer = f.observer({ now: () => at++ })
    observer.ready(); observer.start('practice-1'); observer.validMove('practice-1', 1)
    observer.visibility(false); observer.visibility(true); observer.checkpoint()
    expect(observer.restart('practice-1', 'practice-2')).toBe(true)
    // Read the actual saved bytes before snapshot() could advance the capture.
    expect(() => f.saved()).not.toThrow()
    const ledger = f.saved()
    const restart = ledger.events.find(event => event.kind === 'restart')!
    expect(ledger.capturedAt).toBeGreaterThanOrEqual(restart.at)
    expect(ledger.sessions[0].lastSeenAt).toBeGreaterThanOrEqual(restart.at)
    expect(ledger.practices[1].lastSeenAt).toBeGreaterThanOrEqual(restart.at)
    expect(ledger.storageError).toBe(false)
  })

  it('keeps explicit navigation interruption separate from confirmed game end', () => {
    const f = fixture(), observer = f.observer()
    observer.ready(); observer.start('practice-1'); observer.interrupt('practice-1', 'navigation')
    expect(summarizeSessions2048(observer.snapshot())).toMatchObject({ interruptedPractices: 1, endedPractices: 0, activeOrUnconfirmedPractices: 0 })
  })

  it('excludes synthetic, training and tournament sessions from observed practice counts', () => {
    const f = fixture()
    for (const [index, overrides] of [
      {}, { category: 'synthetic' }, { mode: 'training' }, { mode: 'tournament' },
    ].entries()) {
      const observer = f.observer(overrides as Partial<Sessions2048Options>)
      observer.ready(); observer.start(`practice-${index}`); observer.validMove(`practice-${index}`, 1); observer.end(`practice-${index}`)
      f.tick()
    }
    const report = summarizeSessions2048(f.saved())
    expect(report).toMatchObject({ localBrowsers: 1, observedBrowserSessions: 1, startedPractices: 1, firstValidMoves: 1, endedPractices: 1, excludedSessions: 3 })
    expect(report.scope).toContain('no personas')
    expect(report).not.toHaveProperty('D7')
    expect(report).not.toHaveProperty('retentionRate')
  })

  it('a new mount preserves the browser and leaves an unconfirmed previous practice active', () => {
    const f = fixture(), first = f.observer()
    first.ready(); first.start('practice-1'); first.validMove('practice-1', 1); first.checkpoint()
    const browserId = f.saved().browserId
    f.tick(); const second = f.observer(); second.ready(); second.start('practice-2')
    const ledger = second.snapshot()!
    expect(ledger.browserId).toBe(browserId)
    expect(ledger.sessions).toHaveLength(2)
    expect(ledger.practices.every(practice => practice.status === 'active')).toBe(true)
    expect(summarizeSessions2048(ledger).activeOrUnconfirmedPractices).toBe(2)
  })

  it('merges sequential writes from separately hydrated tabs without replacing their evidence', () => {
    const f = fixture(), first = f.observer(), second = f.observer()
    first.ready(); first.start('practice-1')
    f.tick(); second.ready(); second.start('practice-2')
    f.tick(); first.validMove('practice-1', 1)
    f.tick(); second.validMove('practice-2', 1); second.end('practice-2')
    f.tick(); first.checkpoint()
    const ledger = f.saved()
    expect(ledger.sessions).toHaveLength(2)
    expect(ledger.practices).toHaveLength(2)
    expect(ledger.events.filter(event => event.kind === 'ready')).toHaveLength(2)
    expect(ledger.events.filter(event => event.kind === 'first-valid-move')).toHaveLength(2)
    expect(ledger.practices.find(practice => practice.id === 'practice-2')?.status).toBe('ended')
    expect(new Set(ledger.events.map(event => event.id)).size).toBe(ledger.events.length)
  })

  it('preserves corrupt storage and keeps a bounded in-memory observation when writes fail', () => {
    const f = fixture()
    f.data.set(SESSIONS_2048_STORAGE_KEY, '{corrupt')
    const corrupt = f.observer()
    expect(() => { corrupt.ready(); corrupt.start('practice-1'); corrupt.validMove('practice-1', 1); corrupt.end('practice-1') }).not.toThrow()
    expect(f.data.get(SESSIONS_2048_STORAGE_KEY)).toBe('{corrupt')
    expect(corrupt.snapshot()?.storageError).toBe(true)
    const quota = f.observer({ getStorage: () => ({ getItem: () => null, setItem: () => { throw new Error('quota') } }) })
    expect(() => { quota.ready(); quota.start('practice-2'); quota.end('practice-2') }).not.toThrow()
    expect(summarizeSessions2048(quota.snapshot())).toMatchObject({ endedPractices: 1, quality: { storageError: true, coverage: 'incomplete' } })
  })

  it('marks truncation instead of claiming the retained history is a complete cohort', () => {
    const f = fixture()
    for (let index = 0; index <= MAX_2048_OBSERVATION_SESSIONS; index++) { f.observer().ready(); f.tick() }
    expect(f.saved().sessions).toHaveLength(MAX_2048_OBSERVATION_SESSIONS)
    expect(summarizeSessions2048(f.saved()).quality).toMatchObject({ truncated: true, coverage: 'incomplete' })
  })

  it('does not invent timestamps after a clock rollback', () => {
    const f = fixture(), observer = f.observer()
    observer.ready(); observer.start('practice-1'); f.tick(-1000)
    expect(observer.end('practice-1')).toBe(false)
    const ledger = observer.snapshot()!
    expect(ledger.observationGap).toBe(true)
    expect(ledger.practices[0].status).toBe('active')
    expect(ledger.events.some(event => event.kind === 'end')).toBe(false)
  })

  it('strictly rejects unexpected/private fields, invalid context and inconsistent milestones', () => {
    const f = fixture(), observer = f.observer()
    observer.ready(); observer.start('practice-1')
    const raw = observer.snapshot()!
    expect(() => readSessions2048(JSON.stringify({ ...raw, board: [2] }))).toThrow()
    expect(() => readSessions2048(JSON.stringify({ ...raw, sessions: [{ ...raw.sessions[0], email: 'private@example.test' }] }))).toThrow()
    expect(() => readSessions2048(JSON.stringify({ ...raw, sessions: [{ ...raw.sessions[0], mode: 'unknown' }] }))).toThrow()
    expect(() => readSessions2048(JSON.stringify({ ...raw, practices: [{ ...raw.practices[0], twentyValidMovesAt: raw.createdAt }] }))).toThrow()
    expect(readSessions2048(null)).toBeNull()
  })

  it('exports versioned local evidence without gameplay state or PII and returns detached snapshots', () => {
    const f = fixture(), observer = f.observer()
    observer.ready(); observer.start('practice-1'); observer.validMove('practice-1', 1)
    const snapshot = observer.snapshot()!
    snapshot.practices[0].validMoves = 999
    expect(observer.snapshot()?.practices[0].validMoves).toBe(1)
    const exported = JSON.parse(observer.exportJson())
    expect(exported).toMatchObject({ format: 'torneos.2048.local-observations', version: 1, ledger: { version: 1 }, summary: { firstValidMoves: 1 } })
    expect(exported.scope).toContain('cohortes globales')
    expect(JSON.stringify(exported)).not.toMatch(/"(?:board|seed|score|email|rut|accountId|userId|bank)"/)
    expect(() => readSessions2048(JSON.stringify(exported.ledger))).not.toThrow()
  })
})
