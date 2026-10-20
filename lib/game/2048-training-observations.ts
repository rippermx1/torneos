/** Local demonstration observations only. This module has no network contract. */
export const TRAINING_2048_OBSERVATIONS_KEY = 'torneos.2048.training-demo.v1'
export const MAX_TRAINING_2048_OBSERVATIONS = 100
export const TRAINING_2048_OBSERVATIONS_SCOPE = 'Demostración local de entrenamiento asistido; no impresiones, concesiones publicitarias, ingresos, jugadores únicos ni retención comercial.'

export type Training2048ObservationStage = 'offered' | 'started' | 'move' | 'ended' | 'interrupted'
export interface Training2048ObservationEvent {
  stage: Training2048ObservationStage
  sourceId: string
  continuationId: string | null
  validMoves: number
}
export interface Training2048Observation {
  sourceId: string
  continuationId: string | null
  offeredAt: number
  startedAt: number | null
  firstMoveAt: number | null
  updatedAt: number
  closedAt: number | null
  status: 'offered' | 'active' | 'ended' | 'interrupted'
  validMoves: number
}
interface Training2048Data {
  version: 1
  category: 'observed_browser' | 'synthetic'
  capturedAt: number
  entries: Training2048Observation[]
  truncated: boolean
  observationGap: boolean
}
type ObservationStorage = Pick<Storage, 'getItem' | 'setItem'>
type StorageStatus = 'ready' | 'unavailable' | 'corrupt'
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const whole = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const time = (value: unknown): value is number => whole(value) && value <= 253402300799999
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)
const entryKeys = ['sourceId', 'continuationId', 'offeredAt', 'startedAt', 'firstMoveAt', 'updatedAt', 'closedAt', 'status', 'validMoves']

function validEntry(value: unknown, capturedAt: number): value is Training2048Observation {
  if (!record(value) || !exact(value, entryKeys) || !uuid(value.sourceId) || !time(value.offeredAt)
    || !time(value.updatedAt) || value.updatedAt < value.offeredAt || value.updatedAt > capturedAt
    || !whole(value.validMoves) || value.validMoves > 2_147_483_647) return false
  if (value.status === 'offered') return value.continuationId === null && value.startedAt === null
    && value.firstMoveAt === null && value.closedAt === null && value.validMoves === 0 && value.updatedAt === value.offeredAt
  if (!['active', 'ended', 'interrupted'].includes(String(value.status)) || !uuid(value.continuationId)
    || value.continuationId === value.sourceId || !time(value.startedAt) || value.startedAt < value.offeredAt || value.startedAt > value.updatedAt) return false
  if (value.validMoves === 0 ? value.firstMoveAt !== null : !time(value.firstMoveAt) || value.firstMoveAt < value.startedAt || value.firstMoveAt > value.updatedAt) return false
  return value.status === 'active' ? value.closedAt === null : value.closedAt === value.updatedAt
}

/** Malformed or oversized evidence stays untouched in storage. */
export function readTraining2048Observations(raw: string | null): Training2048Data | null {
  if (raw === null || raw.length > 131_072) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!record(value) || !exact(value, ['version', 'category', 'capturedAt', 'entries', 'truncated', 'observationGap'])
      || value.version !== 1 || !['observed_browser', 'synthetic'].includes(String(value.category)) || !time(value.capturedAt)
      || !Array.isArray(value.entries) || value.entries.length > MAX_TRAINING_2048_OBSERVATIONS
      || typeof value.truncated !== 'boolean' || typeof value.observationGap !== 'boolean') return null
    const identities = new Set<string>()
    for (const entry of value.entries) {
      if (!validEntry(entry, value.capturedAt) || identities.has(entry.sourceId)
        || entry.continuationId !== null && identities.has(entry.continuationId)) return null
      identities.add(entry.sourceId)
      if (entry.continuationId) identities.add(entry.continuationId)
    }
    return { version: 1, category: value.category as Training2048Data['category'], capturedAt: value.capturedAt,
      entries: value.entries.map(entry => ({ ...entry })), truncated: value.truncated, observationGap: value.observationGap }
  } catch { return null }
}

function readEvent(event: unknown): Training2048ObservationEvent | null {
  if (!record(event) || event.type !== 'training' || event.assisted !== true || !record(event.training)
    || !exact(event.training, ['stage', 'sourceId', 'continuationId', 'validMoves'])) return null
  const value = event.training
  if (!['offered', 'started', 'move', 'ended', 'interrupted'].includes(String(value.stage)) || !uuid(value.sourceId)
    || !whole(value.validMoves) || value.validMoves > 2_147_483_647 || value.stage === 'offered' && (value.continuationId !== null || value.validMoves !== 0)
    || value.stage !== 'offered' && (!uuid(value.continuationId) || value.continuationId === value.sourceId)
    || value.stage === 'started' && value.validMoves !== 0) return null
  return { stage: value.stage as Training2048ObservationStage, sourceId: value.sourceId,
    continuationId: value.continuationId as string | null, validMoves: value.validMoves }
}

export class Training2048Observations {
  private data: Training2048Data
  private storageStatus: StorageStatus = 'ready'
  private key: string
  private now: () => number
  constructor(private options: { getStorage: () => ObservationStorage | null; category: Training2048Data['category']; now?: () => number }) {
    this.key = options.category === 'synthetic' ? `${TRAINING_2048_OBSERVATIONS_KEY}.synthetic` : TRAINING_2048_OBSERVATIONS_KEY
    this.now = options.now ?? Date.now
    this.data = { version: 1, category: options.category, capturedAt: 0, entries: [], truncated: false, observationGap: false }
    this.refresh()
  }
  private bound() {
    this.data.entries.sort((a, b) => b.offeredAt - a.offeredAt || a.sourceId.localeCompare(b.sourceId))
    if (this.data.entries.length > MAX_TRAINING_2048_OBSERVATIONS) {
      this.data.entries.length = MAX_TRAINING_2048_OBSERVATIONS; this.data.truncated = true
    }
  }
  private refresh() {
    if (this.storageStatus !== 'ready') return
    try {
      const storage = this.options.getStorage()
      if (!storage) { this.storageStatus = 'unavailable'; return }
      const raw = storage.getItem(this.key)
      if (raw === null) { if (this.data.entries.length) this.data.observationGap = true; return }
      const stored = readTraining2048Observations(raw)
      if (!stored || stored.category !== this.data.category) { this.storageStatus = 'corrupt'; return }
      const entries = new Map(this.data.entries.map(entry => [entry.sourceId, entry]))
      for (const entry of stored.entries) {
        const previous = entries.get(entry.sourceId)
        if (previous?.continuationId && entry.continuationId && previous.continuationId !== entry.continuationId) {
          this.storageStatus = 'corrupt'; this.data.observationGap = true; return
        }
        const stage = (value: Training2048Observation) => value.status === 'offered' ? 0 : value.status === 'active' ? 1 : 2
        if (!previous || stage(entry) >= stage(previous) && (entry.updatedAt > previous.updatedAt
          || entry.updatedAt === previous.updatedAt && (stage(entry) > stage(previous) || entry.validMoves > previous.validMoves))) entries.set(entry.sourceId, entry)
      }
      this.data.entries = [...entries.values()]
      this.data.capturedAt = Math.max(this.data.capturedAt, stored.capturedAt)
      this.data.truncated ||= stored.truncated; this.data.observationGap ||= stored.observationGap
      this.bound()
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
  observe(event: unknown) {
    const value = readEvent(event)
    if (!value) return false
    this.refresh()
    let at: number
    try { at = this.now(); if (!time(at) || at < this.data.capturedAt) throw new Error('Invalid clock') }
    catch { this.data.observationGap = true; return false }
    const entry = this.data.entries.find(entry => entry.sourceId === value.sourceId)
    if (value.stage === 'offered') {
      if (entry || this.data.entries.some(entry => entry.continuationId === value.sourceId)) return false
      this.data.entries.push({ sourceId: value.sourceId, continuationId: null, offeredAt: at, startedAt: null,
        firstMoveAt: null, updatedAt: at, closedAt: null, status: 'offered', validMoves: 0 })
    } else {
      if (!entry) return false
      if (value.stage === 'started') {
        if (entry.status !== 'offered' || this.data.entries.some(item => item.sourceId === value.continuationId || item.continuationId === value.continuationId)) return false
        entry.continuationId = value.continuationId; entry.startedAt = at; entry.status = 'active'
      } else {
        if (entry.status !== 'active' || entry.continuationId !== value.continuationId || value.validMoves < entry.validMoves) return false
        if (value.stage === 'move' && value.validMoves === entry.validMoves) return false
        if (value.validMoves > entry.validMoves + 1 || value.stage !== 'move' && value.validMoves > entry.validMoves) this.data.observationGap = true
        entry.validMoves = value.validMoves
        if (entry.validMoves > 0 && entry.firstMoveAt === null) entry.firstMoveAt = at
        if (value.stage === 'ended' || value.stage === 'interrupted') { entry.status = value.stage; entry.closedAt = at }
      }
      entry.updatedAt = at
    }
    this.data.capturedAt = at; this.bound(); this.save(); return true
  }
  snapshot() {
    this.refresh()
    const entries = this.data.entries.map(entry => ({ ...entry }))
    return { ...this.data, entries, scope: TRAINING_2048_OBSERVATIONS_SCOPE,
      quality: { storageStatus: this.storageStatus, truncated: this.data.truncated, observationGap: this.data.observationGap,
        coverage: this.storageStatus === 'ready' && !this.data.truncated && !this.data.observationGap ? 'local_best_effort' : 'unknown' },
      summary: { retainedOffers: entries.length, retainedStarts: entries.filter(entry => entry.continuationId !== null).length,
        continuationsWithValidMoves: entries.filter(entry => entry.validMoves > 0).length,
        retainedValidMoves: entries.reduce((sum, entry) => sum + entry.validMoves, 0),
        retainedEnds: entries.filter(entry => entry.status === 'ended').length,
        retainedInterruptions: entries.filter(entry => entry.status === 'interrupted').length } }
  }
  exportJson() { return JSON.stringify({ format: 'torneos.2048.training-demonstration-observations', ...this.snapshot() }, null, 2) }
}
