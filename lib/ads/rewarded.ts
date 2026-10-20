/** Local benefit coordination, not an ad SDK, impression, revenue, or secure quota. */
export const REWARDED_STORAGE_KEY = 'torneos.rewarded-benefits.v1'
export const REWARDED_DAILY_LIMIT = 2
export type RewardedMode = 'off' | 'demo' | 'provider'
export type RewardedCategory = 'observed_browser' | 'synthetic'
export type RewardedCode = 'off' | 'provider_not_configured' | 'ineligible' | 'busy' | 'already_applied' | 'daily_cap'
  | 'storage_unavailable' | 'storage_corrupt' | 'storage_uncertain' | 'storage_full' | 'clock_invalid' | 'clock_rollback'
  | 'locks_unavailable' | 'provider_unavailable' | 'provider_error' | 'closed' | 'no_fill' | 'timeout' | 'cancelled'
  | 'invalidated' | 'destroyed' | 'grant_rejected' | 'request_mismatch' | 'duplicate' | 'late' | 'out_of_order' | 'invalid_source'
export interface RewardedEvent {
  type: 'rewarded'
  stage: 'availability' | 'request' | 'grant' | 'rejected' | 'closed' | 'no_fill' | 'error' | 'timeout'
    | 'cancelled' | 'invalidated' | 'ignored_duplicate' | 'ignored_late'
  requestId: string | null
  sourceId: string | null
  mode: RewardedMode
  at: number
  code?: RewardedCode
}
export interface RewardedSnapshot {
  mode: RewardedMode
  status: 'idle' | 'pending' | 'applying' | 'granted' | 'unavailable' | 'rejected' | 'closed' | 'no_fill' | 'error' | 'timeout' | 'cancelled'
  requestId: string | null
  sourceId: string | null
  available: boolean
  reason: RewardedCode | null
  usedToday: number | null
  reservedToday: number | null
  remainingToday: number | null
  quotaStatus: 'ready' | 'unavailable' | 'corrupt' | 'uncertain'
}
export interface RewardedProviderEvent { requestId: string; type: 'grant' | 'closed' | 'no_fill' | 'error' }
/** Injection is limited to synthetic tests; public provider mode stays unconfigured. */
export interface RewardedTestProvider {
  kind: 'test'
  available(): boolean
  request(request: { requestId: string; sourceId: string; onEvent: (event: RewardedProviderEvent) => void }): void | (() => void)
}
export type RewardedExclusive = <T>(work: () => T) => Promise<T>
type BenefitStorage = Pick<Storage, 'getItem' | 'setItem'>
interface Benefit { sourceId: string; requestId: string; day: string; at: number; state: 'reserved' | 'applied' }
interface Ledger { version: 1; category: RewardedCategory; lastSeenAt: number; benefits: Benefit[] }
interface Pending {
  sourceId: string; requestId: string; active: boolean; applying: boolean; granted: boolean
  startedAt: number; expiresAt: number
  ignored: Set<string>; timer?: ReturnType<typeof setTimeout>; dispose?: () => void
}
interface Options {
  mode: RewardedMode
  category: RewardedCategory
  getStorage: () => BenefitStorage | null
  isEligible: (sourceId: string) => boolean
  grant: (sourceId: string) => boolean
  changed?: (snapshot: RewardedSnapshot) => void
  observe?: (event: RewardedEvent) => void
  now?: () => number
  uuid?: () => string
  runExclusive?: RewardedExclusive
  provider?: RewardedTestProvider
  timeoutMs?: number
}
class QuotaError extends Error { constructor(readonly code: RewardedCode) { super(code) } }
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const exact = (x: Record<string, unknown>, keys: string[]) => Object.keys(x).length === keys.length && keys.every(key => Object.hasOwn(x, key))
const identity = (x: unknown): x is string => typeof x === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(x)
const validTime = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 && x <= 253402300799999
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' })
function chileDay(at: number) {
  if (!validTime(at)) throw new QuotaError('clock_invalid')
  const parts = dayFormat.formatToParts(at)
  return `${parts.find(part => part.type === 'year')!.value.padStart(4, '0')}-${parts.find(part => part.type === 'month')!.value}-${parts.find(part => part.type === 'day')!.value}`
}
function readLedger(raw: string | null, category: RewardedCategory): Ledger {
  if (raw === null) return { version: 1, category, lastSeenAt: 0, benefits: [] }
  try {
    if (raw.length > 1_048_576) throw new Error()
    const x: unknown = JSON.parse(raw)
    if (!record(x) || !exact(x, ['version', 'category', 'lastSeenAt', 'benefits']) || x.version !== 1
      || x.category !== category || !validTime(x.lastSeenAt) || !Array.isArray(x.benefits) || x.benefits.length > 4096) throw new Error()
    const sources = new Set<string>(), requests = new Set<string>()
    for (const item of x.benefits) {
      if (!record(item) || !exact(item, ['sourceId', 'requestId', 'day', 'at', 'state']) || !identity(item.sourceId) || !identity(item.requestId)
        || sources.has(item.sourceId) || requests.has(item.requestId) || !validTime(item.at) || item.at > x.lastSeenAt
        || item.day !== chileDay(item.at) || item.state !== 'reserved' && item.state !== 'applied') throw new Error()
      sources.add(item.sourceId); requests.add(item.requestId)
    }
    const days = new Map<string, number>()
    for (const item of x.benefits) { const count = (days.get(item.day) ?? 0) + 1; if (count > REWARDED_DAILY_LIMIT) throw new Error(); days.set(item.day, count) }
    return x as unknown as Ledger
  } catch { throw new QuotaError('storage_corrupt') }
}

export class RewardedController {
  private key: string
  private now: () => number
  private uuid: () => string
  private exclusive: RewardedExclusive
  private pending: Pending | null = null
  private recent: Pending[] = []
  private destroyed = false
  private generation = 0
  private uncertain = false
  private state: Pick<RewardedSnapshot, 'status' | 'requestId' | 'sourceId' | 'reason'> = { status: 'idle', requestId: null, sourceId: null, reason: null }
  constructor(private options: Options) {
    this.key = `${REWARDED_STORAGE_KEY}${options.category === 'synthetic' ? '.synthetic' : ''}`
    this.now = options.now ?? Date.now
    this.uuid = options.uuid ?? (() => globalThis.crypto.randomUUID())
    this.exclusive = options.runExclusive ?? (async work => {
      if (typeof navigator === 'undefined' || !navigator.locks?.request) throw new QuotaError('locks_unavailable')
      return navigator.locks.request(this.key, { mode: 'exclusive' }, work)
    })
  }
  private clock() { const at = this.now(); if (!validTime(at)) throw new QuotaError('clock_invalid'); return at }
  private storage() {
    try { const storage = this.options.getStorage(); if (!storage) throw new Error(); return storage }
    catch { throw new QuotaError('storage_unavailable') }
  }
  private load(at: number) {
    let raw: string | null
    try { raw = this.storage().getItem(this.key) } catch { throw new QuotaError('storage_unavailable') }
    const ledger = readLedger(raw, this.options.category)
    if (at < ledger.lastSeenAt) throw new QuotaError('clock_rollback')
    return ledger
  }
  private save(ledger: Ledger) {
    try {
      const storage = this.storage(), raw = JSON.stringify(ledger)
      storage.setItem(this.key, raw)
      if (storage.getItem(this.key) !== raw) throw new Error()
    } catch { throw new QuotaError('storage_unavailable') }
  }
  private eligible(sourceId: string) { try { return this.options.isEligible(sourceId) === true } catch { return false } }
  private configured() { return this.options.mode !== 'provider' || this.options.category === 'synthetic' && this.options.provider?.kind === 'test' }
  private policyReason(): RewardedCode | null {
    if (this.destroyed) return 'destroyed'
    if (this.options.mode === 'off') return 'off'
    if (!this.configured()) return 'provider_not_configured'
    if (!this.options.runExclusive && (typeof navigator === 'undefined' || !navigator.locks?.request)) return 'locks_unavailable'
    return null
  }
  private check(sourceId: string, ledger: Ledger, at: number) {
    if (!identity(sourceId)) throw new QuotaError('invalid_source')
    if (!this.eligible(sourceId)) throw new QuotaError('ineligible')
    if (this.uncertain || ledger.benefits.some(item => item.state === 'reserved')) throw new QuotaError('storage_uncertain')
    if (ledger.benefits.some(item => item.sourceId === sourceId)) throw new QuotaError('already_applied')
    if (ledger.benefits.filter(item => item.day === chileDay(at)).length >= REWARDED_DAILY_LIMIT) throw new QuotaError('daily_cap')
    if (ledger.benefits.length >= 4096) throw new QuotaError('storage_full')
  }
  private errorCode(error: unknown): RewardedCode { return error instanceof QuotaError ? error.code : 'provider_error' }
  private event(stage: RewardedEvent['stage'], item: { requestId: string | null; sourceId: string | null } | null, code?: RewardedCode) {
    let at: number
    try { at = this.clock() } catch { return }
    try { this.options.observe?.({ type: 'rewarded', stage, requestId: identity(item?.requestId) ? item.requestId : null,
      sourceId: identity(item?.sourceId) ? item.sourceId : null, mode: this.options.mode, at, ...(code ? { code } : {}) }) } catch { /* Optional evidence cannot block play. */ }
  }
  snapshot(sourceId = this.state.sourceId ?? ''): RewardedSnapshot {
    const policyReason = this.policyReason()
    let availabilityReason: RewardedCode | null = policyReason
    let usedToday: number | null = null, reservedToday: number | null = null, remainingToday: number | null = null
    let quotaStatus: RewardedSnapshot['quotaStatus'] = 'ready'
    try {
      const at = this.clock(), ledger = this.load(at), today = chileDay(at)
      usedToday = ledger.benefits.filter(item => item.day === today && item.state === 'applied').length
      reservedToday = ledger.benefits.filter(item => item.day === today && item.state === 'reserved').length
      remainingToday = Math.max(0, REWARDED_DAILY_LIMIT - usedToday - reservedToday)
      if (this.uncertain || ledger.benefits.some(item => item.state === 'reserved')) quotaStatus = 'uncertain'
      if (!policyReason && !this.pending) this.check(sourceId, ledger, at)
    } catch (error) {
      const code = this.errorCode(error)
      if (!policyReason && !this.pending) availabilityReason = code
      if (code === 'storage_corrupt') quotaStatus = 'corrupt'
      else if (code === 'storage_uncertain') quotaStatus = 'uncertain'
      else if (code.startsWith('storage_') || code.startsWith('clock_')) quotaStatus = 'unavailable'
    }
    return { ...this.state, mode: this.options.mode, reason: this.destroyed ? 'destroyed' : this.state.reason ?? availabilityReason,
      usedToday, reservedToday, remainingToday, quotaStatus,
      available: !this.destroyed && !this.pending && availabilityReason === null }
  }
  private changed() { try { this.options.changed?.(this.snapshot()) } catch { /* Optional UI callback. */ } }
  private finish(item: Pending, status: RewardedSnapshot['status'], code: RewardedCode | null) {
    item.active = false; item.applying = false
    if (item.timer !== undefined) clearTimeout(item.timer)
    try { item.dispose?.() } catch { /* Provider cleanup is isolated. */ }
    if (this.pending === item) this.pending = null
    if (!this.recent.includes(item)) this.recent = [...this.recent.slice(-31), item]
    this.state = { status, requestId: item.requestId, sourceId: item.sourceId, reason: code }
    this.changed()
  }
  private ignored(item: Pending, code: 'duplicate' | 'late' | 'request_mismatch' | 'out_of_order') {
    const stage = item.granted || item.applying ? 'ignored_duplicate' : 'ignored_late'
    const key = `${stage}:${code}`
    if (!item.ignored.has(key)) { item.ignored.add(key); this.event(stage, item, code) }
  }
  private deadline(item: Pending) {
    const at = this.clock()
    if (at < item.startedAt) throw new QuotaError('clock_rollback')
    if (at >= item.expiresAt) throw new QuotaError('timeout')
    return at
  }
  private timeout(item: Pending, ignoredCallback = false) {
    if (!item.active || this.pending !== item) return
    this.event('timeout', item, 'timeout'); this.finish(item, 'timeout', 'timeout')
    if (ignoredCallback) this.ignored(item, 'late')
  }
  async request(sourceId: string): Promise<boolean> {
    if (this.destroyed) return false
    if (this.pending) { this.event('rejected', { sourceId, requestId: null }, 'busy'); return false }
    const generation = ++this.generation
    let item!: Pending
    try {
      const requestId = this.uuid(); if (!identity(requestId)) throw new QuotaError('invalid_source')
      item = { requestId, sourceId, active: true, applying: false, granted: false, startedAt: 0, expiresAt: 0, ignored: new Set() }
      if (this.options.mode === 'off') throw new QuotaError('off')
      if (!this.configured()) throw new QuotaError('provider_not_configured')
      await this.exclusive(() => {
        if (this.destroyed || generation !== this.generation) throw new QuotaError('invalidated')
        const at = this.clock(), ledger = this.load(at)
        this.check(sourceId, ledger, at)
        if (this.options.mode === 'provider' && this.options.provider?.available() !== true) throw new QuotaError('provider_unavailable')
        ledger.lastSeenAt = at; this.save(ledger) // Prove storage writable before opening any benefit flow.
      })
      if (this.destroyed || generation !== this.generation) return false
      const timeout = this.options.timeoutMs ?? 120_000
      const timeoutMs = Number.isFinite(timeout) ? Math.max(1, Math.min(timeout, 600_000)) : 120_000
      item.startedAt = this.clock(); item.expiresAt = Math.min(253402300799999, item.startedAt + timeoutMs)
      this.pending = item
      this.state = { status: 'pending', requestId: item.requestId, sourceId, reason: null }
      this.event('availability', item); this.event('request', item); this.changed()
      item.timer = setTimeout(() => this.timeout(item), timeoutMs)
      if (this.options.mode === 'provider') {
        const dispose = this.options.provider!.request({ requestId: item.requestId, sourceId,
          onEvent: event => { void this.providerEvent(item, event) } })
        if (typeof dispose === 'function') { item.dispose = dispose; if (!item.active) { try { dispose() } catch { /* isolated */ } } }
      }
      return item.active || item.granted
    } catch (error) {
      if (this.destroyed || generation !== this.generation) return false
      if (item && !item.active) { this.ignored(item, 'out_of_order'); return item.granted }
      const code = this.errorCode(error)
      if (this.pending) { const pending = this.pending; this.event('error', pending, code); this.finish(pending, 'error', code) }
      else { this.state = { status: 'unavailable', requestId: null, sourceId: identity(sourceId) ? sourceId : null, reason: code }; this.event('rejected', null, code); this.changed() }
      return false
    }
  }
  private async providerEvent(item: Pending, event: RewardedProviderEvent): Promise<boolean> {
    if (!record(event) || !['grant', 'closed', 'no_fill', 'error'].includes(String(event.type))) {
      if (!item.active || this.pending !== item || this.destroyed || item.applying) this.ignored(item, 'out_of_order')
      else { this.event('error', item, 'provider_error'); this.finish(item, 'error', 'provider_error') }
      return false
    }
    if (event.requestId !== item.requestId) { this.ignored(item, 'request_mismatch'); return false }
    if (this.destroyed || !item.active || this.pending !== item) { this.ignored(item, item.granted ? 'duplicate' : 'late'); return false }
    try { this.deadline(item) } catch (error) {
      const code = this.errorCode(error)
      if (code === 'timeout') this.timeout(item, true)
      else { this.event('error', item, code); this.finish(item, 'error', code) }
      return false
    }
    if (item.applying) { this.ignored(item, event.type === 'grant' ? 'duplicate' : 'out_of_order'); return false }
    if (event.type !== 'grant') {
      const code = event.type === 'error' ? 'provider_error' : event.type
      this.event(event.type, item, code); this.finish(item, event.type, code); return false
    }
    item.applying = true; this.state.status = 'applying'; this.changed()
    try {
      return await this.exclusive(() => {
        if (this.destroyed || !item.active || this.pending !== item) { this.ignored(item, 'late'); return false }
        const at = this.deadline(item), ledger = this.load(at)
        this.check(item.sourceId, ledger, at)
        const reservation: Benefit = { sourceId: item.sourceId, requestId: item.requestId, day: chileDay(at), at, state: 'reserved' }
        ledger.benefits.push(reservation); ledger.lastSeenAt = at; this.save(ledger)
        let applied = false, failure: RewardedCode = 'grant_rejected'
        try {
          if (this.eligible(item.sourceId)) { this.deadline(item); applied = this.options.grant(item.sourceId) === true }
        } catch (error) { if (error instanceof QuotaError) failure = error.code }
        if (!applied) {
          ledger.benefits = ledger.benefits.filter(item => item !== reservation)
          try { this.save(ledger) } catch { this.uncertain = true }
          if (failure === 'timeout') this.timeout(item, true)
          else { this.event('rejected', item, failure); this.finish(item, 'rejected', this.uncertain ? 'storage_uncertain' : failure) }
          return false
        }
        // Storage and the game are not one transaction. A failed final write leaves
        // the durable reservation in place and blocks further benefits conservatively.
        reservation.state = 'applied'; item.granted = true
        try { this.save(ledger) } catch { this.uncertain = true }
        this.event('grant', item, this.uncertain ? 'storage_uncertain' : undefined)
        this.finish(item, 'granted', this.uncertain ? 'storage_uncertain' : null); return true
      })
    } catch (error) {
      if (!item.active || this.pending !== item) return false
      const code = this.errorCode(error)
      if (code === 'timeout') this.timeout(item, true)
      else { this.event('error', item, code); this.finish(item, 'error', code) }
      return false
    }
  }
  completeDemo(requestId: string): Promise<boolean> {
    const item = this.pending
    if (this.options.mode !== 'demo' || !item || item.requestId !== requestId) {
      const previous = this.recent.find(item => item.requestId === requestId)
      if (previous) this.ignored(previous, previous.granted ? 'duplicate' : 'late')
      return Promise.resolve(false)
    }
    return this.providerEvent(item, { requestId, type: 'grant' })
  }
  cancelPending(requestId?: string) {
    const item = this.pending
    if (!item) { if (!requestId) this.generation++; return }
    if (requestId && requestId !== item.requestId) return
    this.generation++; this.event('cancelled', item, 'cancelled'); this.finish(item, 'cancelled', 'cancelled')
  }
  invalidate() {
    this.generation++
    const item = this.pending
    if (item) { this.event('invalidated', item, 'invalidated'); this.finish(item, 'cancelled', 'invalidated') }
    else { this.state = { status: 'idle', requestId: null, sourceId: null, reason: null }; this.changed() }
  }
  destroy() { if (this.destroyed) return; this.invalidate(); this.destroyed = true }
}
