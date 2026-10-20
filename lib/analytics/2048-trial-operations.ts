import { PLAYER_2048_RETENTION_TIMEZONE, player2048RetentionRange } from '../game/player-2048-retention'

export const MAX_2048_OPERATIONS_BYTES = 250_000
export const OPERATIONS_2048_ERROR = 'No se pudo validar el registro operativo de 2048. Revisa los campos, las fechas y el tamaño del archivo.'
export const OPERATIONS_2048_OPTIONS = {
  category: ['declared_real', 'synthetic'],
  channel: ['unspecified', 'community', 'personal_invitation', 'social', 'other'],
  invitation: ['not_recorded', 'invited', 'accepted', 'declined'],
  device: ['unknown', 'mobile', 'desktop', 'tablet'],
  auth: ['unknown', 'authenticated', 'anonymous'],
  firstMove: ['unknown', 'observed', 'not_observed'],
  twentyMoves: ['unknown', 'observed', 'not_observed'],
  ending: ['unknown', 'completed', 'left', 'technical_block'],
  blocker: ['unknown', 'none', 'load', 'controls', 'account', 'understanding', 'other'],
  assistance: ['unknown', 'none', 'instructions', 'individual_help'],
  secondPractice: ['unknown', 'observed_without_prompt', 'observed_after_prompt', 'not_observed'],
  trainingUnderstanding: ['unknown', 'understood', 'confused', 'not_offered'],
  ticketUnderstanding: ['unknown', 'understood', 'confused', 'not_shown'],
  followActivity: ['unknown', 'observed', 'participant_reported', 'not_observed'],
  followPrompt: ['unknown', 'none_recorded', 'general_reminder', 'individual_help'],
  workKind: ['recruitment', 'session', 'reminder', 'support', 'analysis'],
} as const

type Options = typeof OPERATIONS_2048_OPTIONS
type Choice<K extends keyof Options> = Options[K][number]
export interface Follow2048Operations {
  activity: Choice<'followActivity'>
  checkedDay: string | null
  prompt: Choice<'followPrompt'>
}
export interface Session2048Operations {
  code: string
  invitation: Choice<'invitation'>
  sessionDay: string | null
  device: Choice<'device'>
  auth: Choice<'auth'>
  firstMove: Choice<'firstMove'>
  twentyMoves: Choice<'twentyMoves'>
  ending: Choice<'ending'>
  blocker: Choice<'blocker'>
  assistance: Choice<'assistance'>
  secondPractice: Choice<'secondPractice'>
  trainingUnderstanding: Choice<'trainingUnderstanding'>
  ticketUnderstanding: Choice<'ticketUnderstanding'>
  d1: Follow2048Operations
  d7: Follow2048Operations
}
export interface Work2048Operations {
  day: string
  kind: Choice<'workKind'>
  minutes: number | null
  costClp: number | null
}
export interface Operations2048 {
  format: 'torneos.2048.trial-operations'
  version: 1
  timezone: 'America/Santiago'
  category: Choice<'category'>
  plan: { plannedStartDay: string | null; channel: Choice<'channel'>; targetSessions: 6 | 7 | 8 }
  sessions: Session2048Operations[]
  workLog: Work2048Operations[]
}
type Maturity = 'no_baseline' | 'pending' | 'open' | 'mature'
export interface Operations2048FollowSummary {
  targetDay: string | null
  maturity: Maturity
  activity: Follow2048Operations['activity']
  prompt: Follow2048Operations['prompt']
}
type FollowTotals = {
  maturity: Record<Maturity, number>
  /** Activity and prompt counts include only slots with a first-move baseline. */
  activity: Record<Follow2048Operations['activity'], number>
  prompt: Record<Follow2048Operations['prompt'], number>
}
export interface Operations2048Summary {
  format: 'torneos.2048.trial-operations-summary'
  version: 1
  timezone: 'America/Santiago'
  category: Operations2048['category']
  asOfChileDay: string
  scope: string
  calendar: { actualStartDay: string | null; plannedStartDay: string | null; basis: 'observed_session' | 'proposed' | 'unplanned';
    day1: string | null; day14: string | null; day21: string | null; day30: string | null }
  sessions: { code: string; baseDay: string | null; d1: Operations2048FollowSummary; d7: Operations2048FollowSummary }[]
  totals: {
    unit: 'manual_session_observations'
    slots: 8
    targetSessions: 6 | 7 | 8
    sessionDaysRecorded: number
    invitation: Record<Session2048Operations['invitation'], number>
    firstMove: Record<Session2048Operations['firstMove'], number>
    twentyMoves: Record<Session2048Operations['twentyMoves'], number>
    ending: Record<Session2048Operations['ending'], number>
    blocker: Record<Session2048Operations['blocker'], number>
    assistance: Record<Session2048Operations['assistance'], number>
    secondPractice: Record<Session2048Operations['secondPractice'], number>
    trainingUnderstanding: Record<Session2048Operations['trainingUnderstanding'], number>
    ticketUnderstanding: Record<Session2048Operations['ticketUnderstanding'], number>
    d1: FollowTotals
    d7: FollowTotals
    work: { entries: number; knownMinutes: number | null; minutesUnknownEntries: number; knownCostClp: number | null; costUnknownEntries: number }
  }
}

const sessionFields = ['invitation', 'device', 'auth', 'firstMove', 'twentyMoves', 'ending', 'blocker', 'assistance', 'secondPractice', 'trainingUnderstanding', 'ticketUnderstanding'] as const
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
function fail(): never { throw new Error(OPERATIONS_2048_ERROR) }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!record(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail()
  return value
}
function member<T extends string>(values: readonly T[], value: unknown): value is T { return typeof value === 'string' && values.includes(value as T) }
function day(value: unknown): value is string { return typeof value === 'string' && player2048RetentionRange(value, value) !== null }
function addDays(value: string, offset: number): string {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  const result = date.toISOString().slice(0, 10)
  if (!day(result)) fail()
  return result
}
function follow(): Follow2048Operations { return { activity: 'unknown', checkedDay: null, prompt: 'unknown' } }
function session(code: string): Session2048Operations {
  return { code, invitation: 'not_recorded', sessionDay: null, device: 'unknown', auth: 'unknown', firstMove: 'unknown', twentyMoves: 'unknown',
    ending: 'unknown', blocker: 'unknown', assistance: 'unknown', secondPractice: 'unknown', trainingUnderstanding: 'unknown', ticketUnderstanding: 'unknown', d1: follow(), d7: follow() }
}
export function create2048TrialOperations(category: Operations2048['category'] = 'declared_real'): Operations2048 {
  if (!member(OPERATIONS_2048_OPTIONS.category, category)) fail()
  return { format: 'torneos.2048.trial-operations', version: 1, timezone: PLAYER_2048_RETENTION_TIMEZONE, category,
    plan: { plannedStartDay: null, channel: 'unspecified', targetSessions: 6 },
    sessions: Array.from({ length: 8 }, (_, index) => session(`S${String(index + 1).padStart(2, '0')}`)), workLog: [] }
}
function readFollow(value: unknown, baseDay: string | null, offset: number, asOfDay: string): Follow2048Operations {
  const input = exact(value, ['activity', 'checkedDay', 'prompt'])
  if (!member(OPERATIONS_2048_OPTIONS.followActivity, input.activity) || !member(OPERATIONS_2048_OPTIONS.followPrompt, input.prompt)) fail()
  if (baseDay === null && (input.activity !== 'unknown' || input.prompt !== 'unknown' || input.checkedDay !== null)) fail()
  if (input.activity === 'unknown') {
    if (input.checkedDay !== null) fail()
  } else {
    if (baseDay === null || !day(input.checkedDay) || input.checkedDay > asOfDay) fail()
    const target = addDays(baseDay, offset)
    if (input.checkedDay < target || input.activity === 'not_observed' && (input.checkedDay <= target || asOfDay <= target)) fail()
  }
  return { activity: input.activity, checkedDay: input.checkedDay as string | null, prompt: input.prompt }
}
function validate(value: unknown, asOfDay: string): Operations2048 {
  if (!day(asOfDay)) fail()
  const input = exact(value, ['format', 'version', 'timezone', 'category', 'plan', 'sessions', 'workLog'])
  if (input.format !== 'torneos.2048.trial-operations' || input.version !== 1 || input.timezone !== PLAYER_2048_RETENTION_TIMEZONE
    || !member(OPERATIONS_2048_OPTIONS.category, input.category)) fail()
  const plan = exact(input.plan, ['plannedStartDay', 'channel', 'targetSessions'])
  if (plan.plannedStartDay !== null && !day(plan.plannedStartDay) || !member(OPERATIONS_2048_OPTIONS.channel, plan.channel)
    || plan.targetSessions !== 6 && plan.targetSessions !== 7 && plan.targetSessions !== 8
    || !Array.isArray(input.sessions) || input.sessions.length !== 8 || !Array.isArray(input.workLog) || input.workLog.length > 120) fail()
  if (typeof plan.plannedStartDay === 'string') addDays(plan.plannedStartDay, 29)
  const sessions = input.sessions.map((value, index): Session2048Operations => {
    const row = exact(value, ['code', 'sessionDay', ...sessionFields, 'd1', 'd7'])
    const expected = `S${String(index + 1).padStart(2, '0')}`
    if (row.code !== expected || row.sessionDay !== null && (!day(row.sessionDay) || row.sessionDay > asOfDay)) fail()
    for (const field of sessionFields) if (!member(OPERATIONS_2048_OPTIONS[field], row[field])) fail()
    if (row.sessionDay === null && sessionFields.some(field => field !== 'invitation' && row[field] !== 'unknown')
      || row.twentyMoves === 'observed' && row.firstMove !== 'observed'
      || row.secondPractice !== 'unknown' && row.firstMove !== 'observed') fail()
    const baseDay = row.firstMove === 'observed' ? row.sessionDay as string : null
    if (baseDay !== null) addDays(baseDay, 7)
    const result = { code: expected, sessionDay: row.sessionDay, ...Object.fromEntries(sessionFields.map(field => [field, row[field]])),
      d1: readFollow(row.d1, baseDay, 1, asOfDay), d7: readFollow(row.d7, baseDay, 7, asOfDay) }
    return result as Session2048Operations
  })
  const actualStartDay = sessions.filter(row => row.firstMove === 'observed').map(row => row.sessionDay!).sort()[0]
  if (actualStartDay !== undefined) addDays(actualStartDay, 29)
  const workLog = input.workLog.map((value): Work2048Operations => {
    const row = exact(value, ['day', 'kind', 'minutes', 'costClp'])
    if (!day(row.day) || row.day > asOfDay || !member(OPERATIONS_2048_OPTIONS.workKind, row.kind)
      || row.minutes !== null && (!Number.isSafeInteger(row.minutes) || Number(row.minutes) < 0 || Number(row.minutes) > 1440)
      || row.costClp !== null && (!Number.isSafeInteger(row.costClp) || Number(row.costClp) < 0 || Number(row.costClp) > 100_000_000)) fail()
    return { day: row.day, kind: row.kind, minutes: row.minutes as number | null, costClp: row.costClp as number | null }
  })
  return { format: 'torneos.2048.trial-operations', version: 1, timezone: PLAYER_2048_RETENTION_TIMEZONE, category: input.category,
    plan: { plannedStartDay: plan.plannedStartDay as string | null, channel: plan.channel, targetSessions: plan.targetSessions }, sessions, workLog }
}

/** Strict replacement import; no text, extra keys, merge, account IDs or persistence. */
export function parse2048TrialOperations(raw: string, asOfDay: string): Operations2048 {
  try {
    if (typeof raw !== 'string' || raw.length > MAX_2048_OPERATIONS_BYTES || new TextEncoder().encode(raw).byteLength > MAX_2048_OPERATIONS_BYTES) fail()
    return validate(JSON.parse(raw), asOfDay)
  } catch { return fail() }
}
function counts<T extends string>(values: readonly T[]): Record<T, number> { return Object.fromEntries(values.map(value => [value, 0])) as Record<T, number> }
function fieldCounts<K extends typeof sessionFields[number]>(sessions: Session2048Operations[], field: K) {
  const result = counts(OPERATIONS_2048_OPTIONS[field])
  for (const row of sessions) result[row[field]]++
  return result
}
function followSummary(value: Follow2048Operations, baseDay: string | null, offset: number, asOfDay: string): Operations2048FollowSummary {
  const targetDay = baseDay === null ? null : addDays(baseDay, offset)
  return { targetDay, maturity: targetDay === null ? 'no_baseline' : targetDay > asOfDay ? 'pending' : targetDay === asOfDay ? 'open' : 'mature',
    activity: value.activity, prompt: value.prompt }
}
function followTotals(rows: Operations2048FollowSummary[]): FollowTotals {
  const result: FollowTotals = { maturity: counts(['no_baseline', 'pending', 'open', 'mature']),
    activity: counts(OPERATIONS_2048_OPTIONS.followActivity), prompt: counts(OPERATIONS_2048_OPTIONS.followPrompt) }
  for (const row of rows) {
    result.maturity[row.maturity]++
    if (row.maturity !== 'no_baseline') { result.activity[row.activity]++; result.prompt[row.prompt]++ }
  }
  return result
}
/** Manual observations only; an invitation or reminder never becomes return activity. */
export function build2048TrialOperationsSummary(ops: Operations2048, asOfDay: string): Operations2048Summary {
  try {
    const value = validate(ops, asOfDay)
    const actualStartDay = value.sessions.filter(row => row.firstMove === 'observed').map(row => row.sessionDay!).sort()[0] ?? null
    const day1 = actualStartDay ?? value.plan.plannedStartDay
    const sessions = value.sessions.map(row => {
      const baseDay = row.firstMove === 'observed' ? row.sessionDay : null
      return { code: row.code, baseDay, d1: followSummary(row.d1, baseDay, 1, asOfDay), d7: followSummary(row.d7, baseDay, 7, asOfDay) }
    })
    const minutes = value.workLog.map(row => row.minutes).filter((item): item is number => item !== null)
    const costs = value.workLog.map(row => row.costClp).filter((item): item is number => item !== null)
    return { format: 'torneos.2048.trial-operations-summary', version: 1, timezone: PLAYER_2048_RETENTION_TIMEZONE, category: value.category, asOfChileDay: asOfDay,
      scope: 'Declaraciones manuales por sesión, separadas entre ensayo declarado real y QA sintética. No son personas únicas, tasas de retención ni adquisición central. Un contacto o recordatorio no acredita regreso.',
      calendar: { actualStartDay, plannedStartDay: value.plan.plannedStartDay, basis: actualStartDay !== null ? 'observed_session' : day1 !== null ? 'proposed' : 'unplanned',
        day1, day14: day1 === null ? null : addDays(day1, 13), day21: day1 === null ? null : addDays(day1, 20), day30: day1 === null ? null : addDays(day1, 29) },
      sessions, totals: { unit: 'manual_session_observations', slots: 8, targetSessions: value.plan.targetSessions,
        sessionDaysRecorded: value.sessions.filter(row => row.sessionDay !== null).length,
        invitation: fieldCounts(value.sessions, 'invitation'), firstMove: fieldCounts(value.sessions, 'firstMove'), twentyMoves: fieldCounts(value.sessions, 'twentyMoves'),
        ending: fieldCounts(value.sessions, 'ending'), blocker: fieldCounts(value.sessions, 'blocker'), assistance: fieldCounts(value.sessions, 'assistance'),
        secondPractice: fieldCounts(value.sessions, 'secondPractice'), trainingUnderstanding: fieldCounts(value.sessions, 'trainingUnderstanding'), ticketUnderstanding: fieldCounts(value.sessions, 'ticketUnderstanding'),
        d1: followTotals(sessions.map(row => row.d1)), d7: followTotals(sessions.map(row => row.d7)),
        work: { entries: value.workLog.length, knownMinutes: minutes.length ? minutes.reduce((sum, item) => sum + item, 0) : null,
          minutesUnknownEntries: value.workLog.length - minutes.length, knownCostClp: costs.length ? costs.reduce((sum, item) => sum + item, 0) : null,
          costUnknownEntries: value.workLog.length - costs.length } } }
  } catch { return fail() }
}
