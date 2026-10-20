import { describe, expect, it, vi } from 'vitest'
import { RewardedController, type RewardedEvent, type RewardedProviderEvent, type RewardedTestProvider } from '../lib/ads/rewarded'
import { Free2048Experience } from '../lib/game/free-2048-experience'
import { Unity2048Session } from '../lib/game/unity-2048-session'
import { getDaily2048Challenge } from '../lib/game/daily-2048'

function fixture(provider?: RewardedTestProvider) {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } } as Storage
  const now = () => Date.parse('2026-10-19T15:00:00Z'), recordAccount = vi.fn(async () => ({ status: 'recorded' as const }))
  const free = new Free2048Experience({ getStorage: () => storage, category: 'synthetic', now, recordAccount, measureAccountActivity: true })
  const network = vi.fn(), session = new Unity2048Session(vi.fn(), network, undefined, undefined, free.observe)
  const events: RewardedEvent[] = []
  const controller = new RewardedController({ mode: provider ? 'provider' : 'demo', category: 'synthetic', getStorage: () => storage, now,
    runExclusive: async work => work(), provider,
    isEligible: sourceId => { const state = session.snapshot(); return state.game_over && state.training?.phase === 'offered' && state.training.sourceId === sourceId },
    grant: sourceId => session.beginTrainingDemo(sourceId), observe: event => { events.push(event); free.observeRewarded(event) } })
  async function offer() {
    await session.start('training-demo-0')
    for (let index = 0; index < 1000 && !session.snapshot().game_over; index++) await session.move((['left','up','right','down'] as const)[index % 4])
    expect(session.snapshot().training?.phase).toBe('offered')
    return session.snapshot().training!.sourceId
  }
  free.ready()
  return { free, session, controller, offer, events, recordAccount, network, data }
}
const normal = (free: Free2048Experience) => {
  const exported = JSON.parse(free.exportJson())
  return { personal: exported.personalProgress, daily: exported.dailyProgress, retention: exported.localReturn,
    practices: exported.observations.ledger.practices, events: exported.observations.ledger.events, summary: exported.observations.summary }
}

describe('rewarded demonstration connected to actual 2048 practice', () => {
  it('requires confirmation, restores once, ignores duplicates, and keeps a higher assisted score out of records and return', async () => {
    const f = fixture(), sourceId = await f.offer(), original = f.session.snapshot(), before = normal(f.free)
    expect(await f.controller.request(sourceId)).toBe(true)
    const token = f.controller.snapshot().requestId!
    expect(f.session.snapshot()).toEqual(original)
    expect(normal(f.free)).toEqual(before)
    const results = await Promise.all([f.controller.completeDemo(token), f.controller.completeDemo(token)])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(f.session.snapshot().training).toMatchObject({ phase: 'active', sourceId })
    await f.session.move(f.session.snapshot().training!.alternativeDirections[0])
    for (let index = 0; index < 1000 && !f.session.snapshot().game_over; index++) await f.session.move((['left','up','right','down'] as const)[index % 4])
    expect(f.session.snapshot().score).toBeGreaterThan(original.score)
    expect(normal(f.free)).toEqual(before)
    expect(f.controller.snapshot().usedToday).toBe(1)
    expect(f.events.filter(event => event.stage === 'grant')).toHaveLength(1)
    expect(await f.controller.completeDemo(token)).toBe(false)
    expect(f.network).not.toHaveBeenCalled(); expect(f.recordAccount).not.toHaveBeenCalled()
    f.controller.destroy(); f.session.destroy()
  })

  it('keeps cancellation and a stale confirmation outside a subsequent normal practice', async () => {
    const f = fixture(), sourceId = await f.offer(), before = normal(f.free)
    await f.controller.request(sourceId); const token = f.controller.snapshot().requestId!
    f.controller.cancelPending(token)
    expect(await f.controller.completeDemo(token)).toBe(false)
    expect(normal(f.free)).toEqual(before); expect(f.controller.snapshot().usedToday).toBe(0)
    expect(f.session.snapshot().training?.phase).toBe('offered')
    await f.controller.request(sourceId); const nextToken = f.controller.snapshot().requestId!
    f.controller.invalidate(); await f.session.start('new-unassisted')
    const fresh = f.session.snapshot()
    expect(await f.controller.completeDemo(nextToken)).toBe(false)
    expect(f.session.snapshot()).toEqual(fresh); expect(fresh.training).toBeUndefined()
    expect(f.controller.snapshot().usedToday).toBe(0)
    f.controller.destroy(); f.session.destroy()
  })

  it.each(['no_fill','error','closed'] as const)('isolates provider test %s and rejects its late grant', async failure => {
    let callback!: (event: RewardedProviderEvent) => void, requestId = ''
    const provider: RewardedTestProvider = { kind: 'test', available: () => true, request: request => { callback = request.onEvent; requestId = request.requestId } }
    const f = fixture(provider), sourceId = await f.offer(), original = f.session.snapshot(), before = normal(f.free)
    await f.controller.request(sourceId)
    callback({ requestId, type: failure }); callback({ requestId, type: 'grant' })
    await Promise.resolve()
    expect(f.session.snapshot()).toEqual(original); expect(normal(f.free)).toEqual(before)
    expect(f.controller.snapshot().usedToday).toBe(0)
    expect(f.events.some(event => event.stage === 'ignored_late')).toBe(true)
    expect(f.events.some(event => event.stage === 'grant')).toBe(false)
    expect(f.network).not.toHaveBeenCalled(); expect(f.recordAccount).not.toHaveBeenCalled()
    f.controller.destroy(); f.session.destroy()
  })

  it('caps a third original practice without blocking an unassisted restart or daily game', async () => {
    const f = fixture()
    for (let index = 0; index < 2; index++) {
      f.controller.invalidate(); const sourceId = await f.offer()
      expect(await f.controller.request(sourceId)).toBe(true)
      expect(await f.controller.completeDemo(f.controller.snapshot().requestId!)).toBe(true)
    }
    f.controller.invalidate(); const sourceId = await f.offer(), before = normal(f.free)
    expect(await f.controller.request(sourceId)).toBe(false)
    expect(f.controller.snapshot(sourceId)).toMatchObject({ usedToday: 2, remainingToday: 0, reason: 'daily_cap' })
    expect(f.session.snapshot().training?.phase).toBe('offered'); expect(normal(f.free)).toEqual(before)
    f.controller.invalidate(); await f.session.start('unlimited-free')
    expect(f.session.snapshot()).toMatchObject({ score: 0, game_over: false }); expect(f.session.snapshot().training).toBeUndefined()
    const challenge = getDaily2048Challenge(Date.parse('2026-10-19T15:00:00Z'))
    expect(f.free.selectNext('daily', challenge)).toBe(true)
    await f.session.start(challenge.seed, { freeMode: 'daily' }); await f.session.move('up')
    expect(f.session.snapshot().training).toBeUndefined(); expect(f.controller.snapshot().usedToday).toBe(2)
    expect(f.network).not.toHaveBeenCalled(); expect(f.recordAccount).not.toHaveBeenCalled()
    f.controller.destroy(); f.session.destroy()
  })
})
