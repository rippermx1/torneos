import runtimeBuilds from './runtime-builds.json'

export const LOAD_2048_DIAGNOSTICS_KEY = 'torneos.2048.load-diagnostics.v1'
export const MAX_2048_LOAD_ATTEMPTS = 200
export const MAX_2048_LOAD_DIAGNOSTICS_BYTES = 262_144
export type Load2048Category = 'observed_browser' | 'synthetic'
export type Load2048StorageStatus = 'ready' | 'unavailable' | 'corrupt' | 'conflict'
export interface Load2048Attempt {
  id: string
  build: string
  startedAt: number
  result: 'loading' | 'ready' | 'error' | 'timeout' | 'inconclusive'
  durationMs: number | null
  practiceId: string | null
  entry: 'new' | 'resumed' | null
  mode: 'practice' | 'daily' | null
  entryAt: number | null
  retryOf: string | null
}
export interface Load2048DiagnosticsSnapshot {
  format: 'torneos.2048.load-diagnostics'
  version: 1
  category: Load2048Category
  entries: Load2048Attempt[]
  truncated: boolean
  observationGap: boolean
  storageStatus: Load2048StorageStatus
  capturedAt: number
}
type LocalStorage = Pick<Storage, 'getItem' | 'setItem'>
type Data = Omit<Load2048DiagnosticsSnapshot, 'storageStatus'>
const format = 'torneos.2048.load-diagnostics' as const
const statuses = ['ready', 'unavailable', 'corrupt', 'conflict'] as const
const results = ['loading', 'ready', 'error', 'timeout', 'inconclusive'] as const
const category = (value: unknown): value is Load2048Category => value === 'observed_browser' || value === 'synthetic'
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)
const time = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799999
const exact = (value: unknown, fields: readonly string[]): value is Record<string, unknown> => !!value && typeof value === 'object'
  && !Array.isArray(value) && Reflect.ownKeys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field))
const member = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && values.includes(value as T)
const boundedRaw = (raw: string) => raw.length <= MAX_2048_LOAD_DIAGNOSTICS_BYTES && new TextEncoder().encode(raw).byteLength <= MAX_2048_LOAD_DIAGNOSTICS_BYTES
const cloneEntry = (entry: Load2048Attempt): Load2048Attempt => ({ ...entry })
const sortEntries = (entries: Load2048Attempt[]) => entries.sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))

/** Strict facts only: no external summary, free text, error payload or gameplay state. */
export function readLoad2048Diagnostics(raw: string | null): Load2048DiagnosticsSnapshot | null {
  try {
    if (typeof raw !== 'string' || !boundedRaw(raw)) return null
    const value: unknown = JSON.parse(raw)
    if (!exact(value, ['format', 'version', 'category', 'entries', 'truncated', 'observationGap', 'storageStatus', 'capturedAt'])
      || value.format !== format || value.version !== 1 || !category(value.category) || !time(value.capturedAt)
      || typeof value.truncated !== 'boolean' || typeof value.observationGap !== 'boolean' || !member(statuses, value.storageStatus)
      || !Array.isArray(value.entries) || value.entries.length > MAX_2048_LOAD_ATTEMPTS) return null
    const entries: Load2048Attempt[] = [], seen = new Set<string>()
    for (const row of value.entries) {
      if (!exact(row, ['id', 'build', 'startedAt', 'result', 'durationMs', 'practiceId', 'entry', 'mode', 'entryAt', 'retryOf'])
        || !uuid(row.id) || seen.has(row.id.toLowerCase()) || typeof row.build !== 'string' || !/^unity-2048-\d{3,6}$/.test(row.build)
        || !time(row.startedAt) || row.startedAt > value.capturedAt || !member(results, row.result)
        || row.durationMs !== null && (!Number.isSafeInteger(row.durationMs) || Number(row.durationMs) < 0 || Number(row.durationMs) > value.capturedAt - row.startedAt)
        || row.result === 'loading' && row.durationMs !== null || row.retryOf !== null && !uuid(row.retryOf)) return null
      const linked = row.practiceId !== null || row.entry !== null || row.mode !== null || row.entryAt !== null
      if (linked && (row.result !== 'ready' || !uuid(row.practiceId) || row.entry !== 'new' && row.entry !== 'resumed'
        || row.mode !== 'practice' && row.mode !== 'daily' || !time(row.entryAt) || row.entryAt < row.startedAt || row.entryAt > value.capturedAt
        || row.durationMs !== null && Number(row.durationMs) > row.entryAt - row.startedAt)) return null
      const id = row.id.toLowerCase(), retryOf = typeof row.retryOf === 'string' ? row.retryOf.toLowerCase() : null
      if (retryOf === id) return null
      seen.add(id)
      entries.push({ id, build: row.build, startedAt: row.startedAt, result: row.result, durationMs: row.durationMs as number | null,
        practiceId: typeof row.practiceId === 'string' ? row.practiceId.toLowerCase() : null,
        entry: row.entry as Load2048Attempt['entry'], mode: row.mode as Load2048Attempt['mode'], entryAt: row.entryAt as number | null, retryOf })
    }
    const byId = new Map(entries.map(entry => [entry.id, entry]))
    for (const entry of entries) {
      const path = new Set([entry.id])
      let child = entry
      while (child.retryOf) {
        if (path.has(child.retryOf)) return null
        path.add(child.retryOf)
        const parent = byId.get(child.retryOf)
        if (!parent) { if (!value.truncated && !value.observationGap) return null; break }
        if (parent.startedAt > child.startedAt) return null
        child = parent
      }
    }
    return { format, version: 1, category: value.category, capturedAt: value.capturedAt, entries: sortEntries(entries),
      truncated: value.truncated, observationGap: value.observationGap, storageStatus: value.storageStatus }
  } catch { return null }
}

function mergeEntry(a: Load2048Attempt, b: Load2048Attempt): Load2048Attempt | null {
  if (a.id !== b.id || a.build !== b.build || a.startedAt !== b.startedAt || a.retryOf !== b.retryOf) return null
  if (a.result !== 'loading' && b.result !== 'loading' && (a.result !== b.result || a.durationMs !== b.durationMs)) return null
  const terminal = a.result === 'loading' ? b : a
  if (a.practiceId !== null && b.practiceId !== null
    && (a.practiceId !== b.practiceId || a.entry !== b.entry || a.mode !== b.mode || a.entryAt !== b.entryAt)) return null
  const linked = a.practiceId !== null ? a : b
  return { ...terminal, practiceId: linked.practiceId, entry: linked.entry, mode: linked.mode, entryAt: linked.entryAt }
}

/** One instance observes one capsule attempt; it never starts a game or records gameplay activity. */
export class Load2048Diagnostics {
  private data: Data
  private status: Load2048StorageStatus = 'ready'
  private readonly key: string
  private readonly now: () => number
  private readonly monotonicNow: () => number
  private id: string | null = null
  private monotonicStart: number | null = null
  private lastWall: number | null = null
  private dirty = new Set<string>()
  private lastRead: string | null = null
  private sawStored = false

  constructor(private options: {
    getStorage: () => LocalStorage | null
    category: Load2048Category
    now?: () => number
    monotonicNow?: () => number
    uuid?: () => string
    changed?: (snapshot: Load2048DiagnosticsSnapshot) => void
  }) {
    const safeCategory = category(options.category) ? options.category : 'synthetic'
    this.key = `${LOAD_2048_DIAGNOSTICS_KEY}${safeCategory === 'synthetic' ? '.synthetic' : ''}`
    this.now = options.now ?? Date.now
    this.monotonicNow = options.monotonicNow ?? (() => typeof performance === 'undefined' ? NaN : performance.now())
    this.data = { format, version: 1, category: safeCategory, capturedAt: 0, entries: [], truncated: false, observationGap: false }
    if (!category(options.category)) this.failStorage('corrupt')
  }
  currentId() { return this.id }
  private wall() {
    try {
      const at = this.now()
      if (!time(at)) throw new Error('clock')
      if (at < this.data.capturedAt || this.lastWall !== null && at < this.lastWall) this.data.observationGap = true
      this.lastWall = at; this.data.capturedAt = Math.max(this.data.capturedAt, at)
      return at
    } catch { this.data.observationGap = true; return null }
  }
  private monotonic() {
    try { const at = this.monotonicNow(); if (Number.isFinite(at) && at >= 0 && at <= Number.MAX_SAFE_INTEGER) return at } catch { /* Unknown duration. */ }
    this.data.observationGap = true; return null
  }
  private bound() {
    sortEntries(this.data.entries)
    if (this.data.entries.length > MAX_2048_LOAD_ATTEMPTS) { this.data.entries = this.data.entries.slice(-MAX_2048_LOAD_ATTEMPTS); this.data.truncated = true }
  }
  private failStorage(status: Exclude<Load2048StorageStatus, 'ready'>) {
    this.status = status; this.data.observationGap = true
  }
  private merge(stored: Load2048DiagnosticsSnapshot) {
    if (stored.category !== this.data.category) { this.failStorage('corrupt'); return false }
    const entries = new Map(stored.entries.map(entry => [entry.id, cloneEntry(entry)]))
    for (const local of this.data.entries) {
      const previous = entries.get(local.id)
      if (previous) {
        const merged = mergeEntry(local, previous)
        if (!merged) { this.failStorage('conflict'); return false }
        entries.set(local.id, merged)
      } else if (this.dirty.has(local.id)) entries.set(local.id, cloneEntry(local))
      else if (!stored.truncated) this.data.observationGap = true
    }
    this.data.entries = [...entries.values()]
    this.data.capturedAt = Math.max(this.data.capturedAt, stored.capturedAt)
    this.data.truncated ||= stored.truncated
    this.data.observationGap ||= stored.observationGap || stored.storageStatus !== 'ready'
    this.bound(); return true
  }
  private refresh() {
    if (this.status !== 'ready') return
    try {
      const storage = this.options.getStorage()
      if (!storage) { this.failStorage('unavailable'); return }
      const raw = storage.getItem(this.key)
      this.lastRead = raw
      if (raw === null) { if (this.sawStored) this.data.observationGap = true; return }
      const stored = readLoad2048Diagnostics(raw)
      if (!stored) { this.failStorage('corrupt'); return }
      this.sawStored = true; this.merge(stored)
    } catch { this.failStorage('unavailable') }
  }
  private persist() {
    for (let attempt = 0; attempt < 3 && this.status === 'ready'; attempt++) {
      this.refresh()
      if (this.status !== 'ready') return
      try {
        const storage = this.options.getStorage()
        if (!storage) { this.failStorage('unavailable'); return }
        // Re-read before mutation so an observable interleaving is merged, not overwritten.
        if (storage.getItem(this.key) !== this.lastRead) continue
        this.bound()
        const raw = JSON.stringify({ ...this.data, storageStatus: 'ready' })
        if (!boundedRaw(raw) || !readLoad2048Diagnostics(raw)) { this.failStorage('conflict'); return }
        storage.setItem(this.key, raw)
        const actual = storage.getItem(this.key)
        if (actual === raw) { this.sawStored = true; this.lastRead = raw; this.dirty.clear(); return }
        if (actual === null || actual === this.lastRead) { this.failStorage('unavailable'); return }
        const concurrent = readLoad2048Diagnostics(actual)
        if (!concurrent) { this.failStorage('corrupt'); return }
        if (!this.merge(concurrent)) return
      } catch { this.failStorage('unavailable'); return }
    }
    if (this.status === 'ready') this.failStorage('conflict')
  }
  private emit() { try { this.options.changed?.(this.snapshot()) } catch { /* Diagnostics cannot stop loading/gameplay. */ } }
  private current() { return this.data.entries.find(entry => entry.id === this.id) }
  begin(retryOf: string | null = null): string | null {
    if (this.id) return this.id
    if (!category(this.options.category)) { this.emit(); return null }
    this.refresh()
    const at = this.wall()
    let id: string
    try { id = (this.options.uuid ?? (() => crypto.randomUUID()))() } catch { this.data.observationGap = true; this.emit(); return null }
    if (at === null || !uuid(id) || retryOf !== null && !uuid(retryOf) || this.data.entries.some(entry => entry.id === id.toLowerCase())
      || retryOf?.toLowerCase() === id.toLowerCase()) { this.data.observationGap = true; this.emit(); return null }
    const retry = retryOf?.toLowerCase() ?? null
    const previous = retry ? this.data.entries.find(entry => entry.id === retry) : null
    if (previous && previous.startedAt > at) { this.data.observationGap = true; this.emit(); return null }
    if (retry && !previous) this.data.observationGap = true
    this.id = id.toLowerCase(); this.monotonicStart = this.monotonic()
    this.data.entries.push({ id: this.id, build: runtimeBuilds['2048'], startedAt: at, result: 'loading', durationMs: null,
      practiceId: null, entry: null, mode: null, entryAt: null, retryOf: retry })
    this.dirty.add(this.id); this.persist(); this.emit(); return this.id
  }
  private finish(result: Exclude<Load2048Attempt['result'], 'loading'>) {
    this.refresh()
    const entry = this.current()
    if (!entry || entry.result !== 'loading') return false
    // Start samples wall then monotonic; finish in reverse order to keep rounded
    // monotonic elapsed time inside the enclosing wall-clock interval.
    const mono = this.monotonic(), at = this.wall()
    let duration: number | null = null
    if (at !== null && at >= entry.startedAt && mono !== null && this.monotonicStart !== null && mono >= this.monotonicStart) {
      const elapsed = Math.floor(mono - this.monotonicStart)
      if (Number.isSafeInteger(elapsed) && elapsed <= at - entry.startedAt) duration = elapsed
    }
    if (duration === null) this.data.observationGap = true
    entry.result = result; entry.durationMs = duration
    this.dirty.add(entry.id); this.persist(); this.emit(); return true
  }
  ready() { return this.finish('ready') }
  fail(result: 'error' | 'timeout') { return result === 'error' || result === 'timeout' ? this.finish(result) : false }
  leave() { return this.finish('inconclusive') }
  linkPractice(id: string, entry: 'new' | 'resumed', mode: 'practice' | 'daily') {
    if (!uuid(id) || entry !== 'new' && entry !== 'resumed' || mode !== 'practice' && mode !== 'daily') return false
    this.refresh()
    const attempt = this.current()
    if (!attempt || attempt.result !== 'ready' || attempt.practiceId !== null) return false
    const at = this.wall()
    if (at === null || at < attempt.startedAt || attempt.durationMs !== null && attempt.durationMs > at - attempt.startedAt) { this.data.observationGap = true; this.emit(); return false }
    attempt.practiceId = id.toLowerCase(); attempt.entry = entry; attempt.mode = mode; attempt.entryAt = at
    this.dirty.add(attempt.id); this.persist(); this.emit(); return true
  }
  snapshot(): Load2048DiagnosticsSnapshot {
    this.refresh(); this.wall(); this.bound()
    return { ...this.data, entries: this.data.entries.map(cloneEntry), storageStatus: this.status }
  }
  exportJson() { return JSON.stringify(this.snapshot(), null, 2) }
}
