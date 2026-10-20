import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse2048TrialLocalExport, TRIAL_2048_LOCAL_IMPORT_ERROR } from '@/lib/analytics/2048-trial-local'
import { Sessions2048, type Sessions2048Ledger, type Sessions2048Options } from '@/lib/game/sessions-2048'
import type { Load2048Attempt, Load2048DiagnosticsSnapshot } from '@/lib/game/2048-load-diagnostics'

const base = Date.parse('2026-10-20T15:00:00Z'), build = 'unity-2048-007'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function attempt(patch: Partial<Load2048Attempt> = {}): Load2048Attempt {
  return { id: id(101), build, startedAt: base, result: 'ready', durationMs: 500, practiceId: null,
    entry: null, mode: null, entryAt: null, retryOf: null, ...patch }
}
function diagnostics(entries = [attempt()], patch: Partial<Load2048DiagnosticsSnapshot> = {}): Load2048DiagnosticsSnapshot {
  return { format: 'torneos.2048.load-diagnostics', version: 1, category: 'observed_browser', entries,
    capturedAt: base + 10000, truncated: false, observationGap: false, storageStatus: 'ready', ...patch }
}
function ledger(options: Partial<Sessions2048Options> = {}, lateTwenty = false): Sessions2048Ledger {
  let now = base + 500, serial = 0
  const tracker = new Sessions2048({ getStorage: () => null, build, rulesVersion: '2048-practice-v1', category: 'observed_browser',
    mode: 'practice', now: () => now, uuid: () => id(++serial), ...options })
  tracker.ready(); now = base + 600; tracker.start(id(900))
  for (let move = 1; move <= 20; move++) { now = base + 600 + move * 100; if (lateTwenty && move === 20) now = base + 6000; tracker.validMove(id(900), move) }
  now = base + 10000
  return tracker.snapshot()!
}
function free(value: Load2048DiagnosticsSnapshot | null | undefined, observations: Sessions2048Ledger | null = null) {
  return { format: 'torneos.2048.free-observations', version: 1,
    observations: { format: 'torneos.2048.local-observations', version: 1, ledger: observations },
    ...(value === undefined ? {} : { loadDiagnostics: value }) }
}
const parse = (value: unknown) => parse2048TrialLocalExport(JSON.stringify(value))
const linked = (patch: Partial<Load2048Attempt> = {}) => attempt({ practiceId: id(900), entry: 'new', mode: 'practice', entryAt: base + 600, ...patch })
afterEach(() => { vi.unstubAllGlobals() })

describe('load diagnostics in the local trial report', () => {
  it('accepts a standalone failure before ready without inventing practice, movement or return', () => {
    const result = parse(diagnostics([attempt({ result: 'error', durationMs: 350 })]))
    expect(result.loadDiagnostics).toMatchObject({ attempts: 1, ready: 0, errors: 1, loading: 0, milestones: null,
      readyDuration: { samples: 0, meanMs: null, minMs: null, maxMs: null } })
    expect(result.practice).toBeNull(); expect(result.localReturn).toBeNull()
    expect(result.training).toBeNull(); expect(result.rewardedDemo).toBeNull(); expect(result.ticketOffer).toBeNull()
  })

  it('recomputes outcomes, retry links and known durations without treating in-progress or inconclusive loads as abandonment', () => {
    const result = parse(diagnostics([
      attempt({ id: id(101), result: 'error', durationMs: 300 }),
      attempt({ id: id(102), startedAt: base + 400, result: 'ready', durationMs: 0, retryOf: id(101) }),
      attempt({ id: id(103), startedAt: base + 600, result: 'ready', durationMs: 800 }),
      attempt({ id: id(104), startedAt: base + 1500, result: 'ready', durationMs: null }),
      attempt({ id: id(105), startedAt: base + 2000, result: 'timeout', durationMs: 900 }),
      attempt({ id: id(106), startedAt: base + 3000, result: 'inconclusive', durationMs: 50 }),
      attempt({ id: id(107), startedAt: base + 4000, result: 'loading', durationMs: null }),
    ]))
    expect(result.loadDiagnostics).toMatchObject({ attempts: 7, ready: 3, errors: 1, timeouts: 1, inconclusive: 1, loading: 1, retries: 1,
      readyDuration: { samples: 2, meanMs: 400, minMs: 0, maxMs: 800 }, linkedEntries: { new: 0, resumed: 0 }, milestones: null })
    expect(JSON.stringify(result)).not.toMatch(/"(?:abandoned|abandonment|players|visits|conversion|retentionRate)"/)
  })

  it('keeps old exports compatible and missing diagnostics unknown', () => {
    expect(parse(free(undefined)).loadDiagnostics).toBeNull()
    expect(parse(free(null)).loadDiagnostics).toBeNull()
    const result = parse(free(diagnostics([attempt({ result: 'timeout', durationMs: 900 })])))
    expect(result.loadDiagnostics?.timeouts).toBe(1)
    expect(result.practice).toBeNull()
  })

  it('correlates existing milestones with matching practice, category, build and mode without adding practices', () => {
    const result = parse(free(diagnostics([linked()]), ledger()))
    expect(result.practice?.[0]).toMatchObject({ started: 1, firstValidMove: 1, twentyValidMoves: 1 })
    expect(result.loadDiagnostics?.milestones).toEqual({ linkedPractices: 1, unmatchedEntries: 0,
      firstValidMove: { practices: 1, fromLoad: { samples: 1, meanMs: 700, minMs: 700, maxMs: 700 }, fromReady: { samples: 1, meanMs: 200, minMs: 200, maxMs: 200 } },
      twentyValidMoves: { practices: 1, fromLoad: { samples: 1, meanMs: 2600, minMs: 2600, maxMs: 2600 }, fromReady: { samples: 1, meanMs: 2100, minMs: 2100, maxMs: 2100 } } })
  })

  it.each([
    ['practice ID', [linked({ practiceId: id(999) })], {}],
    ['build', [linked({ build: 'unity-2048-008' })], {}],
    ['category', [linked()], { category: 'synthetic' }],
    ['mode', [linked({ mode: 'daily' })], {}],
  ] as const)('leaves incompatible %s links unmatched without attributing milestones', (_label, entries, options) => {
    const result = parse(free(diagnostics([...entries]), ledger(options)))
    expect(result.loadDiagnostics?.milestones).toMatchObject({ linkedPractices: 0, unmatchedEntries: 1,
      firstValidMove: { practices: 0, fromLoad: { samples: 0, meanMs: null } } })
  })

  it('does not reattribute historical first or twenty movements to a resumed load', () => {
    const resumed = linked({ id: id(102), startedAt: base + 5000, durationMs: 300, entry: 'resumed', entryAt: base + 5400 })
    const result = parse(free(diagnostics([resumed]), ledger()))
    expect(result.loadDiagnostics).toMatchObject({ linkedEntries: { new: 0, resumed: 1 }, milestones: { linkedPractices: 1,
      firstValidMove: { practices: 0, fromLoad: { samples: 0, meanMs: null } }, twentyValidMoves: { practices: 0 } } })
    expect(result.practice?.[0]).toMatchObject({ firstValidMove: 1, twentyValidMoves: 1 })
  })

  it('deduplicates one practice across loads and measures a later milestone from the last compatible entry', () => {
    const resumed = linked({ id: id(102), startedAt: base + 5000, durationMs: 300, entry: 'resumed', entryAt: base + 5400 })
    const result = parse(free(diagnostics([linked(), resumed]), ledger({}, true)))
    expect(result.loadDiagnostics).toMatchObject({ attempts: 2, linkedEntries: { new: 1, resumed: 1 }, readyDuration: { samples: 2, meanMs: 400 },
      milestones: { linkedPractices: 1, firstValidMove: { practices: 1, fromLoad: { samples: 1, meanMs: 700 } },
        twentyValidMoves: { practices: 1, fromLoad: { samples: 1, meanMs: 1000 }, fromReady: { samples: 1, meanMs: 700 } } } })
    expect(result.practice?.[0].started).toBe(1)
    const reordered = parse(free(diagnostics([resumed, linked()]), ledger({}, true)))
    expect(reordered.loadDiagnostics).toEqual(result.loadDiagnostics)
  })

  it('counts a future first movement after resuming a practice with no historical first move', () => {
    const raw = ledger()
    raw.practices[0].startedAt = base + 600
    raw.practices[0].firstValidMoveAt = base + 5700
    raw.practices[0].twentyValidMovesAt = null
    raw.events = raw.events.filter(event => event.kind !== 'first-valid-move' && event.kind !== '20-valid-moves')
    const resumed = linked({ id: id(102), startedAt: base + 5000, durationMs: 300, entry: 'resumed', entryAt: base + 5400 })
    expect(parse(free(diagnostics([resumed]), raw)).loadDiagnostics?.milestones?.firstValidMove).toMatchObject({ practices: 1,
      fromLoad: { samples: 1, meanMs: 700 }, fromReady: { samples: 1, meanMs: 400 } })
  })

  it('keeps uncertain duration denominators empty and storage conflicts or missing coverage visible', () => {
    const result = parse(diagnostics([attempt({ durationMs: null })], { storageStatus: 'conflict', truncated: true, observationGap: true }))
    expect(result.loadDiagnostics).toMatchObject({ ready: 1, readyDuration: { samples: 0, meanMs: null },
      quality: { storageStatus: 'unavailable', coverage: 'unknown', truncated: true, observationGap: true } })
  })

  it('returns the same safe standalone summary after a snapshot is serialized and rehydrated', () => {
    const original = diagnostics([attempt({ result: 'error', durationMs: 200 })], { category: 'synthetic' })
    const first = parse(original), second = parse(JSON.parse(JSON.stringify(original)))
    expect(second).toEqual(first); expect(first.loadDiagnostics?.category).toBe('synthetic')
    const text = JSON.stringify(first)
    expect(text).not.toContain(id(101)); expect(text).not.toContain(build)
    expect(text).not.toMatch(/"(?:practiceId|retryOf|startedAt|capturedAt|entries|entryAt|seed|board|userId|filename)"/)
  })

  it.each([
    (value: Load2048DiagnosticsSnapshot) => ({ ...value, version: 99 }),
    (value: Load2048DiagnosticsSnapshot) => ({ ...value, summary: { attempts: 999999, email: 'private@example.test' } }),
    (value: Load2048DiagnosticsSnapshot) => ({ ...value, entries: [value.entries[0], value.entries[0]] }),
    (value: Load2048DiagnosticsSnapshot) => ({ ...value, entries: [{ ...value.entries[0], result: 'private@example.test' }] }),
    (value: Load2048DiagnosticsSnapshot) => ({ ...value, entries: [{ ...value.entries[0], durationMs: -1 }] }),
  ])('rejects malformed diagnostics with the fixed outer import error', change => {
    for (const raw of [change(diagnostics()), free(change(diagnostics()) as Load2048DiagnosticsSnapshot)]) {
      expect(() => parse(raw)).toThrowError(TRIAL_2048_LOCAL_IMPORT_ERROR)
    }
  })

  it('does not access storage or network, generate activity, or mix a second standalone browser into the previous summary', () => {
    const fetch = vi.fn(), storage = { getItem: vi.fn(), setItem: vi.fn() }
    vi.stubGlobal('fetch', fetch); vi.stubGlobal('localStorage', storage)
    expect(parse(diagnostics([attempt({ result: 'error', durationMs: 200 })])).loadDiagnostics?.attempts).toBe(1)
    expect(parse(diagnostics([])).loadDiagnostics?.attempts).toBe(0)
    expect(fetch).not.toHaveBeenCalled(); expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled()
  })
})
