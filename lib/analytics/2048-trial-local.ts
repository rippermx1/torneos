import { readSessions2048, type Sessions2048Ledger } from '../game/sessions-2048'
import { readTraining2048Observations } from '../game/2048-training-observations'
import { readRewardedObservations } from '../ads/rewarded-observations'
import { readTicketOfferObservations } from '../games/2048/ticket-offer-observations'
import { readLoad2048Diagnostics, type Load2048DiagnosticsSnapshot } from '../game/2048-load-diagnostics'

export const MAX_2048_TRIAL_LOCAL_BYTES = 2_500_000
export const TRIAL_2048_LOCAL_IMPORT_ERROR = 'No se pudo validar la exportación local de 2048. Usa un archivo compatible y dentro del límite de tamaño.'
type Category = 'observed_browser' | 'synthetic'
export type Trial2048LocalQuality = {
  coverage: 'local_best_effort' | 'incomplete' | 'unknown'
  storageStatus: 'ready' | 'unavailable' | 'corrupt' | 'unknown'
  truncated: boolean
  observationGap: boolean
}
type TrialReturnState = { status: 'returned' | 'not_returned' | 'pending' | 'unknown'; matured: boolean; returnObserved: boolean }
export type Trial2048Duration = { samples: number; meanMs: number | null; minMs: number | null; maxMs: number | null }
type Trial2048LoadMilestone = { practices: number; fromLoad: Trial2048Duration; fromReady: Trial2048Duration }
export type Trial2048LoadMetrics = {
  category: Category
  attempts: number; ready: number; errors: number; timeouts: number; inconclusive: number; loading: number; retries: number
  linkedEntries: { new: number; resumed: number }
  readyDuration: Trial2048Duration
  milestones: { linkedPractices: number; unmatchedEntries: number; firstValidMove: Trial2048LoadMilestone; twentyValidMoves: Trial2048LoadMilestone } | null
  quality: Trial2048LocalQuality
}
export interface Trial2048LocalMetrics {
  version: 1
  scope: string
  practice: { category: Category; sessions: number; started: number; firstValidMove: number; twentyValidMoves: number;
    ended: number; interrupted: number; observedSecondPracticeWithin24h: boolean | null; quality: Trial2048LocalQuality }[] | null
  localReturn: { category: Category; daysPlayed: number; d1: TrialReturnState; d7: TrialReturnState; quality: Trial2048LocalQuality } | null
  training: { category: Category; offered: number; started: number; withValidMove: number; validMoves: number;
    ended: number; interrupted: number; quality: Trial2048LocalQuality } | null
  rewardedDemo: { category: 'demonstration' | 'synthetic'; requests: number; applied: number; cancelled: number; timeouts: number;
    errors: number; noFill: number; ignoredDuplicate: number; ignoredLate: number; quality: Trial2048LocalQuality } | null
  ticketOffer: { category: Category; views: number; bySource: { practice: number; result: number; direct: number }; quality: Trial2048LocalQuality } | null
  loadDiagnostics?: Trial2048LoadMetrics | null
}

const scope = 'Un archivo local, sin combinar navegadores ni acreditar personas, demanda, retorno orgánico, ventas o retención global. Entrenamiento y rewarded son demostraciones: no impresiones, concesiones de proveedor ni ingresos.'
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const category = (value: unknown): value is Category => value === 'observed_browser' || value === 'synthetic'
function fail(): never { throw new Error(TRIAL_2048_LOCAL_IMPORT_ERROR) }
function object(value: unknown, allowed: string[], required: string[]): Record<string, unknown> {
  if (!record(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail()
  return value
}
function pick(value: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map(key => [key, value[key]]))
}
function rich(value: unknown, keys: string[], format?: string) {
  const result = object(value, [...keys, 'format', 'scope', 'summary', 'quality'], keys)
  if (Object.hasOwn(result, 'format') && result.format !== format || Object.hasOwn(result, 'scope') && (typeof result.scope !== 'string' || result.scope.length > 2048)
    || Object.hasOwn(result, 'summary') && !record(result.summary)) fail()
  return result
}
function quality(value: Record<string, unknown>, truncated: boolean, observationGap: boolean): Trial2048LocalQuality {
  let storageStatus: Trial2048LocalQuality['storageStatus'] = 'unknown'
  if (Object.hasOwn(value, 'quality')) {
    const input = object(value.quality, ['storageStatus', 'truncated', 'observationGap', 'coverage'], ['storageStatus', 'truncated', 'observationGap', 'coverage'])
    if (!['ready', 'unavailable', 'corrupt'].includes(String(input.storageStatus)) || input.truncated !== truncated || input.observationGap !== observationGap
      || !['local_best_effort', 'unknown', 'incomplete'].includes(String(input.coverage))) fail()
    storageStatus = input.storageStatus as Trial2048LocalQuality['storageStatus']
  }
  return { truncated, observationGap, storageStatus,
    coverage: storageStatus !== 'ready' ? 'unknown' : truncated || observationGap ? 'incomplete' : 'local_best_effort' }
}

function practiceMetrics(ledger: Sessions2048Ledger | null): Trial2048LocalMetrics['practice'] {
  if (ledger === null) return null
  const rows: NonNullable<Trial2048LocalMetrics['practice']> = []
  for (const includedCategory of ['observed_browser', 'synthetic'] as const) {
    const sessions = ledger.sessions.filter(session => session.category === includedCategory && session.mode === 'practice')
    if (!sessions.length) continue
    const ids = new Set(sessions.map(session => session.id))
    const practices = ledger.practices.filter(practice => ids.has(practice.sessionId))
    const observationGap = ledger.observationGap || practices.some(practice => practice.observationGap)
    const sectionQuality: Trial2048LocalQuality = { truncated: ledger.truncated, observationGap,
      storageStatus: ledger.storageError ? 'unavailable' : 'ready',
      coverage: ledger.truncated || ledger.storageError || observationGap ? 'incomplete' : 'local_best_effort' }
    const activatedAt = practices.map(practice => practice.firstValidMoveAt).filter((at): at is number => at !== null).sort((a, b) => a - b)
    let observedSecondPracticeWithin24h: boolean | null = null
    if (sectionQuality.coverage === 'local_best_effort' && activatedAt.length) {
      if (activatedAt.length > 1 && activatedAt[1] - activatedAt[0] <= 86_400_000) observedSecondPracticeWithin24h = true
      else if (ledger.capturedAt - activatedAt[0] >= 86_400_000) observedSecondPracticeWithin24h = false
    }
    rows.push({ category: includedCategory, sessions: sessions.length, started: practices.length,
      firstValidMove: activatedAt.length, twentyValidMoves: practices.filter(practice => practice.twentyValidMovesAt !== null).length,
      ended: practices.filter(practice => practice.status === 'ended').length,
      interrupted: practices.filter(practice => practice.status === 'interrupted').length,
      observedSecondPracticeWithin24h, quality: sectionQuality })
  }
  return rows
}

function durations(values: number[]): Trial2048Duration {
  if (!values.length) return { samples: 0, meanMs: null, minMs: null, maxMs: null }
  return { samples: values.length, meanMs: values.reduce((sum, value) => sum + value / values.length, 0), minMs: Math.min(...values), maxMs: Math.max(...values) }
}

/** Correlation stays within one supplied file. Historical milestones are never replayed on resume. */
function loadMetrics(input: Load2048DiagnosticsSnapshot, ledger: Sessions2048Ledger | null): Trial2048LoadMetrics {
  const linked = input.entries.filter(entry => entry.practiceId !== null && entry.entry !== null && entry.mode !== null && entry.entryAt !== null)
  const sessions = new Map((ledger?.sessions ?? []).map(session => [session.id, session]))
  const practices = new Map((ledger?.practices ?? []).map(practice => [practice.id, practice]))
  const matching = linked.flatMap(entry => {
    const practice = practices.get(entry.practiceId!)
    const session = practice ? sessions.get(practice.sessionId) : null
    return practice && session && session.category === input.category && session.build === entry.build && session.mode === entry.mode
      && (session.mode === 'practice' || session.mode === 'daily') ? [{ entry, practice }] : []
  })
  const milestone = (field: 'firstValidMoveAt' | 'twentyValidMovesAt'): Trial2048LoadMilestone => {
    const unique = new Map<string, typeof matching[number]>()
    for (const row of matching) {
      const at = row.practice[field]
      if (at === null || at < row.entry.entryAt! || at < row.entry.startedAt) continue
      const previous = unique.get(row.practice.id)
      // A later resume can explain a later milestone, but cannot inherit an earlier one.
      if (!previous || row.entry.entryAt! > previous.entry.entryAt!) unique.set(row.practice.id, row)
    }
    const fromLoad: number[] = [], fromReady: number[] = []
    for (const { entry, practice } of unique.values()) {
      const at = practice[field]!
      fromLoad.push(at - entry.startedAt)
      if (entry.result === 'ready' && entry.durationMs !== null && at >= entry.startedAt + entry.durationMs) fromReady.push(at - entry.startedAt - entry.durationMs)
    }
    return { practices: unique.size, fromLoad: durations(fromLoad), fromReady: durations(fromReady) }
  }
  const storageStatus = input.storageStatus === 'conflict' ? 'unavailable' : input.storageStatus
  const observationGap = input.observationGap || !!ledger?.observationGap || matching.some(row => row.practice.observationGap)
  const truncated = input.truncated || !!ledger?.truncated
  return { category: input.category, attempts: input.entries.length,
    ready: input.entries.filter(entry => entry.result === 'ready').length,
    errors: input.entries.filter(entry => entry.result === 'error').length,
    timeouts: input.entries.filter(entry => entry.result === 'timeout').length,
    inconclusive: input.entries.filter(entry => entry.result === 'inconclusive').length,
    loading: input.entries.filter(entry => entry.result === 'loading').length,
    retries: input.entries.filter(entry => entry.retryOf !== null).length,
    linkedEntries: { new: linked.filter(entry => entry.entry === 'new').length, resumed: linked.filter(entry => entry.entry === 'resumed').length },
    readyDuration: durations(input.entries.filter(entry => entry.result === 'ready' && entry.durationMs !== null).map(entry => entry.durationMs!)),
    milestones: ledger === null ? null : { linkedPractices: new Set(matching.map(row => row.practice.id)).size,
      unmatchedEntries: linked.length - matching.length, firstValidMove: milestone('firstValidMoveAt'), twentyValidMoves: milestone('twentyValidMovesAt') },
    quality: { storageStatus, truncated, observationGap,
      coverage: storageStatus !== 'ready' || ledger?.storageError ? 'unknown' : truncated || observationGap ? 'incomplete' : 'local_best_effort' } }
}

function emptyMetrics(): Trial2048LocalMetrics {
  return { version: 1, scope, practice: null, localReturn: null, training: null, rewardedDemo: null, ticketOffer: null, loadDiagnostics: null }
}

const validDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
function localReturnMetrics(value: unknown): Trial2048LocalMetrics['localReturn'] {
  const keys = ['version', 'category', 'firstDay', 'daysPlayed', 'truncated', 'observationGap']
  const input = object(value, [...keys, 'scope', 'today', 'lastDay', 'daysPlayedCount', 'd1', 'd7', 'quality'], [...keys, 'today'])
  if (input.version !== 1 || !category(input.category) || typeof input.truncated !== 'boolean' || typeof input.observationGap !== 'boolean'
    || !Array.isArray(input.daysPlayed) || input.daysPlayed.length > 180 || !input.daysPlayed.every(validDay)
    || new Set(input.daysPlayed).size !== input.daysPlayed.length || input.daysPlayed.some((day, index, days) => index > 0 && day <= days[index - 1])
    || input.today !== null && !validDay(input.today)) fail()
  const days = input.daysPlayed as string[]
  if (days.length === 0 ? input.firstDay !== null || input.truncated
    : !validDay(input.firstDay) || input.firstDay > days[0] || !input.truncated && input.firstDay !== days[0]) fail()
  const sectionQuality = quality(input, input.truncated, input.observationGap)
  if (input.today !== null && days.length && input.today < days.at(-1)!) {
    sectionQuality.observationGap = true; sectionQuality.coverage = 'unknown'
  }
  const returned = (offset: number): TrialReturnState => {
    let target: string | null = null
    if (typeof input.firstDay === 'string') {
      const date = new Date(`${input.firstDay}T12:00:00Z`)
      date.setUTCDate(date.getUTCDate() + offset); target = date.toISOString().slice(0, 10)
    }
    const matured = target !== null && typeof input.today === 'string' && input.today > target
    const returnObserved = target !== null && days.includes(target)
    return { matured, returnObserved, status: input.category !== 'observed_browser' || sectionQuality.coverage !== 'local_best_effort' || target === null
      ? 'unknown' : !matured ? 'pending' : returnObserved ? 'returned' : 'not_returned' }
  }
  return { category: input.category, daysPlayed: days.length, d1: returned(1), d7: returned(7), quality: sectionQuality }
}

/** Pure import: no filesystem, storage, account, network, or supplied summary authority. */
export function parse2048TrialLocalExport(raw: string): Trial2048LocalMetrics {
  try {
    if (typeof raw !== 'string' || raw.length > MAX_2048_TRIAL_LOCAL_BYTES || new TextEncoder().encode(raw).byteLength > MAX_2048_TRIAL_LOCAL_BYTES) fail()
    const decoded: unknown = JSON.parse(raw)
    if (record(decoded) && decoded.format === 'torneos.2048.load-diagnostics') {
      const diagnostics = readLoad2048Diagnostics(raw)
      if (!diagnostics) fail()
      return { ...emptyMetrics(), loadDiagnostics: loadMetrics(diagnostics, null) }
    }
    const value = object(decoded, ['format', 'version', 'scope', 'observations', 'personalProgress', 'dailyProgress', 'localReturn',
      'trainingDemonstrationObservations', 'rewardedDemonstrationObservations', 'ticketOfferObservations', 'loadDiagnostics'], ['format', 'version', 'observations'])
    if (value.format !== 'torneos.2048.free-observations' || value.version !== 1) fail()
    // These progress sections are deliberately not summarized or copied out.
    if (Object.hasOwn(value, 'personalProgress') && (!record(value.personalProgress) || value.personalProgress.version !== 1)) fail()
    if (Object.hasOwn(value, 'dailyProgress') && value.dailyProgress !== null && !record(value.dailyProgress)) fail()
    const observations = object(value.observations, ['format', 'version', 'scope', 'ledger', 'summary'], ['format', 'version', 'ledger'])
    if (observations.format !== 'torneos.2048.local-observations' || observations.version !== 1) fail()
    const ledger = observations.ledger === null ? null : readSessions2048(JSON.stringify(observations.ledger))
    if (observations.ledger !== null && !ledger) fail()
    const result: Trial2048LocalMetrics = { ...emptyMetrics(), practice: practiceMetrics(ledger) }
    if (Object.hasOwn(value, 'loadDiagnostics') && value.loadDiagnostics !== null) {
      const diagnostics = readLoad2048Diagnostics(JSON.stringify(value.loadDiagnostics))
      if (!diagnostics) fail()
      result.loadDiagnostics = loadMetrics(diagnostics, ledger)
    }
    if (Object.hasOwn(value, 'localReturn')) result.localReturn = localReturnMetrics(value.localReturn)
    if (Object.hasOwn(value, 'trainingDemonstrationObservations')) {
      const keys = ['version', 'category', 'capturedAt', 'entries', 'truncated', 'observationGap']
      const input = rich(value.trainingDemonstrationObservations, keys, 'torneos.2048.training-demonstration-observations')
      const training = readTraining2048Observations(JSON.stringify(pick(input, keys)))
      if (!training) fail()
      result.training = { category: training.category, offered: training.entries.length,
        started: training.entries.filter(entry => entry.continuationId !== null).length,
        withValidMove: training.entries.filter(entry => entry.firstMoveAt !== null && entry.validMoves > 0).length,
        validMoves: training.entries.reduce((sum, entry) => sum + entry.validMoves, 0),
        ended: training.entries.filter(entry => entry.status === 'ended').length,
        interrupted: training.entries.filter(entry => entry.status === 'interrupted').length,
        quality: quality(input, training.truncated, training.observationGap) }
    }
    if (Object.hasOwn(value, 'rewardedDemonstrationObservations')) {
      const keys = ['version', 'category', 'capturedAt', 'events', 'truncated', 'observationGap']
      const input = rich(value.rewardedDemonstrationObservations, keys)
      const rewarded = readRewardedObservations(JSON.stringify(pick(input, keys)))
      if (!rewarded) fail()
      const events = rewarded.events.filter(event => event.mode === 'demo')
      const unique = (stage: 'request' | 'grant') => new Set(events.filter(event => event.stage === stage && event.requestId !== null).map(event => event.requestId)).size
      const count = (stage: string) => events.filter(event => event.stage === stage).length
      result.rewardedDemo = { category: rewarded.category, requests: unique('request'), applied: unique('grant'),
        cancelled: count('cancelled'), timeouts: count('timeout'), errors: count('error'), noFill: count('no_fill'),
        ignoredDuplicate: count('ignored_duplicate'), ignoredLate: count('ignored_late'),
        quality: quality(input, rewarded.truncated, rewarded.observationGap) }
    }
    if (Object.hasOwn(value, 'ticketOfferObservations')) {
      const keys = ['version', 'category', 'capturedAt', 'views', 'truncated', 'observationGap']
      const input = rich(value.ticketOfferObservations, keys)
      const tickets = readTicketOfferObservations(JSON.stringify(pick(input, keys)))
      if (!tickets) fail()
      const bySource = { practice: 0, result: 0, direct: 0 }
      for (const view of tickets.views) bySource[view.source]++
      result.ticketOffer = { category: tickets.category, views: tickets.views.length, bySource,
        quality: quality(input, tickets.truncated, tickets.observationGap) }
    }
    return result
  } catch { return fail() }
}
