import { afterEach, describe, expect, it, vi } from 'vitest'
import { REWARDED_STORAGE_KEY, RewardedController, type RewardedEvent, type RewardedExclusive, type RewardedProviderEvent, type RewardedTestProvider } from '../rewarded'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const at = (value: string) => Date.parse(value)
function serialLock(): RewardedExclusive {
  let queue: Promise<unknown> = Promise.resolve()
  return work => { const next = queue.then(work); queue = next.catch(() => {}); return next }
}
function fixture() {
  const data = new Map<string, string>(), eligible = new Set([id(1), id(2), id(3), id(4)])
  let clock = at('2026-10-19T15:00:00Z'), nextId = 100, writes = 0
  const storage = { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, raw: string) => { writes++; data.set(key, raw) } }
  const events: RewardedEvent[] = [], changed = vi.fn()
  const grant = vi.fn((sourceId: string) => { eligible.delete(sourceId); return true })
  const base = { mode: 'demo' as const, category: 'observed_browser' as const, getStorage: () => storage,
    isEligible: (sourceId: string) => eligible.has(sourceId), grant, now: () => clock, uuid: () => id(nextId++),
    runExclusive: serialLock(), observe: (event: RewardedEvent) => events.push(event), changed }
  return { data, eligible, storage, events, changed, grant, base, create: (options = {}) => new RewardedController({ ...base, ...options }),
    setTime: (value: number) => { clock = value }, writes: () => writes }
}
function provider() {
  const callbacks: ((event: RewardedProviderEvent) => void)[] = [], requests: { requestId: string; sourceId: string }[] = []
  const dispose = vi.fn()
  const adapter: RewardedTestProvider = { kind: 'test', available: () => true,
    request: request => { callbacks.push(request.onEvent); requests.push(request); return dispose } }
  return { adapter, callbacks, requests, dispose,
    emit: (type: RewardedProviderEvent['type'], index = 0, requestId = requests[index].requestId) => callbacks[index]({ type, requestId }) }
}
async function drain() { for (let i = 0; i < 8; i++) await Promise.resolve() }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('local rewarded benefit coordinator', () => {
  it('requires an explicit manual demo completion, applies synchronously once, and persists after success', async () => {
    const f = fixture(), controller = f.create()
    expect(controller.snapshot(id(1))).toMatchObject({ available: true, usedToday: 0, remainingToday: 2, status: 'idle' })
    expect(await controller.request(id(1))).toBe(true)
    const token = controller.snapshot().requestId!
    expect(controller.snapshot()).toMatchObject({ status: 'pending', sourceId: id(1), usedToday: 0 })
    expect(f.grant).not.toHaveBeenCalled()
    expect(f.events.map(event => event.stage)).toEqual(['availability', 'request'])
    expect(await controller.completeDemo(token)).toBe(true)
    expect(f.grant).toHaveBeenCalledExactlyOnceWith(id(1))
    expect(controller.snapshot()).toMatchObject({ status: 'granted', usedToday: 1, reservedToday: 0, remainingToday: 1 })
    expect(JSON.parse(f.data.get(REWARDED_STORAGE_KEY)!)).toMatchObject({ version: 1, category: 'observed_browser',
      benefits: [{ sourceId: id(1), requestId: token, state: 'applied', day: '2026-10-19' }] })
    expect(f.events.filter(event => event.stage === 'grant')).toHaveLength(1)
    await controller.completeDemo(token); await controller.completeDemo(token)
    expect(f.events.filter(event => event.stage === 'ignored_duplicate')).toHaveLength(1)
    expect(f.grant).toHaveBeenCalledTimes(1)
    controller.destroy()
  })

  it('keeps off and the public provider mode unconfigured even if a test provider is passed', async () => {
    const f = fixture(), p = provider()
    for (const mode of ['off', 'provider'] as const) {
      const controller = f.create({ mode, provider: p.adapter })
      const code = mode === 'off' ? 'off' : 'provider_not_configured'
      expect(controller.snapshot(id(1))).toMatchObject({ available: false, reason: code })
      expect(await controller.request(id(1))).toBe(false)
      expect(controller.snapshot().reason).toBe(code)
    }
    expect(f.grant).not.toHaveBeenCalled(); expect(p.requests).toEqual([]); expect(f.writes()).toBe(0)
  })

  it('rechecks the live checkpoint and never consumes cap when applying returns false or throws', async () => {
    for (const fail of [() => false, () => { throw new Error('refused') }]) {
      const f = fixture(), controller = f.create({ grant: vi.fn(fail) })
      await controller.request(id(1))
      expect(await controller.completeDemo(controller.snapshot().requestId!)).toBe(false)
      expect(controller.snapshot()).toMatchObject({ status: 'rejected', reason: 'grant_rejected', usedToday: 0, reservedToday: 0, remainingToday: 2 })
      expect(JSON.parse(f.data.get(REWARDED_STORAGE_KEY)!).benefits).toEqual([])
      controller.destroy()
    }
    const f = fixture(), controller = f.create()
    await controller.request(id(1)); f.eligible.delete(id(1))
    expect(await controller.completeDemo(controller.snapshot().requestId!)).toBe(false)
    expect(f.grant).not.toHaveBeenCalled(); expect(controller.snapshot().usedToday).toBe(0)
    controller.destroy()
  })

  it('ignores duplicate, mismatched, late and out-of-order provider callbacks without a second benefit', async () => {
    const f = fixture(), p = provider(), controller = f.create({ mode: 'provider', category: 'synthetic', provider: p.adapter })
    await controller.request(id(1))
    p.emit('grant', 0, id(999)); await drain()
    expect(f.grant).not.toHaveBeenCalled()
    p.emit('grant'); p.emit('grant'); p.emit('closed'); await drain()
    expect(f.grant).toHaveBeenCalledTimes(1)
    p.emit('grant'); await drain()
    expect(f.grant).toHaveBeenCalledTimes(1)
    expect(f.events.filter(event => event.stage === 'grant')).toHaveLength(1)
    expect(f.events.some(event => event.code === 'request_mismatch')).toBe(true)
    expect(f.events.some(event => event.code === 'out_of_order')).toBe(true)
    expect(controller.snapshot().usedToday).toBe(1)
    expect(f.data.has(REWARDED_STORAGE_KEY)).toBe(false)
    expect(f.data.has(`${REWARDED_STORAGE_KEY}.synthetic`)).toBe(true)
    controller.destroy()
  })

  it.each(['closed', 'no_fill', 'error'] as const)('does not grant or consume on %s before a late grant', async type => {
    const f = fixture(), p = provider(), controller = f.create({ mode: 'provider', category: 'synthetic', provider: p.adapter })
    await controller.request(id(1)); p.emit(type); p.emit('grant'); await drain()
    expect(controller.snapshot()).toMatchObject({ status: type, reason: type === 'error' ? 'provider_error' : type, usedToday: 0 })
    expect(f.grant).not.toHaveBeenCalled(); expect(p.dispose).toHaveBeenCalledTimes(1)
    expect(f.events.some(event => event.stage === 'ignored_late')).toBe(true)
    controller.destroy()
  })

  it('isolates provider throws and unavailable inventory without affecting normal gameplay', async () => {
    const f = fixture(), p = provider()
    const throwing = f.create({ mode: 'provider', category: 'synthetic', provider: { ...p.adapter, request: () => { throw new Error('SDK throw') } } })
    expect(await throwing.request(id(1))).toBe(false)
    expect(throwing.snapshot()).toMatchObject({ status: 'error', reason: 'provider_error', usedToday: 0 })
    const unavailable = f.create({ mode: 'provider', category: 'synthetic', provider: { ...p.adapter, available: () => false } })
    expect(await unavailable.request(id(1))).toBe(false)
    expect(unavailable.snapshot().reason).toBe('provider_unavailable')
    expect(f.grant).not.toHaveBeenCalled(); throwing.destroy(); unavailable.destroy()
  })

  it.each(['grant', 'closed'] as const)('preserves a synchronous %s terminal outcome if the provider then throws', async type => {
    const f = fixture()
    const controller = f.create({ mode: 'provider', category: 'synthetic', runExclusive: async <T>(work: () => T) => work(),
      provider: { kind: 'test', available: () => true, request: (request: Parameters<RewardedTestProvider['request']>[0]) => {
        request.onEvent({ type, requestId: request.requestId }); throw new Error('throw after callback')
      } } })
    expect(await controller.request(id(1))).toBe(type === 'grant')
    await drain()
    expect(controller.snapshot()).toMatchObject({ status: type === 'grant' ? 'granted' : 'closed', usedToday: type === 'grant' ? 1 : 0 })
    expect(f.grant).toHaveBeenCalledTimes(type === 'grant' ? 1 : 0)
    expect(f.events.filter(event => event.stage === 'grant')).toHaveLength(type === 'grant' ? 1 : 0)
    expect(f.events.some(event => event.stage === 'rejected')).toBe(false)
    controller.destroy()
  })

  it('rejects malformed runtime callbacks without leaking provider payload or accepting a later grant', async () => {
    const f = fixture(), p = provider(), controller = f.create({ mode: 'provider', category: 'synthetic', provider: p.adapter })
    await controller.request(id(1))
    p.callbacks[0]({ type: 'unknown', requestId: p.requests[0].requestId, payload: 'private-provider-payload' } as unknown as RewardedProviderEvent)
    p.emit('grant'); await drain()
    expect(controller.snapshot()).toMatchObject({ status: 'error', reason: 'provider_error', usedToday: 0 })
    expect(f.grant).not.toHaveBeenCalled(); expect(JSON.stringify(f.events)).not.toContain('private-provider-payload')
    controller.destroy()
  })

  it('times out pending callbacks and preserves the outcome reason for a retry', async () => {
    vi.useFakeTimers()
    const f = fixture(), p = provider(), controller = f.create({ mode: 'provider', category: 'synthetic', provider: p.adapter, timeoutMs: 50 })
    await controller.request(id(1)); vi.advanceTimersByTime(51); p.emit('grant'); await drain()
    expect(controller.snapshot(id(1))).toMatchObject({ status: 'timeout', reason: 'timeout', available: true, usedToday: 0 })
    expect(f.grant).not.toHaveBeenCalled()
    expect(await controller.request(id(1))).toBe(true)
    controller.destroy()
  })

  it('rejects a grant at the wall-clock deadline even if the timeout task never ran', async () => {
    vi.useFakeTimers()
    const f = fixture(), start = f.base.now(), p = provider()
    const controller = f.create({ mode: 'provider', category: 'synthetic', provider: p.adapter, timeoutMs: 120_000 })
    await controller.request(id(1))
    f.setTime(start + 120_000); vi.setSystemTime(start + 120_000) // No advanceTimers: suspended event-loop scenario.
    p.emit('grant'); await drain()
    expect(f.grant).not.toHaveBeenCalled()
    expect(controller.snapshot()).toMatchObject({ status: 'timeout', reason: 'timeout', usedToday: 0, reservedToday: 0 })
    expect(f.events.filter(event => event.stage === 'timeout')).toHaveLength(1)
    expect(f.events.some(event => event.stage === 'ignored_late')).toBe(true)
    controller.destroy()
  })

  it('rechecks the deadline after a queued grant obtains the cross-tab lock', async () => {
    vi.useFakeTimers()
    const f = fixture(), start = f.base.now()
    let release!: () => void, calls = 0
    const lock: RewardedExclusive = async work => {
      if (++calls === 1) return work()
      return new Promise((resolve, reject) => { release = () => { try { resolve(work()) } catch (error) { reject(error) } } })
    }
    const controller = f.create({ runExclusive: lock, timeoutMs: 120_000 })
    await controller.request(id(1))
    const completion = controller.completeDemo(controller.snapshot().requestId!)
    f.setTime(start + 120_001); vi.setSystemTime(start + 120_001); release()
    expect(await completion).toBe(false)
    expect(f.grant).not.toHaveBeenCalled()
    expect(controller.snapshot()).toMatchObject({ status: 'timeout', usedToday: 0, reservedToday: 0 })
    expect(JSON.parse(f.data.get(REWARDED_STORAGE_KEY)!).benefits).toEqual([])
    controller.destroy()
  })

  it('rolls back its reservation if synchronous storage crosses the deadline before benefit application', async () => {
    vi.useFakeTimers()
    const f = fixture(), start = f.base.now()
    let writes = 0
    const controller = f.create({ timeoutMs: 100, getStorage: () => ({ getItem: f.storage.getItem, setItem: (key: string, raw: string) => {
      f.storage.setItem(key, raw); if (++writes === 2) f.setTime(start + 101)
    } }) })
    await controller.request(id(1))
    expect(await controller.completeDemo(controller.snapshot().requestId!)).toBe(false)
    expect(f.grant).not.toHaveBeenCalled(); expect(controller.snapshot()).toMatchObject({ status: 'timeout', usedToday: 0, reservedToday: 0 })
    controller.destroy()
  })

  it('ties manual cancel to its token and invalidation/destroy reject obsolete grants', async () => {
    const f = fixture(), controller = f.create()
    await controller.request(id(1)); const first = controller.snapshot().requestId!
    controller.cancelPending(id(999)); expect(controller.snapshot().status).toBe('pending')
    controller.cancelPending(first)
    expect(await controller.completeDemo(first)).toBe(false)
    await controller.request(id(2)); const second = controller.snapshot().requestId!
    controller.cancelPending(first); expect(controller.snapshot().requestId).toBe(second)
    controller.invalidate(); expect(await controller.completeDemo(second)).toBe(false)
    await controller.request(id(3)); const third = controller.snapshot().requestId!
    controller.destroy(); expect(await controller.completeDemo(third)).toBe(false)
    expect(await controller.request(id(4))).toBe(false)
    expect(f.grant).not.toHaveBeenCalled(); expect(controller.snapshot().usedToday).toBe(0)
  })

  it('rechecks identity and cancellation after awaiting the grant lock', async () => {
    const f = fixture()
    let queued: (() => unknown) | undefined
    let call = 0
    const lock: RewardedExclusive = async work => { if (++call === 1) return work(); return new Promise(resolve => { queued = () => resolve(work()) }) }
    const controller = f.create({ runExclusive: lock })
    await controller.request(id(1)); const token = controller.snapshot().requestId!
    const completion = controller.completeDemo(token)
    controller.invalidate(); queued!(); expect(await completion).toBe(false)
    expect(f.grant).not.toHaveBeenCalled(); expect(controller.snapshot().usedToday).toBe(0)
    controller.destroy()
  })

  it('invalidates an initial request waiting on the lock without opening its dialog', async () => {
    const f = fixture()
    let release!: () => void
    const lock: RewardedExclusive = work => new Promise((resolve, reject) => { release = () => { try { resolve(work()) } catch (error) { reject(error) } } })
    const controller = f.create({ runExclusive: lock })
    const request = controller.request(id(1)); controller.invalidate(); release()
    expect(await request).toBe(false); expect(controller.snapshot().status).toBe('idle')
    expect(f.events.some(event => event.stage === 'request')).toBe(false)
    controller.destroy()
  })

  it('shares the two-per-Chile-day cap across instances and preserves one grant per source', async () => {
    const f = fixture(), a = f.create(), b = f.create(), c = f.create()
    expect(await a.request(id(1))).toBe(true)
    expect(await b.request(id(2))).toBe(true)
    expect(await c.request(id(3))).toBe(true) // Pending demos do not reserve cap or hold the lock.
    const results = await Promise.all([a.completeDemo(a.snapshot().requestId!), b.completeDemo(b.snapshot().requestId!), c.completeDemo(c.snapshot().requestId!)])
    expect(results.filter(Boolean)).toHaveLength(2); expect(f.grant).toHaveBeenCalledTimes(2)
    expect(c.snapshot()).toMatchObject({ usedToday: 2, remainingToday: 0, reason: 'daily_cap' })
    f.eligible.add(id(1))
    expect(await f.create().request(id(1))).toBe(false)
    expect(f.grant).toHaveBeenCalledTimes(2)
    a.destroy(); b.destroy(); c.destroy()
  })

  it('uses exact Chile midnight and blocks persisted clock rollback', async () => {
    const f = fixture(), controller = f.create()
    f.setTime(at('2026-10-20T02:59:59.999Z'))
    await controller.request(id(1)); await controller.completeDemo(controller.snapshot().requestId!)
    await controller.request(id(2)); await controller.completeDemo(controller.snapshot().requestId!)
    expect(controller.snapshot(id(3))).toMatchObject({ usedToday: 2, remainingToday: 0, available: false })
    f.setTime(at('2026-10-20T03:00:00.000Z'))
    expect(controller.snapshot(id(3))).toMatchObject({ usedToday: 0, remainingToday: 2, available: true })
    await controller.request(id(3)); await controller.completeDemo(controller.snapshot().requestId!)
    f.setTime(at('2026-10-20T02:59:00.000Z'))
    expect(await controller.request(id(4))).toBe(false)
    expect(controller.snapshot()).toMatchObject({ available: false, reason: 'clock_rollback' })
    controller.destroy()
  })

  it('fails closed for absent locks and denied, silently dropped, or corrupt storage without modifying corrupt bytes', async () => {
    const f = fixture()
    vi.stubGlobal('navigator', {})
    const noLock = f.create({ runExclusive: undefined })
    expect(noLock.snapshot(id(1))).toMatchObject({ available: false, reason: 'locks_unavailable' })
    expect(await noLock.request(id(1))).toBe(false)
    const denied = f.create({ getStorage: () => { throw new Error('denied') } })
    expect(await denied.request(id(1))).toBe(false); expect(denied.snapshot().reason).toBe('storage_unavailable')
    const dropped = f.create({ getStorage: () => ({ getItem: () => null, setItem: () => {} }) })
    expect(await dropped.request(id(1))).toBe(false)
    f.data.set(REWARDED_STORAGE_KEY, '{keep-corrupt')
    const corrupt = f.create()
    expect(await corrupt.request(id(1))).toBe(false)
    expect(corrupt.snapshot()).toMatchObject({ reason: 'storage_corrupt', quotaStatus: 'corrupt' })
    expect(f.data.get(REWARDED_STORAGE_KEY)).toBe('{keep-corrupt')
    expect(f.grant).not.toHaveBeenCalled()
  })

  it('retains an uncertain reservation and blocks more benefits if final persistence fails after apply', async () => {
    const f = fixture()
    let writes = 0
    const storage = { getItem: f.storage.getItem, setItem: (key: string, raw: string) => { if (++writes === 3) throw new Error('disk full'); f.storage.setItem(key, raw) } }
    const controller = f.create({ getStorage: () => storage })
    await controller.request(id(1))
    expect(await controller.completeDemo(controller.snapshot().requestId!)).toBe(true)
    expect(f.grant).toHaveBeenCalledTimes(1)
    expect(controller.snapshot()).toMatchObject({ status: 'granted', reason: 'storage_uncertain', quotaStatus: 'uncertain', usedToday: 0, reservedToday: 1, remainingToday: 1 })
    expect(await f.create().request(id(2))).toBe(false)
    expect(f.grant).toHaveBeenCalledTimes(1)
    controller.destroy()
  })

  it('never grants if writing the reservation fails, and isolates observation/UI failures', async () => {
    const f = fixture()
    let writes = 0
    const controller = f.create({ getStorage: () => ({ getItem: f.storage.getItem, setItem: (key: string, raw: string) => {
      if (++writes === 2) throw new Error('full'); f.storage.setItem(key, raw)
    } }), changed: () => { throw new Error('UI') }, observe: () => { throw new Error('evidence') } })
    expect(await controller.request(id(1))).toBe(true)
    expect(await controller.completeDemo(controller.snapshot().requestId!)).toBe(false)
    expect(f.grant).not.toHaveBeenCalled(); expect(controller.snapshot().usedToday).toBe(0)
    controller.destroy()
  })
})
