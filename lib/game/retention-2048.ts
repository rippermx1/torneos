/** Qualified play days in this browser only; never players or global retention. */
export const RETENTION_2048_STORAGE_KEY = 'torneos.2048.retention.v1'
export const MAX_2048_RETENTION_DAYS = 180
export const RETENTION_2048_TIME_ZONE = 'America/Santiago'
export type Retention2048Category = 'observed_browser' | 'synthetic'
export type Retention2048Mode = 'practice' | 'daily'
type LocalStorage = Pick<Storage, 'getItem' | 'setItem'>
type StorageStatus = 'ready' | 'unavailable' | 'corrupt'

interface RetentionData {
  version: 1
  category: Retention2048Category
  firstDay: string | null
  daysPlayed: string[]
  truncated: boolean
  observationGap: boolean
}
export interface Retention2048Return {
  targetDay: string | null
  status: 'returned' | 'not_returned' | 'pending' | 'unknown'
  matured: boolean
  returnObserved: boolean
}
export interface Retention2048Snapshot extends RetentionData {
  scope: 'Días de juego observados en este navegador; no jugadores ni retención global.'
  today: string | null
  lastDay: string | null
  daysPlayedCount: number
  d1: Retention2048Return
  d7: Retention2048Return
  quality: { storageStatus: StorageStatus; truncated: boolean; observationGap: boolean; coverage: 'local_best_effort' | 'unknown' }
}

const modes = ['practice', 'daily'] as const
const categories = ['observed_browser', 'synthetic'] as const
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: RETENTION_2048_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
})
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const dayIsValid = (day: unknown): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
  && Number.isFinite(Date.parse(`${day}T12:00:00.000Z`)) && new Date(`${day}T12:00:00.000Z`).toISOString().slice(0, 10) === day

function santiagoDay(at: number) {
  if (!Number.isSafeInteger(at) || at < 0 || at > 253402300799999) throw new Error('Reloj local inválido.')
  const parts = dateFormatter.formatToParts(at)
  return `${parts.find(part => part.type === 'year')!.value.padStart(4, '0')}-${parts.find(part => part.type === 'month')!.value}-${parts.find(part => part.type === 'day')!.value}`
}
function addCalendarDays(day: string, count: number) {
  const date = new Date(`${day}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}
function empty(category: Retention2048Category): RetentionData {
  return { version: 1, category, firstDay: null, daysPlayed: [], truncated: false, observationGap: false }
}
function read(raw: string, category: Retention2048Category): RetentionData {
  if (raw.length > 8192) throw new Error('Registro de días demasiado grande.')
  const value: unknown = JSON.parse(raw)
  const keys = ['version', 'category', 'firstDay', 'daysPlayed', 'truncated', 'observationGap']
  if (!record(value) || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))
    || value.version !== 1 || value.category !== category || typeof value.truncated !== 'boolean' || typeof value.observationGap !== 'boolean'
    || !Array.isArray(value.daysPlayed)) {
    throw new Error('Registro de días inválido.')
  }
  const days = value.daysPlayed
  if (days.length > MAX_2048_RETENTION_DAYS || !days.every(dayIsValid) || new Set(days).size !== days.length
    || days.some((day, index) => index > 0 && day <= days[index - 1])
    || (days.length === 0 ? value.firstDay !== null || value.truncated
      : !dayIsValid(value.firstDay) || value.firstDay > days[0] || !value.truncated && value.firstDay !== days[0])) {
    throw new Error('Registro de días inválido.')
  }
  return { version: 1, category, firstDay: value.firstDay as string | null, daysPlayed: [...days] as string[],
    truncated: value.truncated, observationGap: value.observationGap }
}

export class Retention2048 {
  private data: RetentionData
  private storageStatus: StorageStatus = 'ready'
  private sawStored = false
  private lastPersisted: string | null = null
  private storageKey: string
  private now: () => number
  constructor(private options: { getStorage: () => LocalStorage | null; category: Retention2048Category; now?: () => number }) {
    this.data = empty(options.category)
    this.storageKey = `${RETENTION_2048_STORAGE_KEY}${options.category === 'synthetic' ? '.synthetic' : ''}`
    this.now = options.now ?? Date.now
    if (!categories.includes(options.category)) this.storageStatus = 'corrupt'
    this.refresh()
  }
  private refresh() {
    if (this.storageStatus !== 'ready') return
    let raw: string | null
    try {
      const storage = this.options.getStorage()
      if (!storage) { this.storageStatus = 'unavailable'; return }
      raw = storage.getItem(this.storageKey)
    } catch { this.storageStatus = 'unavailable'; return }
    if (raw === null) { if (this.sawStored) this.data.observationGap = true; return }
    try {
      const stored = read(raw, this.options.category)
      this.sawStored = true
      this.lastPersisted = raw
      const days = [...new Set([...this.data.daysPlayed, ...stored.daysPlayed])].sort()
      this.data = { version: 1, category: this.options.category,
        firstDay: [this.data.firstDay, stored.firstDay].filter((day): day is string => day !== null).sort()[0] ?? null,
        daysPlayed: days.slice(-MAX_2048_RETENTION_DAYS),
        truncated: this.data.truncated || stored.truncated || days.length > MAX_2048_RETENTION_DAYS,
        observationGap: this.data.observationGap || stored.observationGap }
    } catch { this.storageStatus = 'corrupt' }
  }
  private today() {
    try { return santiagoDay(this.now()) } catch { this.data.observationGap = true; return null }
  }
  /** Call only for a first confirmed, valid move in an unassisted practice/daily. */
  recordPlay(mode: Retention2048Mode): Retention2048Snapshot {
    if (!modes.includes(mode)) return this.snapshot()
    this.refresh()
    const today = this.today()
    if (today !== null) {
      const lastDay = this.data.daysPlayed.at(-1)
      if (lastDay && today < lastDay) this.data.observationGap = true
      else if (!this.data.daysPlayed.includes(today)) {
        this.data.firstDay ??= today
        this.data.daysPlayed.push(today)
        if (this.data.daysPlayed.length > MAX_2048_RETENTION_DAYS) {
          this.data.daysPlayed = this.data.daysPlayed.slice(-MAX_2048_RETENTION_DAYS)
          this.data.truncated = true
        }
      }
    }
    if (this.storageStatus === 'ready') {
      const raw = JSON.stringify(this.data)
      if (raw !== this.lastPersisted) {
        try {
          const storage = this.options.getStorage()
          if (!storage) this.storageStatus = 'unavailable'
          else { storage.setItem(this.storageKey, raw); this.lastPersisted = raw; this.sawStored = true }
        } catch { this.storageStatus = 'unavailable' }
      }
    }
    return this.view(today)
  }
  private view(today: string | null): Retention2048Snapshot {
    const lastDay = this.data.daysPlayed.at(-1) ?? null
    if (today !== null && lastDay !== null && today < lastDay) this.data.observationGap = true
    const unknown = this.options.category !== 'observed_browser' || this.storageStatus !== 'ready'
      || this.data.truncated || this.data.observationGap || today === null
    const returned = (offset: number): Retention2048Return => {
      const targetDay = this.data.firstDay === null ? null : addCalendarDays(this.data.firstDay, offset)
      const matured = targetDay !== null && today !== null && today > targetDay
      const returnObserved = targetDay !== null && this.data.daysPlayed.includes(targetDay)
      return { targetDay, matured, returnObserved, status: unknown || targetDay === null ? 'unknown'
        : !matured ? 'pending' : returnObserved ? 'returned' : 'not_returned' }
    }
    return { ...this.data, daysPlayed: [...this.data.daysPlayed],
      scope: 'Días de juego observados en este navegador; no jugadores ni retención global.',
      today, lastDay, daysPlayedCount: this.data.daysPlayed.length, d1: returned(1), d7: returned(7),
      quality: { storageStatus: this.storageStatus, truncated: this.data.truncated, observationGap: this.data.observationGap,
        coverage: unknown ? 'unknown' : 'local_best_effort' } }
  }
  snapshot(): Retention2048Snapshot { this.refresh(); return this.view(this.today()) }
}

export type Player2048ActivityResult = { status: 'recorded' | 'anonymous' | 'unavailable' | 'skipped' }
/** Best effort only: no IDs, dates, queued backfill or retries leave the client. */
export async function reportPlayer2048Activity(mode: Retention2048Mode, options: {
  category: Retention2048Category; fetcher?: typeof fetch; timeoutMs?: number
}): Promise<Player2048ActivityResult> {
  if (options.category !== 'observed_browser' || !modes.includes(mode)) return { status: 'skipped' }
  const controller = new AbortController()
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs! >= 1 && options.timeoutMs! <= 30_000 ? options.timeoutMs! : 8000
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Activity timeout')) }, timeoutMs)
    })
    const response = await Promise.race([(options.fetcher ?? fetch)('/api/2048/activity', {
      method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }), signal: controller.signal,
    }), timeout])
    return { status: response.status === 200 ? 'recorded' : response.status === 401 ? 'anonymous' : 'unavailable' }
  } catch { return { status: 'unavailable' } }
  finally { if (timer !== undefined) clearTimeout(timer) }
}
