import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Unity2048Session, type Practice2048Event } from '@/lib/game/unity-2048-session'
import { Free2048Experience } from '@/lib/game/free-2048-experience'
import { Practice2048Recovery } from '@/lib/game/practice-2048-recovery'
import { Load2048Diagnostics } from '@/lib/game/2048-load-diagnostics'
import { applyLocalPracticeMove } from '@/lib/game/local-practice'
import type { Direction } from '@/lib/game/engine'
import { getDaily2048Challenge } from '@/lib/game/daily-2048'
import { readSessions2048, SESSIONS_2048_STORAGE_KEY } from '@/lib/game/sessions-2048'
import { PERSONAL_2048_PROGRESS_KEY } from '@/lib/game/personal-2048-progress'
import { RETENTION_2048_STORAGE_KEY } from '@/lib/game/retention-2048'

// Real local controllers; only the account transport and browser lease are doubles.
// Calls prove client intent, never authentication, SQL upserts, row counts or last_seen_at.
const beforeMidnight = Date.parse('2026-10-20T02:50:00Z') // 19 October, 23:50 Chile.
const directions: readonly Direction[] = ['left', 'up', 'right', 'down']
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(beforeMidnight) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

function fixture() {
  const data = new Map<string, string>()
  const storage: Storage = { get length() { return data.size }, key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) },
    removeItem: key => { data.delete(key) }, clear: () => data.clear() }
  let serial = 0
  const uuid = () => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`
  vi.stubGlobal('crypto', { randomUUID: uuid })
  const held = new Set<string>()
  const sent: { mode: 'practice' | 'daily'; at: number }[] = []
  const recordAccount = vi.fn(async (mode: 'practice' | 'daily') => { sent.push({ mode, at: Date.now() }); return { status: 'recorded' as const } })
  const mounted: { close(): void }[] = []
  const mount = (category: 'observed_browser' | 'synthetic' = 'observed_browser') => {
    const free = new Free2048Experience({ getStorage: () => storage, category, now: Date.now, uuid,
      measureAccountActivity: true, dailyNow: Date.now, dailyAvailable: () => true, recordAccount })
    const diagnostics = new Load2048Diagnostics({ getStorage: () => storage, category, now: Date.now, monotonicNow: () => 0, uuid })
    diagnostics.begin()
    let recovery: Practice2048Recovery | null = null
    const request = vi.fn()
    const observe = (event: Practice2048Event) => {
      free.observe(event)
      if (event.type === 'start' && event.practiceId && !event.assisted) diagnostics.linkPractice(event.practiceId, 'new', free.snapshot().mode)
    }
    const session = new Unity2048Session(() => recovery?.capture(), request, undefined, undefined, observe)
    recovery = new Practice2048Recovery({ session, experience: free, getStorage: () => storage, category, now: Date.now,
      acquireLock: async () => {
        if (held.has(category)) return null
        held.add(category); return () => { held.delete(category) }
      } })
    const controller = recovery
    const ready = () => { diagnostics.ready(); free.ready(); controller.ready() }
    const start = async (mode: 'practice' | 'daily' = 'practice', seed = 'training-demo-0') => {
      const challenge = mode === 'daily' ? getDaily2048Challenge(Date.now()) : null
      expect(free.selectNext(mode, challenge)).toBe(true)
      expect(await controller.start(mode, challenge?.seed ?? seed)).toBe(true)
    }
    const resume = async () => {
      const resumed = await controller.resume()
      if (resumed) diagnostics.linkPractice(free.practiceCheckpointMetadata()!.practiceId, 'resumed', 'practice')
      return resumed
    }
    const exportLocal = () => JSON.parse(free.exportJson(diagnostics.snapshot()))
    const close = () => { diagnostics.leave(); controller.capture(); controller.destroy(); free.checkpoint(); session.destroy() }
    const result = { free, diagnostics, session, recovery: controller, request, ready, start, resume, exportLocal, close }
    mounted.push(result)
    return result
  }
  const ledger = () => {
    const result = readSessions2048(data.get(SESSIONS_2048_STORAGE_KEY) ?? null)
    expect(result).not.toBeNull(); return result!
  }
  return { data, sent, recordAccount, mount, ledger, close: () => mounted.forEach(item => item.close()) }
}
type Mounted = ReturnType<ReturnType<typeof fixture>['mount']>
async function settle() { await Promise.resolve(); await Promise.resolve() }
function directionFor(mount: Mounted, moved: boolean, seed = 'training-demo-0') {
  const view = mount.session.snapshot()
  const current = mount.session.practiceCheckpoint()?.state ?? { board: Array.from({ length: 4 }, (_, row) => view.cells.slice(row * 4, row * 4 + 4)),
    score: view.score, moveNumber: view.move_number, seed }
  return directions.find(direction => applyLocalPracticeMove(current, direction).moved === moved)
}
async function validMove(mount: Mounted, seed?: string) {
  const direction = directionFor(mount, true, seed)
  expect(direction).toBeDefined(); await mount.session.move(direction!); await settle()
}
const startsAndFirst = (f: ReturnType<typeof fixture>) => f.ledger().events.filter(event => event.kind === 'start' || event.kind === 'first-valid-move')

describe('account activity boundary across actual practice recovery and load observation', () => {
  it('does not request account activity for loading, ready, diagnostic export or starting a practice', async () => {
    const f = fixture(), mount = f.mount()
    const pending = mount.exportLocal()
    expect(pending.loadDiagnostics.entries[0].result).toBe('loading')
    expect(pending.observations.ledger).toBeNull()
    mount.ready(); mount.exportLocal(); await mount.start(); mount.exportLocal(); await settle()
    expect(f.recordAccount).not.toHaveBeenCalled()
    expect(mount.free.snapshot().retention.daysPlayed).toEqual([])
    expect(f.ledger().practices).toHaveLength(1)
    expect(f.ledger().events.filter(event => event.kind === 'first-valid-move')).toHaveLength(0)
    expect(mount.request).not.toHaveBeenCalled(); f.close()
  })

  it('requests activity once at the first actual valid move and does not repeat it for subsequent moves or exports', async () => {
    const f = fixture(), mount = f.mount(); mount.ready(); await mount.start()
    await validMove(mount)
    expect(f.recordAccount).toHaveBeenCalledExactlyOnceWith('practice')
    for (let move = 0; move < 5; move++) await validMove(mount)
    mount.exportLocal(); mount.exportLocal(); await settle()
    expect(f.recordAccount).toHaveBeenCalledTimes(1)
    expect(mount.free.snapshot()).toMatchObject({ accountStatus: 'recorded', retention: { daysPlayed: ['2026-10-19'] } })
    expect(f.ledger().practices).toHaveLength(1)
    expect(startsAndFirst(f).map(event => event.kind)).toEqual(['start', 'first-valid-move'])
    expect(mount.request).not.toHaveBeenCalled(); f.close()
  })

  it('does not request activity for an actual no-op after restoring an active practice', async () => {
    const f = fixture(), original = f.mount(); original.ready(); await original.start()
    let noOp: Direction | undefined
    for (let input = 0; input < 100 && !original.session.snapshot().game_over; input++) {
      noOp = directionFor(original, false)
      if (original.session.snapshot().move_number > 2 && noOp) break
      await original.session.move(directions[input % 4])
    }
    expect(noOp).toBeDefined(); await settle()
    expect(f.recordAccount).toHaveBeenCalledTimes(1)
    original.close(); vi.setSystemTime(beforeMidnight + 60_000)
    const resumed = f.mount(); resumed.ready(); expect(await resumed.resume()).toBe(true)
    const before = resumed.session.practiceCheckpoint(), lifecycle = startsAndFirst(f)
    const personal = f.data.get(PERSONAL_2048_PROGRESS_KEY), retention = f.data.get(RETENTION_2048_STORAGE_KEY)
    await resumed.session.move(noOp!); resumed.exportLocal(); await settle()
    expect(resumed.session.practiceCheckpoint()).toEqual(before)
    expect(f.recordAccount).toHaveBeenCalledTimes(1)
    expect(f.data.get(PERSONAL_2048_PROGRESS_KEY)).toBe(personal)
    expect(f.data.get(RETENTION_2048_STORAGE_KEY)).toBe(retention)
    expect(startsAndFirst(f)).toEqual(lifecycle); f.close()
  })

  it('allows a same-day declaration after a new valid move on resume without duplicating local practices or historical first moves', async () => {
    const f = fixture(), original = f.mount(); original.ready(); await original.start(); await validMove(original)
    const before = original.session.practiceCheckpoint(), lifecycle = startsAndFirst(f)
    original.close(); vi.setSystemTime(beforeMidnight + 60_000)
    const resumed = f.mount(); resumed.ready(); expect(await resumed.resume()).toBe(true)
    resumed.exportLocal(); await settle()
    expect(f.recordAccount).toHaveBeenCalledTimes(1)
    expect(resumed.session.practiceCheckpoint()).toEqual(before)
    expect(startsAndFirst(f)).toEqual(lifecycle)
    await validMove(resumed)
    expect(f.recordAccount.mock.calls.map(([mode]) => mode)).toEqual(['practice', 'practice'])
    expect(f.sent[1].at).toBeGreaterThan(f.sent[0].at)
    expect(f.ledger().practices).toHaveLength(1)
    expect(startsAndFirst(f)).toEqual(lifecycle)
    expect(resumed.free.snapshot().retention.daysPlayed).toEqual(['2026-10-19'])
    expect(resumed.exportLocal().loadDiagnostics.entries.filter((entry: { entry: string }) => entry.entry === 'resumed')).toHaveLength(1)
    // Server idempotency and last_seen_at must be checked with a real account separately.
    f.close()
  })

  it('does not qualify the next Chile day by restoring, but a later valid move qualifies that day', async () => {
    const f = fixture(), original = f.mount(); original.ready(); await original.start(); await validMove(original)
    original.close(); vi.setSystemTime('2026-10-20T03:05:00Z')
    const resumed = f.mount(); resumed.ready(); expect(await resumed.resume()).toBe(true)
    resumed.exportLocal(); await settle()
    expect(f.recordAccount).toHaveBeenCalledTimes(1)
    expect(resumed.free.snapshot().retention).toMatchObject({ today: '2026-10-20', daysPlayed: ['2026-10-19'] })
    await validMove(resumed)
    expect(f.recordAccount).toHaveBeenCalledTimes(2)
    expect(resumed.free.snapshot().retention.daysPlayed).toEqual(['2026-10-19', '2026-10-20'])
    expect(f.ledger().practices).toHaveLength(1)
    expect(f.ledger().events.filter(event => event.kind === 'first-valid-move')).toHaveLength(1); f.close()
  })

  it('does not qualify activity by selecting or starting the daily challenge; its actual move does', async () => {
    const f = fixture(), mount = f.mount(); mount.ready()
    const challenge = getDaily2048Challenge(Date.now())
    expect(mount.free.selectNext('daily', challenge)).toBe(true)
    mount.exportLocal(); await settle(); expect(f.recordAccount).not.toHaveBeenCalled()
    await mount.start('daily'); mount.exportLocal(); await settle()
    expect(f.recordAccount).not.toHaveBeenCalled(); expect(mount.free.snapshot().retention.daysPlayed).toEqual([])
    await validMove(mount, challenge.seed)
    expect(f.recordAccount).toHaveBeenCalledExactlyOnceWith('daily')
    await validMove(mount, challenge.seed); mount.exportLocal(); await settle()
    expect(f.recordAccount).toHaveBeenCalledTimes(1)
    expect(mount.free.snapshot().personal.history).toEqual([])
    expect(mount.exportLocal().loadDiagnostics.entries[0]).toMatchObject({ entry: 'new', mode: 'daily' })
    expect(mount.request).not.toHaveBeenCalled(); f.close()
  })

  it('plays a real assisted continuation without changing account activity, normal records or return days', async () => {
    const f = fixture(), mount = f.mount(); mount.ready(); await mount.start()
    for (let input = 0; input < 1000 && !mount.session.snapshot().game_over; input++) await mount.session.move(directions[input % 4])
    await settle()
    const offer = mount.session.snapshot().training
    expect(offer?.phase).toBe('offered'); expect(f.recordAccount).toHaveBeenCalledTimes(1)
    const personal = f.data.get(PERSONAL_2048_PROGRESS_KEY), retention = f.data.get(RETENTION_2048_STORAGE_KEY), lifecycle = startsAndFirst(f)
    expect(mount.session.beginTrainingDemo(offer!.sourceId)).toBe(true)
    await mount.session.move(offer!.alternativeDirections[0])
    for (let input = 0; input < 10 && !mount.session.snapshot().game_over; input++) await mount.session.move(directions[input % 4])
    const exported = mount.exportLocal(); await settle()
    expect(exported.trainingDemonstrationObservations.entries[0].validMoves).toBeGreaterThan(0)
    expect(f.recordAccount).toHaveBeenCalledTimes(1)
    expect(f.data.get(PERSONAL_2048_PROGRESS_KEY)).toBe(personal)
    expect(f.data.get(RETENTION_2048_STORAGE_KEY)).toBe(retention)
    expect(startsAndFirst(f)).toEqual(lifecycle)
    expect(mount.session.practiceCheckpoint()).toBeNull(); f.close()
  })

  it('excludes the synthetic category from account transport even when the measurement option is enabled', async () => {
    const f = fixture(), original = f.mount('synthetic'); original.ready(); await original.start(); await validMove(original)
    original.close(); vi.setSystemTime(beforeMidnight + 60_000)
    const resumed = f.mount('synthetic'); resumed.ready(); expect(await resumed.resume()).toBe(true); await validMove(resumed)
    const exported = resumed.exportLocal()
    expect(f.recordAccount).not.toHaveBeenCalled()
    expect(exported.loadDiagnostics.category).toBe('synthetic')
    expect(f.data.has(PERSONAL_2048_PROGRESS_KEY)).toBe(false)
    expect(resumed.free.snapshot().personal.history).toHaveLength(1)
    // The server's trusted app_metadata marker chooses this category; query params are not tested here.
    f.close()
  })

  it('keeps a failed account transport unavailable without retrying it through load export or later moves', async () => {
    const f = fixture(); f.recordAccount.mockRejectedValueOnce(new Error('account transport unavailable'))
    const mount = f.mount(); mount.ready(); await mount.start(); await validMove(mount)
    expect(mount.free.snapshot().accountStatus).toBe('unavailable')
    mount.exportLocal(); await validMove(mount); mount.exportLocal(); await settle()
    expect(f.recordAccount).toHaveBeenCalledTimes(1)
    expect(mount.session.snapshot().locked).toBe(false)
    expect(mount.free.snapshot().personal.history[0].moves).toBeGreaterThan(1)
    f.close()
  })
})
