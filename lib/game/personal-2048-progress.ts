// Private browser progress only. These marks never establish competitive results.
export const PERSONAL_2048_PROGRESS_KEY = 'torneos.2048.personal-progress.v1'
export const PERSONAL_2048_RULES_VERSION = '2048-practice-v1'

export type Personal2048Storage = Pick<Storage, 'getItem' | 'setItem'>
export type Personal2048StorageStatus = 'ready' | 'invalid' | 'unavailable'
export interface Personal2048Entry {
  practiceId: string
  startedAt: number
  updatedAt: number
  rulesVersion: string
  score: number
  highestTile: number
  moves: number
  status: 'active' | 'completed' | 'interrupted'
  assisted: boolean
}
interface Personal2048Data {
  version: 1
  rulesVersion: string
  bestScore: number
  bestTile: number
  history: Personal2048Entry[]
}
export interface Personal2048Snapshot extends Personal2048Data {
  storageStatus: Personal2048StorageStatus
}

const entryKeys = ['practiceId', 'startedAt', 'updatedAt', 'rulesVersion', 'score', 'highestTile', 'moves', 'status', 'assisted']
const dataKeys = ['version', 'rulesVersion', 'bestScore', 'bestTile', 'history']
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const keysMatch = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const whole = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const time = (value: unknown): value is number => whole(value) && value <= 8_640_000_000_000_000
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/.test(value)
const tile = (value: unknown): value is number => whole(value) && (value === 0 || value >= 2 && Number.isInteger(Math.log2(value)))

function validEntry(value: unknown): value is Personal2048Entry {
  return record(value) && keysMatch(value, entryKeys)
    && identifier(value.practiceId) && identifier(value.rulesVersion)
    && time(value.startedAt) && time(value.updatedAt) && value.updatedAt >= value.startedAt
    && whole(value.score) && tile(value.highestTile) && whole(value.moves)
    && ['active', 'completed', 'interrupted'].includes(value.status as string)
    && typeof value.assisted === 'boolean'
}

function empty(rulesVersion: string): Personal2048Data {
  return { version: 1, rulesVersion, bestScore: 0, bestTile: 0, history: [] }
}

function read(raw: string, rulesVersion: string): Personal2048Data | null {
  if (raw.length > 16_384) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!record(value) || !keysMatch(value, dataKeys) || value.version !== 1 || value.rulesVersion !== rulesVersion
      || !whole(value.bestScore) || !tile(value.bestTile) || !Array.isArray(value.history) || value.history.length > 5) return null
    const ids = new Set<string>()
    for (const entry of value.history) {
      if (!validEntry(entry) || entry.assisted || entry.rulesVersion !== rulesVersion || ids.has(entry.practiceId)
        || entry.score > value.bestScore || entry.highestTile > value.bestTile) return null
      ids.add(entry.practiceId)
    }
    return { version: 1, rulesVersion, bestScore: value.bestScore, bestTile: value.bestTile,
      history: (value.history as Personal2048Entry[]).map(entry => ({ ...entry })) }
  } catch { return null }
}

function canUpdate(previous: Personal2048Entry, next: Personal2048Entry) {
  return previous.status !== 'completed' && previous.startedAt === next.startedAt && previous.rulesVersion === next.rulesVersion
    && next.updatedAt >= previous.updatedAt && next.moves >= previous.moves
    && next.score >= previous.score && next.highestTile >= previous.highestTile
}

function recent(entries: Personal2048Entry[]) {
  return entries.sort((a, b) => b.startedAt - a.startedAt || b.updatedAt - a.updatedAt || a.practiceId.localeCompare(b.practiceId)).slice(0, 5)
}

export class Personal2048Progress {
  private data: Personal2048Data
  private storageStatus: Personal2048StorageStatus = 'ready'

  constructor(private getStorage: () => Personal2048Storage | null, private rulesVersion = PERSONAL_2048_RULES_VERSION,
    private storageKey = PERSONAL_2048_PROGRESS_KEY) {
    this.data = empty(rulesVersion)
    this.refresh()
  }

  snapshot(): Personal2048Snapshot {
    return { ...this.data, history: this.data.history.map(entry => ({ ...entry })), storageStatus: this.storageStatus }
  }
  latest() { this.refresh(); return this.snapshot() }

  private refresh() {
    if (this.storageStatus !== 'ready') return
    try {
      const storage = this.getStorage()
      if (!storage) { this.storageStatus = 'unavailable'; return }
      const raw = storage.getItem(this.storageKey)
      if (raw === null) return
      const stored = read(raw, this.rulesVersion)
      if (!stored) { this.storageStatus = 'invalid'; return }
      // Re-read before writing so sequential tabs preserve each other's marks.
      const entries = new Map(this.data.history.map(entry => [entry.practiceId, entry]))
      for (const entry of stored.history) {
        const previous = entries.get(entry.practiceId)
        if (!previous || canUpdate(previous, entry)) entries.set(entry.practiceId, entry)
      }
      this.data = { ...this.data, bestScore: Math.max(this.data.bestScore, stored.bestScore),
        bestTile: Math.max(this.data.bestTile, stored.bestTile), history: recent([...entries.values()]) }
    } catch { this.storageStatus = 'unavailable' }
  }

  upsert(entry: Personal2048Entry): Personal2048Snapshot {
    // Assistance has its own continuation; it cannot rewrite the original mark.
    if (!validEntry(entry) || entry.assisted || entry.rulesVersion !== this.rulesVersion) return this.snapshot()
    this.refresh()
    const previous = this.data.history.find(item => item.practiceId === entry.practiceId)
    if (previous && !canUpdate(previous, entry)) return this.snapshot()
    this.data = { ...this.data, bestScore: Math.max(this.data.bestScore, entry.score), bestTile: Math.max(this.data.bestTile, entry.highestTile),
      history: recent([...this.data.history.filter(item => item.practiceId !== entry.practiceId), { ...entry }]) }
    if (this.storageStatus === 'ready') {
      try {
        const storage = this.getStorage()
        if (!storage) this.storageStatus = 'unavailable'
        else storage.setItem(this.storageKey, JSON.stringify(this.data))
      } catch { this.storageStatus = 'unavailable' }
    }
    return this.snapshot()
  }
}
