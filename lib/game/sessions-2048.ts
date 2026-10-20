/** Local, best-effort browser observations. No account, gameplay state or network. */
export const SESSIONS_2048_STORAGE_KEY = 'torneos.2048.sessions.v1'
export const MAX_2048_OBSERVATION_SESSIONS = 120
export const MAX_2048_OBSERVATION_PRACTICES = 300
export const MAX_2048_OBSERVATION_EVENTS = 2000
export const SESSIONS_2048_SCOPE = 'Observaciones locales de este navegador; no personas, ventas ni cohortes globales.'

type ObservationStorage = Pick<Storage, 'getItem' | 'setItem'>
export type Sessions2048Category = 'observed_browser' | 'synthetic'
export type Sessions2048Mode = 'practice' | 'daily' | 'training' | 'tournament'
export type PracticeEndReason2048 = 'no_moves' | 'self_ended' | 'timeout'
export type PracticeInterruptReason2048 = 'restart' | 'navigation' | 'unknown'
type ObservationKind = 'ready' | 'start' | 'first-valid-move' | '20-valid-moves'
  | 'end' | 'interrupted' | 'restart' | 'paused' | 'resumed'
type ObservationReason = PracticeEndReason2048 | PracticeInterruptReason2048

export interface Sessions2048Options {
  /** Access is lazy: obtaining localStorage itself can throw in some browsers. */
  getStorage: () => ObservationStorage | null
  build: string
  rulesVersion: string
  category: Sessions2048Category
  mode: Sessions2048Mode
  now?: () => number
  uuid?: () => string
}

export interface ObservationSession2048 {
  id: string
  build: string
  rulesVersion: string
  category: Sessions2048Category
  mode: Sessions2048Mode
  readyAt: number
  lastSeenAt: number
}

export interface ObservedPractice2048 {
  id: string
  sessionId: string
  startedAt: number
  lastSeenAt: number
  validMoves: number
  status: 'active' | 'ended' | 'interrupted'
  endedAt: number | null
  reason: ObservationReason | null
  firstValidMoveAt: number | null
  twentyValidMovesAt: number | null
  observationGap: boolean
}

export interface ObservationEvent2048 {
  id: string
  sessionId: string
  practiceId: string | null
  kind: ObservationKind
  at: number
  reason: ObservationReason | null
  previousPracticeId: string | null
}

export interface Sessions2048Ledger {
  version: 1
  browserId: string
  createdAt: number
  capturedAt: number
  sessions: ObservationSession2048[]
  practices: ObservedPractice2048[]
  events: ObservationEvent2048[]
  truncated: boolean
  storageError: boolean
  observationGap: boolean
}

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const tokenPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/
const categories = ['observed_browser', 'synthetic'] as const
const modes = ['practice', 'daily', 'training', 'tournament'] as const
const kinds: readonly ObservationKind[] = ['ready', 'start', 'first-valid-move', '20-valid-moves', 'end', 'interrupted', 'restart', 'paused', 'resumed']
const endReasons: readonly ObservationReason[] = ['no_moves', 'self_ended', 'timeout']
const interruptReasons: readonly ObservationReason[] = ['restart', 'navigation', 'unknown']
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const member = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && list.includes(value as T)
const time = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799999
const token = (value: unknown): value is string => typeof value === 'string' && tokenPattern.test(value)
const uuid = (value: unknown): value is string => typeof value === 'string' && uuidPattern.test(value)
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function newUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16)
    return (character === 'x' ? value : (value & 3) | 8).toString(16)
  })
}

/** Strict local-storage reader. Invalid evidence is never silently overwritten. */
export function readSessions2048(raw: string | null): Sessions2048Ledger | null {
  if (raw === null) return null
  if (raw.length > 1_500_000) throw new Error('Observaciones 2048 demasiado grandes.')
  const value: unknown = JSON.parse(raw)
  if (!record(value) || !exact(value, ['version', 'browserId', 'createdAt', 'capturedAt', 'sessions', 'practices', 'events', 'truncated', 'storageError', 'observationGap'])
    || value.version !== 1 || !uuid(value.browserId) || !time(value.createdAt) || !time(value.capturedAt) || value.capturedAt < value.createdAt
    || typeof value.truncated !== 'boolean' || typeof value.storageError !== 'boolean' || typeof value.observationGap !== 'boolean'
    || !Array.isArray(value.sessions) || value.sessions.length > MAX_2048_OBSERVATION_SESSIONS
    || !Array.isArray(value.practices) || value.practices.length > MAX_2048_OBSERVATION_PRACTICES
    || !Array.isArray(value.events) || value.events.length > MAX_2048_OBSERVATION_EVENTS) throw new Error('Registro local 2048 inválido.')
  const sessions = new Map<string, ObservationSession2048>()
  for (const session of value.sessions) {
    if (!record(session) || !exact(session, ['id', 'build', 'rulesVersion', 'category', 'mode', 'readyAt', 'lastSeenAt'])
      || !uuid(session.id) || sessions.has(session.id) || !token(session.build) || !token(session.rulesVersion)
      || !member(categories, session.category) || !member(modes, session.mode)
      || !time(session.readyAt) || !time(session.lastSeenAt) || session.readyAt < value.createdAt
      || session.lastSeenAt < session.readyAt || session.lastSeenAt > value.capturedAt) throw new Error('Sesión local 2048 inválida.')
    sessions.set(session.id, session as unknown as ObservationSession2048)
  }
  const practices = new Map<string, ObservedPractice2048>()
  for (const practice of value.practices) {
    if (!record(practice) || !exact(practice, ['id', 'sessionId', 'startedAt', 'lastSeenAt', 'validMoves', 'status', 'endedAt', 'reason', 'firstValidMoveAt', 'twentyValidMovesAt', 'observationGap'])
      || !token(practice.id) || practices.has(practice.id) || typeof practice.sessionId !== 'string' || !sessions.has(practice.sessionId)
      || !time(practice.startedAt) || !time(practice.lastSeenAt) || practice.startedAt < sessions.get(practice.sessionId)!.readyAt
      || practice.lastSeenAt < practice.startedAt || practice.lastSeenAt > value.capturedAt
      || !Number.isSafeInteger(practice.validMoves) || Number(practice.validMoves) < 0 || Number(practice.validMoves) > 1_000_000
      || !member(['active', 'ended', 'interrupted'] as const, practice.status) || typeof practice.observationGap !== 'boolean') throw new Error('Práctica observada inválida.')
    if (practice.status === 'active' ? practice.endedAt !== null || practice.reason !== null
      : !time(practice.endedAt) || practice.endedAt < practice.startedAt || practice.endedAt !== practice.lastSeenAt
        || !member(practice.status === 'ended' ? endReasons : interruptReasons, practice.reason)) throw new Error('Cierre observado inválido.')
    for (const field of ['firstValidMoveAt', 'twentyValidMovesAt'] as const) {
      if (practice[field] !== null && (!time(practice[field]) || practice[field] < practice.startedAt || practice[field] > practice.lastSeenAt)) throw new Error('Hito observado inválido.')
    }
    if (practice.firstValidMoveAt !== null && Number(practice.validMoves) < 1
      || practice.twentyValidMovesAt !== null && (Number(practice.validMoves) < 20 || practice.firstValidMoveAt === null)) throw new Error('Secuencia observada inválida.')
    practices.set(practice.id, practice as unknown as ObservedPractice2048)
  }
  const eventIds = new Set<string>()
  for (const event of value.events) {
    if (!record(event) || !exact(event, ['id', 'sessionId', 'practiceId', 'kind', 'at', 'reason', 'previousPracticeId'])
      || !uuid(event.id) || eventIds.has(event.id) || typeof event.sessionId !== 'string' || !sessions.has(event.sessionId)
      || !member(kinds, event.kind) || !time(event.at) || event.at < sessions.get(event.sessionId)!.readyAt || event.at > value.capturedAt
      || event.practiceId !== null && (typeof event.practiceId !== 'string' || !practices.has(event.practiceId))
      || event.previousPracticeId !== null && (typeof event.previousPracticeId !== 'string' || !practices.has(event.previousPracticeId))) throw new Error('Evento local 2048 inválido.')
    if (event.kind === 'ready' ? event.practiceId !== null
      : !['paused', 'resumed'].includes(event.kind) && event.practiceId === null) throw new Error('Identidad de evento inválida.')
    if (event.kind === 'end' ? !member(endReasons, event.reason)
      : event.kind === 'interrupted' ? !member(interruptReasons, event.reason) : event.reason !== null) throw new Error('Motivo de evento inválido.')
    if (event.kind !== 'restart' && event.previousPracticeId !== null) throw new Error('Origen de evento inválido.')
    eventIds.add(event.id)
  }
  return copy(value as unknown as Sessions2048Ledger)
}

function eventKey(event: ObservationEvent2048) {
  if (event.kind === 'paused' || event.kind === 'resumed') return event.id
  return `${event.kind}|${event.kind === 'ready' ? event.sessionId : event.practiceId}`
}

function bounded(ledger: Sessions2048Ledger) {
  ledger.sessions.sort((a, b) => a.readyAt - b.readyAt || a.id.localeCompare(b.id))
  ledger.practices.sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
  ledger.events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
  if (ledger.sessions.length > MAX_2048_OBSERVATION_SESSIONS) { ledger.sessions = ledger.sessions.slice(-MAX_2048_OBSERVATION_SESSIONS); ledger.truncated = true }
  const sessions = new Set(ledger.sessions.map(session => session.id))
  ledger.practices = ledger.practices.filter(practice => sessions.has(practice.sessionId))
  if (ledger.practices.length > MAX_2048_OBSERVATION_PRACTICES) { ledger.practices = ledger.practices.slice(-MAX_2048_OBSERVATION_PRACTICES); ledger.truncated = true }
  const practices = new Set(ledger.practices.map(practice => practice.id))
  ledger.events = ledger.events.filter(event => sessions.has(event.sessionId) && (event.practiceId === null || practices.has(event.practiceId))
    && (event.previousPracticeId === null || practices.has(event.previousPracticeId)))
  if (ledger.events.length > MAX_2048_OBSERVATION_EVENTS) { ledger.events = ledger.events.slice(-MAX_2048_OBSERVATION_EVENTS); ledger.truncated = true }
}

function mergeLedger(current: Sessions2048Ledger, stored: Sessions2048Ledger) {
  if (current.browserId !== stored.browserId || current.createdAt !== stored.createdAt) throw new Error('Cambió el origen local de observación.')
  const sessions = new Map(stored.sessions.map(session => [session.id, copy(session)]))
  for (const session of current.sessions) {
    const old = sessions.get(session.id)
    if (old && (old.build !== session.build || old.rulesVersion !== session.rulesVersion || old.category !== session.category || old.mode !== session.mode || old.readyAt !== session.readyAt)) throw new Error('Cambió una sesión observada.')
    sessions.set(session.id, { ...session, lastSeenAt: Math.max(old?.lastSeenAt ?? 0, session.lastSeenAt) })
  }
  const practices = new Map(stored.practices.map(practice => [practice.id, copy(practice)]))
  for (const practice of current.practices) {
    const old = practices.get(practice.id)
    if (old && (old.sessionId !== practice.sessionId || old.startedAt !== practice.startedAt)) throw new Error('Cambió una práctica observada.')
    // A stale active tab must not reopen an explicitly ended/interrupted record.
    if (!old || old.status === 'active' && practice.status !== 'active' || old.status === practice.status && practice.lastSeenAt >= old.lastSeenAt) practices.set(practice.id, copy(practice))
    if (old && old.status !== 'active' && practice.status !== 'active' && old.status !== practice.status) current.observationGap = true
  }
  const events = new Map<string, ObservationEvent2048>()
  for (const event of [...stored.events, ...current.events]) {
    const key = eventKey(event)
    const old = events.get(key)
    if (!old || event.at < old.at) events.set(key, copy(event))
  }
  current.sessions = [...sessions.values()]
  current.practices = [...practices.values()]
  current.events = [...events.values()]
  current.capturedAt = Math.max(current.capturedAt, stored.capturedAt)
  current.truncated ||= stored.truncated
  current.storageError ||= stored.storageError
  current.observationGap ||= stored.observationGap
  bounded(current)
}

export class Sessions2048 {
  private ledger: Sessions2048Ledger | null = null
  private storage: ObservationStorage | null = null
  private writable = true
  private sessionId: string | null = null
  private practiceId: string | null = null
  private visible = true
  private now: () => number
  private uuid: () => string

  constructor(private options: Sessions2048Options) {
    this.now = options.now ?? Date.now
    this.uuid = options.uuid ?? newUuid
  }

  private timestamp() {
    try {
      const now = this.now()
      if (!time(now) || this.ledger && now < this.ledger.capturedAt) throw new Error('Reloj de observación inválido.')
      return now
    } catch { if (this.ledger) this.ledger.observationGap = true; return null }
  }

  private identifier() {
    try { const id = this.uuid(); if (uuid(id)) return id.toLowerCase() } catch { /* Gameplay must keep running. */ }
    if (this.ledger) this.ledger.observationGap = true
    return null
  }

  private touch(at: number) {
    if (!this.ledger) return
    this.ledger.capturedAt = at
    const session = this.ledger.sessions.find(item => item.id === this.sessionId)
    if (session) session.lastSeenAt = at
  }

  private event(kind: ObservationKind, at: number, practiceId: string | null = this.practiceId, reason: ObservationReason | null = null, previousPracticeId: string | null = null) {
    if (!this.ledger || !this.sessionId) return
    const id = this.identifier()
    if (!id) return
    const event: ObservationEvent2048 = { id, sessionId: this.sessionId, practiceId, kind, at, reason, previousPracticeId }
    if (!this.ledger.events.some(item => eventKey(item) === eventKey(event))) this.ledger.events.push(event)
  }

  private save() {
    if (!this.ledger) return
    bounded(this.ledger)
    if (!this.writable || !this.storage) { this.ledger.storageError = true; return }
    try {
      const raw = this.storage.getItem(SESSIONS_2048_STORAGE_KEY)
      const stored = readSessions2048(raw)
      if (stored) mergeLedger(this.ledger, stored)
      this.storage.setItem(SESSIONS_2048_STORAGE_KEY, JSON.stringify(this.ledger))
    } catch { this.writable = false; this.ledger.storageError = true }
  }

  ready() {
    if (this.sessionId || !token(this.options.build) || !token(this.options.rulesVersion)
      || !member(categories, this.options.category) || !member(modes, this.options.mode)) return false
    const at = this.timestamp()
    if (at === null) return false
    let stored: Sessions2048Ledger | null = null
    try {
      this.storage = this.options.getStorage()
      if (!this.storage) this.writable = false
      else stored = readSessions2048(this.storage.getItem(SESSIONS_2048_STORAGE_KEY))
    } catch { this.writable = false }
    this.ledger = stored
    if (this.ledger && at < this.ledger.capturedAt) { this.ledger.observationGap = true; return false }
    if (!this.ledger) {
      const browserId = this.identifier()
      if (!browserId) return false
      this.ledger = { version: 1, browserId, createdAt: at, capturedAt: at, sessions: [], practices: [], events: [], truncated: false, storageError: !this.writable, observationGap: false }
    }
    const id = this.identifier()
    if (!id || this.ledger.sessions.some(session => session.id === id)) { this.ledger.observationGap = true; return false }
    this.sessionId = id
    this.ledger.sessions.push({ id, build: this.options.build, rulesVersion: this.options.rulesVersion, category: this.options.category, mode: this.options.mode, readyAt: at, lastSeenAt: at })
    this.touch(at)
    this.event('ready', at, null)
    this.save()
    return true
  }

  start(practiceId: string) {
    if (!this.ledger || !this.sessionId || !token(practiceId) || this.ledger.practices.some(practice => practice.id === practiceId)
      || this.active()?.status === 'active') return false
    const at = this.timestamp()
    if (at === null) return false
    this.practiceId = practiceId
    this.ledger.practices.push({ id: practiceId, sessionId: this.sessionId, startedAt: at, lastSeenAt: at, validMoves: 0,
      status: 'active', endedAt: null, reason: null, firstValidMoveAt: null, twentyValidMovesAt: null, observationGap: false })
    this.touch(at)
    this.event('start', at)
    this.save()
    return true
  }

  private active() { return this.ledger?.practices.find(practice => practice.id === this.practiceId) }

  canResume(practiceId: string, startedAt: number, validMoves: number, savedAt = this.now()) {
    if (!token(practiceId) || !time(startedAt) || !Number.isSafeInteger(validMoves) || validMoves < 0 || validMoves > 1_000_000) return false
    if (this.ledger && this.storage) {
      try {
        const stored = readSessions2048(this.storage.getItem(SESSIONS_2048_STORAGE_KEY))
        if (stored) mergeLedger(this.ledger, stored)
        else this.ledger.observationGap = true
      } catch { this.writable = false; this.ledger.storageError = true; this.ledger.observationGap = true }
    }
    const previous = this.ledger?.practices.find(practice => practice.id === practiceId)
    if (!previous) return true // Gameplay may resume; missing observations are never recreated.
    const origin = this.ledger?.sessions.find(item => item.id === previous.sessionId)
    // The progress entry is created just before the observation timestamp. Keep
    // both original dates; they need not be the very same millisecond.
    return previous.status === 'active' && previous.startedAt >= startedAt && previous.startedAt <= savedAt && previous.validMoves <= validMoves
      && origin?.mode === 'practice' && origin.category === this.options.category
      && origin.rulesVersion === this.options.rulesVersion && origin.build === this.options.build
  }

  resume(practiceId: string, startedAt: number, validMoves: number, savedAt = this.now()) {
    if (!this.canResume(practiceId, startedAt, validMoves, savedAt)) return false
    const previous = this.ledger?.practices.find(practice => practice.id === practiceId)
    if (!this.ledger || !this.sessionId || !previous) {
      if (this.ledger) { this.ledger.observationGap = true; this.save() }
      return false
    }
    this.practiceId = practiceId
    if (previous.validMoves !== validMoves) { previous.observationGap = true; this.ledger.observationGap = true }
    // Preserve the original session, start, milestones and valid-move evidence.
    // No start/resume event is manufactured by restoring a board.
    this.save(); return true
  }

  validMove(practiceId: string, validMoveCount: number) {
    const practice = this.active()
    if (!this.ledger || !practice || practiceId !== practice.id || practice.status !== 'active'
      || !Number.isSafeInteger(validMoveCount) || validMoveCount <= practice.validMoves || validMoveCount > 1_000_000) return false
    const at = this.timestamp()
    if (at === null) return false
    const gap = validMoveCount !== practice.validMoves + 1
    if (gap) { practice.observationGap = true; this.ledger.observationGap = true }
    practice.validMoves = validMoveCount
    practice.lastSeenAt = at
    this.touch(at)
    if (validMoveCount === 1) { practice.firstValidMoveAt = at; this.event('first-valid-move', at) }
    if (!gap && validMoveCount === 20 && practice.firstValidMoveAt !== null) { practice.twentyValidMovesAt = at; this.event('20-valid-moves', at) }
    // Only milestones and lifecycle checkpoints write storage, not every move.
    if (validMoveCount === 1 || validMoveCount === 20) this.save()
    return true
  }

  end(practiceId: string, reason: PracticeEndReason2048 = 'no_moves') {
    return member(endReasons, reason) && this.close(practiceId, 'ended', reason)
  }

  interrupt(practiceId: string, reason: PracticeInterruptReason2048 = 'navigation') {
    return member(interruptReasons, reason) && this.close(practiceId, 'interrupted', reason)
  }

  private close(practiceId: string, status: 'ended' | 'interrupted', reason: ObservationReason) {
    const practice = this.active()
    if (!practice || practice.id !== practiceId || practice.status !== 'active') return false
    const at = this.timestamp()
    if (at === null) return false
    practice.status = status; practice.reason = reason; practice.endedAt = at; practice.lastSeenAt = at
    this.touch(at)
    this.event(status === 'ended' ? 'end' : 'interrupted', at, practiceId, reason)
    this.save()
    return true
  }

  restart(fromPracticeId: string | null, toPracticeId: string) {
    if (!this.ledger || !this.sessionId || !token(toPracticeId) || fromPracticeId === toPracticeId
      || this.ledger.practices.some(practice => practice.id === toPracticeId)) return false
    const previous = fromPracticeId === null ? null : this.ledger.practices.find(practice => practice.id === fromPracticeId)
    if (fromPracticeId !== null && (!previous || previous.id !== this.practiceId) || fromPracticeId === null && this.active()?.status === 'active') return false
    if (previous?.status === 'active' && !this.interrupt(previous.id, 'restart')) return false
    if (!this.start(toPracticeId)) return false
    const at = this.timestamp()
    if (at === null) return false
    this.touch(at)
    const current = this.active()
    if (current?.status === 'active') current.lastSeenAt = at
    if (previous) this.event('restart', at, toPracticeId, null, previous.id)
    this.save()
    return true
  }

  visibility(visible: boolean) {
    if (typeof visible !== 'boolean' || this.visible === visible) return false
    const at = this.timestamp()
    if (at === null) return false
    this.visible = visible
    if (!this.ledger || !this.sessionId) return false
    this.touch(at)
    const practice = this.active()
    if (practice?.status === 'active') practice.lastSeenAt = at
    this.event(visible ? 'resumed' : 'paused', at, practice?.status === 'active' ? practice.id : null)
    this.save()
    return true
  }

  checkpoint() {
    if (!this.ledger) return
    const at = this.timestamp()
    if (at !== null) {
      this.touch(at)
      const practice = this.active()
      if (practice?.status === 'active') practice.lastSeenAt = at
    }
    this.save()
  }

  snapshot(): Sessions2048Ledger | null { this.checkpoint(); return this.ledger ? copy(this.ledger) : null }

  exportJson() {
    const ledger = this.snapshot()
    return JSON.stringify({ format: 'torneos.2048.local-observations', version: 1, scope: SESSIONS_2048_SCOPE,
      ledger, summary: summarizeSessions2048(ledger) }, null, 2)
  }
}

/** Counts retained local evidence only. No D1/D7 rate or global acquisition claim. */
export function summarizeSessions2048(ledger: Sessions2048Ledger | null) {
  const included = (ledger?.sessions ?? []).filter(session => session.category === 'observed_browser' && (session.mode === 'practice' || session.mode === 'daily'))
  const ids = new Set(included.map(session => session.id))
  const practices = (ledger?.practices ?? []).filter(practice => ids.has(practice.sessionId))
  return {
    scope: SESSIONS_2048_SCOPE,
    localBrowsers: included.length ? 1 : 0,
    observedBrowserSessions: included.length,
    startedPractices: practices.length,
    firstValidMoves: practices.filter(practice => practice.firstValidMoveAt !== null).length,
    twentyValidMoves: practices.filter(practice => practice.twentyValidMovesAt !== null).length,
    endedPractices: practices.filter(practice => practice.status === 'ended').length,
    interruptedPractices: practices.filter(practice => practice.status === 'interrupted').length,
    activeOrUnconfirmedPractices: practices.filter(practice => practice.status === 'active').length,
    restarts: (ledger?.events ?? []).filter(event => event.kind === 'restart' && ids.has(event.sessionId)).length,
    excludedSessions: (ledger?.sessions.length ?? 0) - included.length,
    quality: { truncated: ledger?.truncated ?? false, storageError: ledger?.storageError ?? false,
      observationGap: ledger?.observationGap ?? false, coverage: !ledger ? 'unknown' : ledger.truncated || ledger.storageError || ledger.observationGap ? 'incomplete' : 'local_best_effort' },
  }
}
