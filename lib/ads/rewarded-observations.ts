/** Local demo diagnostics only. No SDK, provider payload, account or network. */
export const REWARDED_OBSERVATIONS_STORAGE_KEY = 'torneos.2048.rewarded-observations.v1'
export const MAX_REWARDED_OBSERVATION_EVENTS = 500
export const MAX_REWARDED_OBSERVATION_REQUESTS = 100
export const REWARDED_OBSERVATIONS_SCOPE = 'Observaciones locales del adaptador de demostración. Availability es evaluación de disponibilidad, no prueba de oferta mostrada. Grant demo significa continuación ya aplicada; no impresiones, concesiones publicitarias reales, ingresos ni retención comercial.'

const stages = ['availability', 'request', 'grant', 'rejected', 'closed', 'no_fill', 'error', 'timeout', 'cancelled', 'invalidated', 'ignored_duplicate', 'ignored_late'] as const
const modes = ['off', 'demo', 'provider'] as const
export const REWARDED_OBSERVATION_CODES = ['off', 'provider_not_configured', 'ineligible', 'busy', 'already_applied', 'daily_cap',
  'storage_unavailable', 'storage_corrupt', 'storage_uncertain', 'storage_full', 'clock_invalid', 'clock_rollback', 'locks_unavailable',
  'provider_unavailable', 'provider_error', 'closed', 'no_fill', 'timeout', 'cancelled', 'invalidated', 'destroyed', 'grant_rejected',
  'request_mismatch', 'duplicate', 'late', 'out_of_order', 'invalid_source'] as const

export interface RewardedObservationEvent {
  type: 'rewarded'
  stage: typeof stages[number]
  requestId: string | null
  sourceId: string | null
  mode: typeof modes[number]
  /** Controller UTC epoch milliseconds, never a provider's opaque timestamp. */
  at: number
  code?: typeof REWARDED_OBSERVATION_CODES[number]
}
type Category = 'demonstration' | 'synthetic'
interface RewardedObservationData {
  version: 1
  category: Category
  capturedAt: number
  events: RewardedObservationEvent[]
  truncated: boolean
  observationGap: boolean
}
type LocalStorage = Pick<Storage, 'getItem' | 'setItem'>
type StorageStatus = 'ready' | 'unavailable' | 'corrupt'
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const member = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && values.includes(value as T)
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799999
const eventKey = (event: RewardedObservationEvent) => [event.stage, event.requestId, event.sourceId, event.mode, event.at, event.code ?? ''].join('|')
const failedStages = new Set<RewardedObservationEvent['stage']>(['rejected', 'closed', 'no_fill', 'error', 'timeout', 'cancelled', 'invalidated'])

function readEvent(value: unknown, category: Category): RewardedObservationEvent | null {
  if (!record(value) || !exact(value, ['type', 'stage', 'requestId', 'sourceId', 'mode', 'at', ...(Object.hasOwn(value, 'code') ? ['code'] : [])])
    || value.type !== 'rewarded' || !member(stages, value.stage) || !member(modes, value.mode) || !timestamp(value.at)
    || value.requestId !== null && !uuid(value.requestId) || value.sourceId !== null && !uuid(value.sourceId)
    || Object.hasOwn(value, 'code') && !member(REWARDED_OBSERVATION_CODES, value.code)) return null
  if (value.stage === 'grant' && (!uuid(value.requestId) || !uuid(value.sourceId) || value.mode === 'off'
    || category === 'demonstration' && value.mode !== 'demo')) return null
  return { type: 'rewarded', stage: value.stage, requestId: typeof value.requestId === 'string' ? value.requestId.toLowerCase() : null,
    sourceId: typeof value.sourceId === 'string' ? value.sourceId.toLowerCase() : null, mode: value.mode, at: value.at,
    ...(value.code ? { code: value.code as RewardedObservationEvent['code'] } : {}) }
}

/** Strict bounded reader. Invalid private bytes are preserved by the writer. */
export function readRewardedObservations(raw: string | null): RewardedObservationData | null {
  if (raw === null || raw.length > 262_144) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (!record(data) || !exact(data, ['version', 'category', 'capturedAt', 'events', 'truncated', 'observationGap']) || data.version !== 1
      || !member(['demonstration', 'synthetic'] as const, data.category) || !timestamp(data.capturedAt)
      || !Array.isArray(data.events) || data.events.length > MAX_REWARDED_OBSERVATION_EVENTS
      || typeof data.truncated !== 'boolean' || typeof data.observationGap !== 'boolean') return null
    const events: RewardedObservationEvent[] = [], keys = new Set<string>(), requests = new Map<string, string>()
    const requestIds = new Set<string>(), grants = new Set<string>()
    for (const row of data.events) {
      const event = readEvent(row, data.category)
      if (!event || event.at > data.capturedAt || keys.has(eventKey(event))) return null
      keys.add(eventKey(event))
      if (event.requestId) {
        requestIds.add(event.requestId)
        if (event.sourceId) {
          if (requests.has(event.requestId) && requests.get(event.requestId) !== event.sourceId) return null
          requests.set(event.requestId, event.sourceId)
        }
        if (event.stage === 'grant') { if (grants.has(event.requestId)) return null; grants.add(event.requestId) }
      }
      events.push(event)
    }
    if (requestIds.size > MAX_REWARDED_OBSERVATION_REQUESTS) return null
    return { version: 1, category: data.category, capturedAt: data.capturedAt, events,
      truncated: data.truncated, observationGap: data.observationGap }
  } catch { return null }
}

export class RewardedObservations {
  private data: RewardedObservationData
  private storageStatus: StorageStatus = 'ready'
  private key: string
  constructor(private options: { getStorage: () => LocalStorage | null; category: Category }) {
    this.key = options.category === 'synthetic' ? `${REWARDED_OBSERVATIONS_STORAGE_KEY}.synthetic` : REWARDED_OBSERVATIONS_STORAGE_KEY
    this.data = { version: 1, category: options.category, capturedAt: 0, events: [], truncated: false, observationGap: false }
    this.refresh()
  }
  private bound() {
    const requests = new Set<string>()
    for (let index = this.data.events.length - 1; index >= 0 && requests.size < MAX_REWARDED_OBSERVATION_REQUESTS; index--) {
      const id = this.data.events[index].requestId
      if (id) requests.add(id)
    }
    const retained = this.data.events.filter(event => event.requestId === null || requests.has(event.requestId)).slice(-MAX_REWARDED_OBSERVATION_EVENTS)
    if (retained.length < this.data.events.length) this.data.truncated = true
    this.data.events = retained
  }
  private refresh() {
    if (this.storageStatus !== 'ready') return
    try {
      const storage = this.options.getStorage()
      if (!storage) { this.storageStatus = 'unavailable'; return }
      const raw = storage.getItem(this.key)
      if (raw === null) { if (this.data.events.length) this.data.observationGap = true; return }
      const stored = readRewardedObservations(raw)
      if (!stored || stored.category !== this.data.category) { this.storageStatus = 'corrupt'; return }
      const merged = new Map(stored.events.map(event => [eventKey(event), event]))
      for (const event of this.data.events) merged.set(eventKey(event), event)
      const next = { ...this.data, capturedAt: Math.max(this.data.capturedAt, stored.capturedAt), events: [...merged.values()],
        truncated: this.data.truncated || stored.truncated, observationGap: this.data.observationGap || stored.observationGap }
      // Cross-tab callbacks must not introduce a second application or rebind a request.
      const requests = new Map<string, string>(), grants = new Set<string>()
      for (const event of next.events) if (event.requestId) {
        if (event.sourceId) {
          if (requests.has(event.requestId) && requests.get(event.requestId) !== event.sourceId) { this.storageStatus = 'corrupt'; return }
          requests.set(event.requestId, event.sourceId)
        }
        if (event.stage === 'grant') {
          if (grants.has(event.requestId)) { this.storageStatus = 'corrupt'; return }
          grants.add(event.requestId)
        }
      }
      this.data = next; this.bound()
    } catch { this.storageStatus = 'unavailable' }
  }
  private save() {
    if (this.storageStatus !== 'ready') return
    try {
      const storage = this.options.getStorage()
      if (!storage) { this.storageStatus = 'unavailable'; return }
      storage.setItem(this.key, JSON.stringify(this.data))
    } catch { this.storageStatus = 'unavailable' }
  }
  observe(value: unknown) {
    let event = readEvent(value, this.data.category)
    if (!event) return false
    this.refresh()
    const prior = event.requestId ? this.data.events.filter(row => row.requestId === event!.requestId) : []
    if (event.sourceId && prior.some(row => row.sourceId !== null && row.sourceId !== event!.sourceId)) { this.data.observationGap = true; return false }
    if (event.stage === 'grant') {
      if (prior.some(row => row.stage === 'grant')) event = { ...event, stage: 'ignored_duplicate', code: 'duplicate' }
      else if (prior.some(row => failedStages.has(row.stage) && !(row.stage === 'rejected' && row.code === 'busy'))) event = { ...event, stage: 'ignored_late', code: 'late' }
      else if (!prior.some(row => row.stage === 'request')) this.data.observationGap = true
    }
    if (this.data.events.some(row => eventKey(row) === eventKey(event!))) return false
    if (event.at < this.data.capturedAt) this.data.observationGap = true
    this.data.capturedAt = Math.max(this.data.capturedAt, event.at)
    this.data.events.push(event); this.bound(); this.save(); return true
  }
  snapshot() {
    this.refresh()
    const events = this.data.events.map(event => ({ ...event }))
    const count = (stage: RewardedObservationEvent['stage']) => events.filter(event => event.stage === stage).length
    return { ...this.data, events, scope: REWARDED_OBSERVATIONS_SCOPE,
      quality: { storageStatus: this.storageStatus, truncated: this.data.truncated, observationGap: this.data.observationGap,
        coverage: this.storageStatus === 'ready' && !this.data.truncated && !this.data.observationGap ? 'local_best_effort' : 'unknown' },
      summary: { retainedAvailabilityEvaluations: count('availability'), retainedRequests: new Set(events.filter(event => event.stage === 'request' && event.requestId).map(event => event.requestId)).size,
        retainedDemoApplications: new Set(events.filter(event => event.stage === 'grant' && event.mode === 'demo').map(event => event.requestId)).size,
        retainedClosedEvents: count('closed'), retainedRejections: count('rejected'), retainedNoFillEvents: count('no_fill'),
        retainedErrors: count('error'), retainedTimeouts: count('timeout'), retainedCancellations: count('cancelled'),
        retainedInvalidations: count('invalidated'), retainedIgnoredDuplicateEvents: count('ignored_duplicate'), retainedIgnoredLateEvents: count('ignored_late') } }
  }
}
