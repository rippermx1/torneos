import { Game2048 } from './engine'
import type { LocalPracticeState } from './local-practice'
import { PERSONAL_2048_RULES_VERSION } from './personal-2048-progress'

/** Private recovery state only. Never include it in analytics or official results. */
export const PRACTICE_2048_CHECKPOINT_KEY = 'torneos.2048.practice-checkpoint.v1'
export const MAX_2048_PRACTICE_CHECKPOINT_BYTES = 16_384
export type Practice2048CheckpointCategory = 'observed_browser' | 'synthetic'
export type Practice2048CheckpointStatus = 'ready' | 'invalid' | 'unavailable' | 'conflict'
export type Practice2048CheckpointStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface Saved2048Practice {
  version: 1
  rulesVersion: typeof PERSONAL_2048_RULES_VERSION
  category: Practice2048CheckpointCategory
  practiceId: string
  startedAt: number
  savedAt: number
  bestBefore: number
  state: LocalPracticeState
}
export interface Practice2048CheckpointSnapshot {
  status: Practice2048CheckpointStatus
  checkpoint: Saved2048Practice | null
}

const keys = ['version', 'rulesVersion', 'category', 'practiceId', 'startedAt', 'savedAt', 'bestBefore', 'state']
const stateKeys = ['board', 'score', 'seed', 'moveNumber']
const categoryValid = (value: unknown): value is Practice2048CheckpointCategory => value === 'observed_browser' || value === 'synthetic'
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const time = (value: unknown): value is number => integer(value) && value <= 8_640_000_000_000_000
const token = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/.test(value)
function exact(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const own = Reflect.ownKeys(value)
  return own.length === expected.length && expected.every(key => Object.hasOwn(value, key))
}
function four(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length === 4 && Reflect.ownKeys(value).length === 5
    && [0, 1, 2, 3].every(index => Object.hasOwn(value, index))
}
function clone(value: Saved2048Practice): Saved2048Practice {
  return { ...value, state: { ...value.state, board: value.state.board.map(row => [...row]) } }
}
function boundedRaw(value: string) {
  return value.length <= MAX_2048_PRACTICE_CHECKPOINT_BYTES
    && new TextEncoder().encode(value).byteLength <= MAX_2048_PRACTICE_CHECKPOINT_BYTES
}

/** Validation is structural, not proof of unassisted play. The session must enforce its mode. */
export function parseSaved2048Practice(value: unknown, category: Practice2048CheckpointCategory, now = Date.now()): Saved2048Practice | null {
  try {
    if (!categoryValid(category) || !time(now) || !exact(value, keys) || value.version !== 1
      || value.rulesVersion !== PERSONAL_2048_RULES_VERSION || value.category !== category || !token(value.practiceId)
      || !time(value.startedAt) || !time(value.savedAt) || value.startedAt > value.savedAt || value.savedAt > now
      || !integer(value.bestBefore) || !exact(value.state, stateKeys)) return null
    const state = value.state
    if (!integer(state.score) || !integer(state.moveNumber) || state.moveNumber < 2 || !token(state.seed)
      || /^2048-daily-v\d+:/i.test(state.seed) || !four(state.board)) return null
    const board: number[][] = []
    for (const row of state.board) {
      if (!four(row) || !row.every(tile => integer(tile)
        && (tile === 0 || tile >= 2 && 2 ** Math.round(Math.log2(tile)) === tile))) return null
      board.push([...row] as number[])
    }
    if (!board.some(row => row.some(tile => tile > 0)) || !new Game2048(board, state.score).canMove()) return null
    const parsed: Saved2048Practice = { version: 1, rulesVersion: PERSONAL_2048_RULES_VERSION, category,
      practiceId: value.practiceId, startedAt: value.startedAt, savedAt: value.savedAt, bestBefore: value.bestBefore,
      state: { board, score: state.score, seed: state.seed, moveNumber: state.moveNumber } }
    return boundedRaw(JSON.stringify(parsed)) ? parsed : null
  } catch { return null }
}

/** Raw compare-and-set supplements the host's lock; it does not provide an atomic browser transaction. */
export class Practice2048CheckpointStore {
  private status: Practice2048CheckpointStatus = 'ready'
  private checkpoint: Saved2048Practice | null = null
  private base: string | null = null
  private captured = false
  private readonly key: string
  private readonly now: () => number
  constructor(private options: {
    getStorage: () => Practice2048CheckpointStorage | null
    category: Practice2048CheckpointCategory
    now?: () => number
  }) {
    this.key = options.category === 'synthetic' ? `${PRACTICE_2048_CHECKPOINT_KEY}.synthetic` : PRACTICE_2048_CHECKPOINT_KEY
    this.now = options.now ?? Date.now
    if (!categoryValid(options.category)) this.status = 'invalid'
  }
  snapshot(): Practice2048CheckpointSnapshot {
    return { status: this.status, checkpoint: this.checkpoint ? clone(this.checkpoint) : null }
  }
  private fail(status: Exclude<Practice2048CheckpointStatus, 'ready'>) {
    this.status = status; this.checkpoint = null
    return false
  }
  read(): Practice2048CheckpointSnapshot {
    if (!categoryValid(this.options.category)) { this.fail('invalid'); return this.snapshot() }
    let raw: string | null
    try {
      const storage = this.options.getStorage()
      if (!storage) { this.fail('unavailable'); return this.snapshot() }
      raw = storage.getItem(this.key)
      if (raw !== null && typeof raw !== 'string') { this.fail('unavailable'); return this.snapshot() }
      this.base = raw; this.captured = true
    } catch { this.fail('unavailable'); return this.snapshot() }
    try {
      const parsed = raw === null ? null : boundedRaw(raw) ? parseSaved2048Practice(JSON.parse(raw), this.options.category, this.now()) : null
      this.checkpoint = parsed; this.status = raw === null || parsed ? 'ready' : 'invalid'
    } catch {
      this.fail('invalid')
    }
    return this.snapshot()
  }
  private storageAtBase(): Practice2048CheckpointStorage | null {
    if (!this.captured) this.read()
    if (this.status !== 'ready') return null
    try {
      const storage = this.options.getStorage()
      if (!storage) { this.fail('unavailable'); return null }
      if (storage.getItem(this.key) !== this.base) { this.fail('conflict'); return null }
      return storage
    } catch { this.fail('unavailable'); return null }
  }
  write(checkpoint: Saved2048Practice): boolean {
    let parsed: Saved2048Practice | null
    try { parsed = parseSaved2048Practice(checkpoint, this.options.category, this.now()) } catch { return this.fail('invalid') }
    if (!parsed) return this.fail('invalid')
    const storage = this.storageAtBase()
    if (!storage) return false
    const raw = JSON.stringify(parsed)
    try {
      storage.setItem(this.key, raw)
      const confirmed = storage.getItem(this.key)
      if (confirmed !== raw) return this.fail(confirmed === this.base ? 'unavailable' : 'conflict')
      this.base = raw; this.checkpoint = parsed; this.status = 'ready'
      return true
    } catch { return this.fail('unavailable') }
  }
  clear(): boolean {
    const storage = this.storageAtBase()
    if (!storage) return false
    try {
      if (this.base !== null) storage.removeItem(this.key)
      const confirmed = storage.getItem(this.key)
      if (confirmed !== null) return this.fail(confirmed === this.base ? 'unavailable' : 'conflict')
      this.base = null; this.checkpoint = null; this.status = 'ready'
      return true
    } catch { return this.fail('unavailable') }
  }
}
