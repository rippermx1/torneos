export type Player2048ActivityMode = 'practice' | 'daily'
export const PLAYER_2048_RETENTION_TIMEZONE = 'America/Santiago'
export const PLAYER_2048_RETENTION_LIMITATIONS = [
  'Actividad declarada por el cliente y vinculada a una cuenta autenticada; no prueba juego humano ni integridad competitiva.',
  'La cohorte parte del primer día activo conocido desde esta recopilación; no demuestra adquisición ni actividad anterior.',
  'D1/D7 combinan práctica y reto diario. Cuentas distintas no equivalen necesariamente a personas distintas.',
  'Una fecha objetivo que todavía no termina no entra en el denominador. Un denominador vacío conserva rate=null.',
] as const

export interface Player2048ActivityDay {
  userId: string
  activityDay: string
  practice: boolean
  daily: boolean
}
export interface Player2048RetentionMetric {
  eligibleAccounts: number
  returnedAccounts: number
  rate: number | null
}
export interface Player2048RetentionCohort {
  cohortDay: string
  accounts: number
  day1: Player2048RetentionMetric
  day7: Player2048RetentionMetric
}
export interface Player2048RetentionReport {
  version: 1
  unit: 'accounts'
  source: 'self_reported_first_valid_move'
  cohortBasis: 'first_known_activity_day'
  timezone: 'America/Santiago'
  from: string
  to: string
  asOfChileDay: string
  cohorts: Player2048RetentionCohort[]
  totals: Omit<Player2048RetentionCohort, 'cohortDay'>
}
export interface Player2048RetentionRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

const DAY_MS = 86_400_000
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
function serial(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number(day.slice(0, 4)) < 1900) return null
  const value = Date.parse(`${day}T00:00:00.000Z`)
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === day ? value / DAY_MS : null
}
const dayAt = (value: number) => new Date(value * DAY_MS).toISOString().slice(0, 10)

export function player2048ChileDay(at: Date | string | number) {
  const date = new Date(at)
  if (!Number.isFinite(date.getTime())) throw new Error('Fecha de actividad inválida.')
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: PLAYER_2048_RETENTION_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (name: string) => parts.find(value => value.type === name)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function player2048RetentionRange(from: unknown, to: unknown) {
  if (typeof from !== 'string' || typeof to !== 'string') return null
  const first = serial(from), last = serial(to)
  if (first === null || last === null || last < first || last - first > 89) return null
  return { from, to, days: last - first + 1 }
}

/** The HTTP body has no identity, timestamp, score or other extra fields. */
export function parsePlayer2048ActivityBody(value: unknown): Player2048ActivityMode | null {
  return object(value) && Object.keys(value).length === 1 && (value.mode === 'practice' || value.mode === 'daily') ? value.mode : null
}

function metric(eligibleAccounts: number, returnedAccounts: number): Player2048RetentionMetric {
  return { eligibleAccounts, returnedAccounts, rate: eligibleAccounts ? returnedAccounts / eligibleAccounts : null }
}
function total(cohorts: Player2048RetentionCohort[]): Player2048RetentionReport['totals'] {
  return {
    accounts: cohorts.reduce((sum, cohort) => sum + cohort.accounts, 0),
    day1: metric(cohorts.reduce((sum, cohort) => sum + cohort.day1.eligibleAccounts, 0), cohorts.reduce((sum, cohort) => sum + cohort.day1.returnedAccounts, 0)),
    day7: metric(cohorts.reduce((sum, cohort) => sum + cohort.day7.eligibleAccounts, 0), cohorts.reduce((sum, cohort) => sum + cohort.day7.returnedAccounts, 0)),
  }
}

/** Offline reference calculation. Runtime reports use an aggregate service RPC. */
export function buildPlayer2048RetentionReport(
  rows: readonly Player2048ActivityDay[], from: string, to: string, asOfChileDay: string,
): Player2048RetentionReport {
  const range = player2048RetentionRange(from, to), asOf = serial(asOfChileDay)
  if (!range || asOf === null) throw new Error('Rango de retención inválido.')
  const accounts = new Map<string, Set<number>>()
  for (const row of rows) {
    const activity = serial(row.activityDay)
    if (typeof row.userId !== 'string' || !row.userId || activity === null
      || typeof row.practice !== 'boolean' || typeof row.daily !== 'boolean' || !row.practice && !row.daily) throw new Error('Actividad de cuenta inválida.')
    const days = accounts.get(row.userId) ?? new Set<number>()
    days.add(activity); accounts.set(row.userId, days)
  }
  const cohorts: Player2048RetentionCohort[] = Array.from({ length: range.days }, (_, index) => ({
    cohortDay: dayAt(serial(from)! + index), accounts: 0, day1: metric(0, 0), day7: metric(0, 0),
  }))
  for (const days of accounts.values()) {
    const first = Math.min(...days), index = first - serial(from)!
    if (index < 0 || index >= cohorts.length) continue
    const cohort = cohorts[index]
    cohort.accounts++
    for (const [field, offset] of [['day1', 1], ['day7', 7]] as const) {
      if (first + offset < asOf) {
        cohort[field].eligibleAccounts++
        if (days.has(first + offset)) cohort[field].returnedAccounts++
      }
    }
  }
  for (const cohort of cohorts) {
    cohort.day1 = metric(cohort.day1.eligibleAccounts, cohort.day1.returnedAccounts)
    cohort.day7 = metric(cohort.day7.eligibleAccounts, cohort.day7.returnedAccounts)
  }
  return { version: 1, unit: 'accounts', source: 'self_reported_first_valid_move', cohortBasis: 'first_known_activity_day',
    timezone: PLAYER_2048_RETENTION_TIMEZONE, from, to, asOfChileDay, cohorts, totals: total(cohorts) }
}

function readMetric(value: unknown, accounts: number, mature?: boolean): Player2048RetentionMetric | null {
  if (!object(value) || !count(value.eligibleAccounts) || !count(value.returnedAccounts)
    || value.returnedAccounts > value.eligibleAccounts || value.eligibleAccounts > accounts
    || mature !== undefined && value.eligibleAccounts !== (mature ? accounts : 0)) return null
  const expected = metric(value.eligibleAccounts, value.returnedAccounts)
  if (expected.rate === null ? value.rate !== null : typeof value.rate !== 'number' || !Number.isFinite(value.rate) || Math.abs(value.rate - expected.rate) > 1e-12) return null
  return expected
}

/** Whitelist aggregate fields so a malformed RPC never returns rows/PII. */
export function parsePlayer2048RetentionReport(value: unknown): Player2048RetentionReport | null {
  if (!object(value) || value.version !== 1 || value.unit !== 'accounts' || value.source !== 'self_reported_first_valid_move'
    || value.cohortBasis !== 'first_known_activity_day' || value.timezone !== PLAYER_2048_RETENTION_TIMEZONE
    || typeof value.asOfChileDay !== 'string') return null
  const range = player2048RetentionRange(value.from, value.to), asOf = serial(value.asOfChileDay)
  if (!range || asOf === null || !Array.isArray(value.cohorts) || value.cohorts.length !== range.days) return null
  const cohorts: Player2048RetentionCohort[] = []
  for (let index = 0; index < value.cohorts.length; index++) {
    const row: unknown = value.cohorts[index], day = serial(range.from)! + index
    if (!object(row) || row.cohortDay !== dayAt(day) || !count(row.accounts)) return null
    const day1 = readMetric(row.day1, row.accounts, day + 1 < asOf), day7 = readMetric(row.day7, row.accounts, day + 7 < asOf)
    if (!day1 || !day7) return null
    cohorts.push({ cohortDay: row.cohortDay as string, accounts: row.accounts, day1, day7 })
  }
  const totals = total(cohorts)
  if (!object(value.totals) || value.totals.accounts !== totals.accounts) return null
  const day1 = readMetric(value.totals.day1, totals.accounts), day7 = readMetric(value.totals.day7, totals.accounts)
  if (!day1 || !day7 || JSON.stringify(day1) !== JSON.stringify(totals.day1) || JSON.stringify(day7) !== JSON.stringify(totals.day7)) return null
  return { version: 1, unit: 'accounts', source: 'self_reported_first_valid_move', cohortBasis: 'first_known_activity_day',
    timezone: PLAYER_2048_RETENTION_TIMEZONE, from: range.from, to: range.to, asOfChileDay: value.asOfChileDay, cohorts, totals }
}

export async function recordPlayer2048Activity(client: Player2048RetentionRpcClient, userId: string, mode: Player2048ActivityMode) {
  const { data, error } = await client.rpc('record_2048_player_activity', { p_user_id: userId, p_mode: mode })
  if (error || !object(data) || typeof data.activityDay !== 'string' || serial(data.activityDay) === null) throw new Error('Actividad de cuenta no confirmada.')
  return { activityDay: data.activityDay }
}

export async function readPlayer2048Retention(client: Player2048RetentionRpcClient, from: string, to: string) {
  if (!player2048RetentionRange(from, to)) throw new Error('Rango de retención inválido.')
  const { data, error } = await client.rpc('report_2048_player_retention', { p_from: from, p_to: to })
  const report = error ? null : parsePlayer2048RetentionReport(data)
  if (!report || report.from !== from || report.to !== to) throw new Error('Retención de cuentas no confirmada.')
  return report
}
