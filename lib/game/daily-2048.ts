import type { Practice2048Event } from './unity-2048-session'

export const DAILY_2048_RULES_VERSION = '2048-daily-v1' as const
export const DAILY_2048_PROGRESS_KEY = 'torneos.2048.daily-progress.v1'
const dayMs = 86_400_000
const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' })
const boundaries = new Map<string, number>()
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const whole = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) < 8_640_000_000_000_000
const tile = (value: unknown): value is number => whole(value) && (value === 0 || value >= 2 && Number.isInteger(Math.log2(value)))
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(value)
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))

function localDay(at: number) {
  const parts = calendar.formatToParts(at)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-')
}
function dayStart(day: string) {
  const cached = boundaries.get(day)
  if (cached !== undefined) return cached
  const nominal = Date.parse(`${day}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !timestamp(nominal) || new Date(nominal).toISOString().slice(0, 10) !== day) throw new RangeError('Invalid challenge day')
  let low = nominal - 2 * dayMs, high = nominal + 2 * dayMs
  // Find the first real instant of the local date, even if 00:00 was skipped.
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2)
    if (localDay(mid) < day) low = mid + 1
    else high = mid
  }
  boundaries.set(day, low)
  if (boundaries.size > 64) boundaries.delete(boundaries.keys().next().value!)
  return low
}
function definitionForDay(day: string, serverNow: number): Daily2048Challenge {
  const nextDay = new Date(Date.parse(`${day}T12:00:00Z`) + dayMs).toISOString().slice(0, 10)
  return { id: `2048-daily:${day}`, day, seed: `${DAILY_2048_RULES_VERSION}:${day}`, startsAt: dayStart(day),
    closesAt: dayStart(nextDay), targetTile: 128, rulesVersion: DAILY_2048_RULES_VERSION, serverNow }
}
export interface Daily2048Challenge {
  id: string
  day: string
  seed: string
  startsAt: number
  closesAt: number
  targetTile: 128
  rulesVersion: typeof DAILY_2048_RULES_VERSION
  serverNow: number
}
export function getDaily2048Challenge(now: number = Date.now()): Daily2048Challenge {
  if (!timestamp(now)) throw new RangeError('Invalid challenge time')
  return definitionForDay(localDay(now), now)
}
export function readDaily2048Challenge(value: unknown): Daily2048Challenge | null {
  if (!record(value) || !exact(value, ['id', 'day', 'seed', 'startsAt', 'closesAt', 'targetTile', 'rulesVersion', 'serverNow']) || !timestamp(value.serverNow)) return null
  try {
    const expected = getDaily2048Challenge(value.serverNow)
    return Object.keys(expected).every(key => value[key] === expected[key as keyof Daily2048Challenge]) ? expected : null
  } catch { return null }
}

type Status = 'active' | 'completed' | 'interrupted' | 'expired'
type Category = 'observed_browser' | 'synthetic'
type Store = Pick<Storage, 'getItem' | 'setItem'>
type StorageStatus = 'ready' | 'invalid' | 'unavailable'
interface Attempt {
  practiceId: string; startedAt: number; updatedAt: number; score: number; highestTile: number; moves: number
  status: Status; goalReachedAt: number | null
}
interface StoredDay { challengeId: string; day: string; attempts: Attempt[] }
interface Ledger { version: 1; rulesVersion: typeof DAILY_2048_RULES_VERSION; category: Category; entries: StoredDay[] }
export interface Daily2048Record {
  challengeId: string; day: string; attempts: number; score: number; highestTile: number
  status: Status; goalReached: boolean; updatedAt: number
}
export interface Daily2048Snapshot { record: Daily2048Record | null; entries: Daily2048Record[]; storageStatus: StorageStatus }

function readLedger(raw: string, category: Category): Ledger | null {
  if (raw.length > 1_000_000) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!record(value) || !exact(value, ['version', 'rulesVersion', 'category', 'entries']) || value.version !== 1
      || value.rulesVersion !== DAILY_2048_RULES_VERSION || value.category !== category || !Array.isArray(value.entries) || value.entries.length > 30) return null
    const days = new Set<string>(), ids = new Set<string>()
    for (const entry of value.entries) {
      if (!record(entry) || !exact(entry, ['challengeId', 'day', 'attempts']) || typeof entry.day !== 'string'
        || !Array.isArray(entry.attempts) || entry.attempts.length === 0 || days.has(entry.day)) return null
      const definition = definitionForDay(entry.day, Date.parse(`${entry.day}T12:00:00Z`))
      if (entry.challengeId !== definition.id) return null
      days.add(entry.day)
      for (const attempt of entry.attempts) {
        if (!record(attempt) || !exact(attempt, ['practiceId', 'startedAt', 'updatedAt', 'score', 'highestTile', 'moves', 'status', 'goalReachedAt'])
          || !identifier(attempt.practiceId) || ids.has(attempt.practiceId) || !timestamp(attempt.startedAt) || !timestamp(attempt.updatedAt)
          || attempt.startedAt < definition.startsAt || attempt.startedAt >= definition.closesAt || attempt.updatedAt < attempt.startedAt
          || !whole(attempt.score) || !tile(attempt.highestTile) || !whole(attempt.moves) || !['active', 'completed', 'interrupted', 'expired'].includes(attempt.status as string)
          || attempt.goalReachedAt !== null && (!timestamp(attempt.goalReachedAt) || attempt.goalReachedAt < attempt.startedAt
            || attempt.goalReachedAt >= definition.closesAt || attempt.goalReachedAt > attempt.updatedAt || attempt.moves === 0 || attempt.highestTile < 128)) return null
        ids.add(attempt.practiceId)
      }
    }
    return value as unknown as Ledger
  } catch { return null }
}
function publicRecord(entry: StoredDay): Daily2048Record {
  // Append order identifies the latest attempt even if two starts share a millisecond.
  const latest = entry.attempts[entry.attempts.length - 1]
  return { challengeId: entry.challengeId, day: entry.day, attempts: entry.attempts.length,
    score: Math.max(...entry.attempts.map(attempt => attempt.score)), highestTile: Math.max(...entry.attempts.map(attempt => attempt.highestTile)),
    status: latest.status, goalReached: entry.attempts.some(attempt => attempt.goalReachedAt !== null), updatedAt: Math.max(...entry.attempts.map(attempt => attempt.updatedAt)) }
}

// Browser observations only: no ranking, financial authority, board or seed is stored.
export class Daily2048Progress {
  private data: Ledger
  private storageStatus: StorageStatus = 'ready'
  private current: { challengeId: string; practiceId: string } | null = null
  private getStorage: () => Store | null
  private now: () => number
  private storageKey: string
  constructor(options: { getStorage: () => Store | null; category?: Category; now?: () => number }) {
    const category = options.category ?? 'observed_browser'
    this.getStorage = options.getStorage; this.now = options.now ?? Date.now
    this.storageKey = category === 'synthetic' ? `${DAILY_2048_PROGRESS_KEY}.synthetic` : DAILY_2048_PROGRESS_KEY
    this.data = { version: 1, rulesVersion: DAILY_2048_RULES_VERSION, category, entries: [] }
    this.refresh(); this.expireAndPrune()
  }
  private refresh() {
    if (this.storageStatus !== 'ready') return
    try {
      const storage = this.getStorage()
      if (!storage) { this.storageStatus = 'unavailable'; return }
      const raw = storage.getItem(this.storageKey)
      if (raw === null) return
      const stored = readLedger(raw, this.data.category)
      if (!stored) { this.storageStatus = 'invalid'; return }
      for (const entry of stored.entries) {
        let day = this.data.entries.find(item => item.challengeId === entry.challengeId)
        if (!day) { day = { ...entry, attempts: [] }; this.data.entries.push(day) }
        for (const attempt of entry.attempts) {
          const previous = day.attempts.find(item => item.practiceId === attempt.practiceId)
          if (!previous) day.attempts.push({ ...attempt })
          else if (previous.status === 'active' && attempt.updatedAt >= previous.updatedAt && attempt.moves >= previous.moves
            && attempt.score >= previous.score && attempt.highestTile >= previous.highestTile) Object.assign(previous, attempt)
        }
      }
    } catch { this.storageStatus = 'unavailable' }
  }
  private save() {
    if (this.storageStatus !== 'ready') return
    try {
      const storage = this.getStorage()
      if (!storage) { this.storageStatus = 'unavailable'; return }
      storage.setItem(this.storageKey, JSON.stringify(this.data))
    } catch { this.storageStatus = 'unavailable' }
  }
  private expireAndPrune() {
    const now = this.now()
    if (!timestamp(now)) return
    const today = localDay(now), cutoff = Date.parse(`${today}T12:00:00Z`) - 29 * dayMs
    const previous = this.data.entries.length
    // A clock correction must not delete saved days that now appear to be in the future.
    if (this.data.entries.some(entry => entry.day > today)) return
    this.data.entries = this.data.entries.filter(entry => Date.parse(`${entry.day}T12:00:00Z`) >= cutoff)
    let changed = previous !== this.data.entries.length
    for (const day of this.data.entries) {
      const closesAt = definitionForDay(day.day, now).closesAt
      for (const attempt of day.attempts) if (attempt.status === 'active' && now >= closesAt) {
        attempt.status = 'expired'; attempt.updatedAt = Math.max(attempt.updatedAt, closesAt); changed = true
      }
    }
    if (changed) this.save()
  }
  snapshot(dayOrId?: string): Daily2048Snapshot {
    this.expireAndPrune()
    const selected = dayOrId ?? getDaily2048Challenge(this.now()).id
    const entries = this.data.entries.map(publicRecord).sort((a, b) => b.day.localeCompare(a.day))
    return { record: entries.find(entry => entry.challengeId === selected || entry.day === selected) ?? null, entries, storageStatus: this.storageStatus }
  }
  begin(challenge: Daily2048Challenge, practiceId: string): Daily2048Snapshot {
    const definition = readDaily2048Challenge(challenge), now = this.now()
    this.refresh(); this.expireAndPrune()
    if (!definition || !identifier(practiceId) || !timestamp(now) || now < definition.startsAt || now >= definition.closesAt) {
      this.current = null
      return this.snapshot(challenge?.id)
    }
    const known = this.data.entries.flatMap(entry => entry.attempts.map(attempt => ({ challengeId: entry.challengeId, attempt }))).find(item => item.attempt.practiceId === practiceId)
    if (known && known.challengeId !== definition.id) { this.current = null; return this.snapshot(definition.id) }
    let day = this.data.entries.find(entry => entry.challengeId === definition.id)
    if (!day) { day = { challengeId: definition.id, day: definition.day, attempts: [] }; this.data.entries.push(day) }
    if (!known) {
      if (this.current) {
        const previous = this.data.entries.find(entry => entry.challengeId === this.current!.challengeId)?.attempts.find(attempt => attempt.practiceId === this.current!.practiceId)
        if (previous?.status === 'active') { previous.status = 'interrupted'; previous.updatedAt = Math.max(previous.updatedAt, now) }
      }
      day.attempts.push({ practiceId, startedAt: now, updatedAt: now, score: 0, highestTile: 0, moves: 0, status: 'active', goalReachedAt: null })
    }
    this.current = { challengeId: definition.id, practiceId }; this.save()
    return this.snapshot(definition.id)
  }
  observe(event: Practice2048Event & { assisted?: boolean }): Daily2048Snapshot {
    this.refresh(); this.expireAndPrune()
    if (!this.current) return this.snapshot()
    const day = this.data.entries.find(entry => entry.challengeId === this.current!.challengeId)
    const attempt = day?.attempts.find(item => item.practiceId === this.current!.practiceId), now = this.now()
    if (!day || !attempt || attempt.status !== 'active' || !timestamp(now) || now < attempt.updatedAt) return this.snapshot(this.current.challengeId)
    if (!record(event) || !['start', 'move', 'end', 'interrupted'].includes(event.type) || !whole(event.score) || !tile(event.highestTile)
      || !whole(event.moves) || event.assisted !== undefined && typeof event.assisted !== 'boolean') return this.snapshot(day.challengeId)
    if (event.assisted) { attempt.status = 'interrupted'; attempt.updatedAt = now; this.current = null; this.save(); return this.snapshot(day.challengeId) }
    if (event.type === 'move') {
      if (event.moves <= attempt.moves || event.score < attempt.score || event.highestTile < attempt.highestTile) return this.snapshot(day.challengeId)
      attempt.score = event.score; attempt.highestTile = event.highestTile; attempt.moves = event.moves
      if (event.highestTile >= 128 && attempt.goalReachedAt === null) attempt.goalReachedAt = now
    } else if (event.type === 'start') {
      if (attempt.moves !== 0 || event.moves !== 0 || event.score !== 0) return this.snapshot(day.challengeId)
      attempt.highestTile = Math.max(attempt.highestTile, event.highestTile)
    } else attempt.status = event.type === 'end' ? 'completed' : 'interrupted'
    attempt.updatedAt = now; this.save()
    return this.snapshot(day.challengeId)
  }
}
