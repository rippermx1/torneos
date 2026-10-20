import { afterEach, describe, expect, it, vi } from 'vitest'
import { build2048TrialOperationsSummary, create2048TrialOperations, MAX_2048_OPERATIONS_BYTES, OPERATIONS_2048_ERROR,
  parse2048TrialOperations, type Operations2048, type Session2048Operations } from '@/lib/analytics/2048-trial-operations'

const asOf = '2026-10-20'
const encode = (value: Operations2048) => JSON.stringify(value)
function baseline(day = '2026-10-19') {
  const value = create2048TrialOperations()
  Object.assign(value.sessions[0], { invitation: 'accepted', sessionDay: day, device: 'mobile', auth: 'anonymous', firstMove: 'observed',
    twentyMoves: 'observed', ending: 'completed', blocker: 'none', assistance: 'instructions' } satisfies Partial<Session2048Operations>)
  return value
}
function summary(value = create2048TrialOperations(), day = asOf) { return build2048TrialOperationsSummary(value, day) }
function invalid(change: (value: Record<string, unknown>) => void, day = asOf) {
  const value = JSON.parse(encode(baseline())) as Record<string, unknown>
  change(value)
  expect(() => parse2048TrialOperations(JSON.stringify(value), day)).toThrowError(OPERATIONS_2048_ERROR)
}
afterEach(() => { vi.unstubAllGlobals() })

describe('strict local operations document', () => {
  it('creates eight ordered independent empty slots, no assumed facts, and null unknown work totals', () => {
    const first = create2048TrialOperations(), second = create2048TrialOperations()
    expect(first).toMatchObject({ format: 'torneos.2048.trial-operations', version: 1, timezone: 'America/Santiago', category: 'declared_real',
      plan: { plannedStartDay: null, channel: 'unspecified', targetSessions: 6 }, workLog: [] })
    expect(first.sessions.map(row => row.code)).toEqual(['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08'])
    expect(first.sessions.every(row => row.sessionDay === null && row.firstMove === 'unknown' && row.d1.activity === 'unknown')).toBe(true)
    const report = summary(first)
    expect(report.calendar).toEqual({ actualStartDay: null, plannedStartDay: null, basis: 'unplanned', day1: null, day14: null, day21: null, day30: null })
    expect(report.asOfChileDay).toBe(asOf)
    expect(report.totals.work).toEqual({ entries: 0, knownMinutes: null, minutesUnknownEntries: 0, knownCostClp: null, costUnknownEntries: 0 })
    expect(report.totals.d1).toMatchObject({ maturity: { no_baseline: 8, pending: 0, open: 0, mature: 0 }, activity: { observed: 0, unknown: 0 } })
    first.sessions[0].d1.prompt = 'general_reminder'
    expect(first.sessions[1].d1.prompt).toBe('unknown'); expect(second.sessions[0].d1.prompt).toBe('unknown')
  })
  it('roundtrips a partial invitation draft and a future plan without manufacturing actual start or follow-up', () => {
    const value = create2048TrialOperations()
    value.plan = { plannedStartDay: '2026-11-01', channel: 'personal_invitation', targetSessions: 8 }
    value.sessions[0].invitation = 'invited'; value.sessions[1].invitation = 'accepted'; value.sessions[2].invitation = 'declined'
    expect(parse2048TrialOperations(encode(value), asOf)).toEqual(value)
    const report = summary(value)
    expect(report.calendar).toEqual({ actualStartDay: null, plannedStartDay: '2026-11-01', basis: 'proposed', day1: '2026-11-01',
      day14: '2026-11-14', day21: '2026-11-21', day30: '2026-11-30' })
    expect(report.totals.invitation).toEqual({ not_recorded: 5, invited: 1, accepted: 1, declined: 1 })
    expect(report.totals.firstMove.observed).toBe(0)
    expect(report.sessions.every(row => row.baseDay === null && row.d1.maturity === 'no_baseline')).toBe(true)
  })
  it('rejects extra keys at every level, injected summaries, wrong formats/timezones/versions and invalid categories', () => {
    for (const field of ['email', 'name', 'userId', 'url', 'notes', 'summary']) invalid(value => { value[field] = 'private@example.test' })
    invalid(value => { value.plan = { ...(value.plan as object), summary: 999 } })
    invalid(value => { (value.sessions as Record<string, unknown>[])[0].nickname = 'private@example.test' })
    invalid(value => { ((value.sessions as Record<string, unknown>[])[0].d1 as Record<string, unknown>).contact = 'private@example.test' })
    invalid(value => { value.workLog = [{ day: asOf, kind: 'analysis', minutes: 0, costClp: null, detail: 'private' }] })
    for (const [field, replacement] of [['format', 'other'], ['version', 2], ['timezone', 'UTC'], ['category', 'verified_real']]) {
      invalid(value => { value[String(field)] = replacement })
    }
    expect(() => create2048TrialOperations('private' as Operations2048['category'])).toThrowError(OPERATIONS_2048_ERROR)
  })
  it('rejects missing, reordered or duplicate slots and every unknown enum rather than silently normalizing', () => {
    invalid(value => { (value.sessions as unknown[]).pop() })
    invalid(value => { (value.sessions as unknown[]).push((value.sessions as unknown[])[0]) })
    invalid(value => { const rows = value.sessions as unknown[]; [rows[0], rows[1]] = [rows[1], rows[0]] })
    invalid(value => { (value.sessions as Record<string, unknown>[])[1].code = 'S01' })
    const fields = ['invitation', 'device', 'auth', 'firstMove', 'twentyMoves', 'ending', 'blocker', 'assistance', 'secondPractice', 'trainingUnderstanding', 'ticketUnderstanding']
    for (const field of fields) invalid(value => { (value.sessions as Record<string, unknown>[])[0][field] = 'private@example.test' })
    invalid(value => { (value.plan as Record<string, unknown>).channel = 'email@example.test' })
    invalid(value => { (value.plan as Record<string, unknown>).targetSessions = 5 })
    invalid(value => { ((value.sessions as Record<string, unknown>[])[0].d1 as Record<string, unknown>).activity = 'clicked' })
    invalid(value => { ((value.sessions as Record<string, unknown>[])[0].d1 as Record<string, unknown>).prompt = 'support@example.test' })
  })
  it('rejects future session/work facts, invalid dates, facts without a session date and incompatible movement claims', () => {
    invalid(value => { (value.sessions as Record<string, unknown>[])[0].sessionDay = '2026-10-21' })
    invalid(value => { (value.sessions as Record<string, unknown>[])[0].sessionDay = '2026-02-30' })
    invalid(value => { (value.sessions as Record<string, unknown>[])[0].sessionDay = null })
    invalid(value => { const row = (value.sessions as Record<string, unknown>[])[0]; row.firstMove = 'not_observed'; row.twentyMoves = 'observed' })
    invalid(value => { const row = (value.sessions as Record<string, unknown>[])[0]; row.firstMove = 'unknown'; row.twentyMoves = 'unknown'; row.secondPractice = 'observed_without_prompt' })
    invalid(value => { value.workLog = [{ day: '2026-10-21', kind: 'reminder', minutes: null, costClp: null }] })
    invalid(value => { (value.plan as Record<string, unknown>).plannedStartDay = '2026-04-31' })
    for (const invalidDay of ['2026-02-30', '1899-12-31', '', 'today']) expect(() => parse2048TrialOperations(encode(create2048TrialOperations()), invalidDay)).toThrowError(OPERATIONS_2048_ERROR)
  })
  it('bounds work entries and amounts while keeping declared zero distinct from missing time or cost', () => {
    const value = baseline()
    value.workLog = [
      { day: '2026-10-19', kind: 'recruitment', minutes: 45, costClp: null },
      { day: '2026-10-20', kind: 'support', minutes: null, costClp: 0 },
      { day: '2026-10-20', kind: 'analysis', minutes: 0, costClp: 1200 },
    ]
    expect(parse2048TrialOperations(encode(value), asOf)).toEqual(value)
    expect(summary(value).totals.work).toEqual({ entries: 3, knownMinutes: 45, minutesUnknownEntries: 1, knownCostClp: 1200, costUnknownEntries: 1 })
    const zero = create2048TrialOperations(); zero.workLog = [{ day: asOf, kind: 'analysis', minutes: 0, costClp: 0 }]
    expect(summary(zero).totals.work).toMatchObject({ knownMinutes: 0, knownCostClp: 0, minutesUnknownEntries: 0, costUnknownEntries: 0 })
    for (const entry of [
      { day: asOf, kind: 'analysis', minutes: -1, costClp: null }, { day: asOf, kind: 'analysis', minutes: 1441, costClp: null },
      { day: asOf, kind: 'analysis', minutes: 1.5, costClp: null }, { day: asOf, kind: 'analysis', minutes: null, costClp: 100_000_001 },
      { day: asOf, kind: 'analysis', minutes: null, costClp: -1 }, { day: asOf, kind: 'analysis', minutes: null, costClp: 1.1 },
      { day: asOf, kind: 'advertising', minutes: 0, costClp: 0 },
    ]) invalid(value => { value.workLog = [entry] })
    value.workLog = Array.from({ length: 120 }, () => ({ day: asOf, kind: 'analysis', minutes: 1440, costClp: 100_000_000 }))
    expect(summary(value).totals.work).toMatchObject({ entries: 120, knownMinutes: 172800, knownCostClp: 12_000_000_000 })
    value.workLog.push(value.workLog[0])
    expect(() => parse2048TrialOperations(encode(value), asOf)).toThrowError(OPERATIONS_2048_ERROR)
  })
  it('uses a fixed safe error for invalid JSON and UTF-8 size overflow without exposing private contents', () => {
    for (const raw of ['{"private@example.test":', 'null', '[]', ' '.repeat(MAX_2048_OPERATIONS_BYTES + 1),
      JSON.stringify({ private: 'é'.repeat(125_001) })]) {
      expect(() => parse2048TrialOperations(raw, asOf)).toThrowError(OPERATIONS_2048_ERROR)
      try { parse2048TrialOperations(raw, asOf) } catch (error) { expect((error as Error).message).toBe(OPERATIONS_2048_ERROR) }
    }
    const raw = encode(create2048TrialOperations())
    expect(parse2048TrialOperations(' '.repeat(MAX_2048_OPERATIONS_BYTES - raw.length) + raw, asOf)).toEqual(create2048TrialOperations())
  })
})

describe('manual calendar and follow-up interpretation', () => {
  it('prefers the earliest observed first-move date for inclusive day14/day21/day30, without using invitation dates', () => {
    const value = baseline('2026-10-19')
    value.plan.plannedStartDay = '2026-11-01'
    value.sessions[1].sessionDay = '2026-10-18'; value.sessions[1].firstMove = 'not_observed'
    value.sessions[2].sessionDay = '2026-10-17'; value.sessions[2].firstMove = 'observed'
    const report = summary(value)
    expect(report.calendar).toEqual({ actualStartDay: '2026-10-17', plannedStartDay: '2026-11-01', basis: 'observed_session', day1: '2026-10-17',
      day14: '2026-10-30', day21: '2026-11-06', day30: '2026-11-15' })
    expect(report.sessions[0]).toMatchObject({ code: 'S01', baseDay: '2026-10-19', d1: { targetDay: '2026-10-20', maturity: 'open' },
      d7: { targetDay: '2026-10-26', maturity: 'pending' } })
    expect(report.sessions[1]).toMatchObject({ baseDay: null, d1: { targetDay: null, maturity: 'no_baseline' } })
  })
  it('matures only after the Chile target day ends, and leaves mature unverified follow-up unknown', () => {
    const value = baseline('2026-10-19')
    expect(summary(value, '2026-10-19').sessions[0].d1.maturity).toBe('pending')
    expect(summary(value, '2026-10-20').sessions[0].d1.maturity).toBe('open')
    const report = summary(value, '2026-10-21')
    expect(report.sessions[0].d1).toEqual({ targetDay: '2026-10-20', maturity: 'mature', activity: 'unknown', prompt: 'unknown' })
    expect(report.totals.d1).toMatchObject({ maturity: { mature: 1, no_baseline: 7 }, activity: { unknown: 1, observed: 0, participant_reported: 0, not_observed: 0 } })
  })
  it('allows an observed or reported target-day signal while the day is open but rejects an early absence claim', () => {
    const value = baseline(); value.sessions[0].d1 = { activity: 'observed', checkedDay: '2026-10-20', prompt: 'unknown' }
    expect(summary(value).sessions[0].d1).toMatchObject({ maturity: 'open', activity: 'observed' })
    value.sessions[0].d1.activity = 'participant_reported'
    expect(summary(value).totals.d1.activity).toMatchObject({ observed: 0, participant_reported: 1 })
    value.sessions[0].d1.activity = 'not_observed'
    expect(() => parse2048TrialOperations(encode(value), asOf)).toThrowError(OPERATIONS_2048_ERROR)
    value.sessions[0].d1.checkedDay = '2026-10-21'
    const report = summary(value, '2026-10-21')
    expect(report.sessions[0].d1).toMatchObject({ maturity: 'mature', activity: 'not_observed' })
    expect(report.totals.d1.activity.not_observed).toBe(1)
  })
  it('rejects follow-up dates before target, after the cut, and any fact without an observed first-move baseline', () => {
    const value = baseline()
    for (const checkedDay of ['2026-10-19', '2026-10-21']) {
      value.sessions[0].d1 = { activity: 'observed', checkedDay, prompt: 'none_recorded' }
      expect(() => parse2048TrialOperations(encode(value), asOf)).toThrowError(OPERATIONS_2048_ERROR)
    }
    value.sessions[0].d1 = { activity: 'unknown', checkedDay: '2026-10-20', prompt: 'none_recorded' }
    expect(() => parse2048TrialOperations(encode(value), asOf)).toThrowError(OPERATIONS_2048_ERROR)
    const noBase = create2048TrialOperations()
    noBase.sessions[0].sessionDay = '2026-10-19'
    noBase.sessions[0].d1 = { activity: 'observed', checkedDay: '2026-10-20', prompt: 'none_recorded' }
    expect(() => parse2048TrialOperations(encode(noBase), asOf)).toThrowError(OPERATIONS_2048_ERROR)
    noBase.sessions[0].d1 = { activity: 'unknown', checkedDay: null, prompt: 'general_reminder' }
    expect(() => parse2048TrialOperations(encode(noBase), asOf)).toThrowError(OPERATIONS_2048_ERROR)
  })
  it('records help and reminders separately from activity; no contact becomes return or a person/rate', () => {
    const value = baseline(); value.sessions[0].d1.prompt = 'general_reminder'
    value.sessions[0].secondPractice = 'observed_after_prompt'
    value.workLog = [{ day: asOf, kind: 'reminder', minutes: 10, costClp: null }]
    const report = summary(value)
    expect(report.totals.d1).toMatchObject({ activity: { unknown: 1, observed: 0, participant_reported: 0 }, prompt: { general_reminder: 1 } })
    expect(report.totals.secondPractice).toMatchObject({ observed_without_prompt: 0, observed_after_prompt: 1 })
    expect(report.totals.invitation.accepted).toBe(1)
    expect(JSON.stringify(report)).not.toMatch(/"(?:people|persons|players|accounts|rate|retentionRate|organicReturn)"/)
  })
  it('uses calendar dates across both Chile DST transitions and leap years', () => {
    for (const [start, target, maturityDay] of [['2026-04-04', '2026-04-05', '2026-04-06'],
      ['2026-09-05', '2026-09-06', '2026-09-07'], ['2028-02-28', '2028-02-29', '2028-03-01']]) {
      const value = baseline(start)
      expect(summary(value, target).sessions[0].d1).toMatchObject({ targetDay: target, maturity: 'open' })
      expect(summary(value, maturityDay).sessions[0].d1.maturity).toBe('mature')
    }
  })
  it('accepts only dates whose required calendar and follow-up targets remain valid ISO days', () => {
    const value = create2048TrialOperations('synthetic')
    value.plan.plannedStartDay = '9999-12-31'
    expect(() => parse2048TrialOperations(encode(value), asOf)).toThrowError(OPERATIONS_2048_ERROR)
    value.plan.plannedStartDay = '9999-12-02'
    expect(parse2048TrialOperations(encode(value), asOf)).toEqual(value)
    expect(summary(value).calendar.day30).toBe('9999-12-31')
    const overflowActualCalendar = baseline('9999-12-03')
    expect(() => parse2048TrialOperations(encode(overflowActualCalendar), '9999-12-31')).toThrowError(OPERATIONS_2048_ERROR)
    const overflowTarget = baseline('9999-11-01')
    overflowTarget.sessions[1].sessionDay = '9999-12-25'; overflowTarget.sessions[1].firstMove = 'observed'
    expect(() => parse2048TrialOperations(encode(overflowTarget), '9999-12-31')).toThrowError(OPERATIONS_2048_ERROR)
  })
  it('keeps declared-real and synthetic documents independent without claiming either verifies humans', () => {
    const real = baseline(), synthetic = create2048TrialOperations('synthetic')
    synthetic.sessions[0] = { ...real.sessions[0], d1: { ...real.sessions[0].d1 }, d7: { ...real.sessions[0].d7 } }
    const first = summary(real), second = summary(synthetic)
    expect(first.category).toBe('declared_real'); expect(second.category).toBe('synthetic')
    expect(first.totals.firstMove.observed).toBe(1); expect(second.totals.firstMove.observed).toBe(1)
    expect(parse2048TrialOperations(encode(synthetic), asOf).category).toBe('synthetic')
    expect(first.scope).toContain('Declaraciones manuales')
    expect(summary(real)).toEqual(first)
  })
  it('is pure, does not mutate inputs and exposes only fixed codes, enum facts, dates and totals', () => {
    const value = baseline(), original = encode(value)
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('forbidden') }))
    vi.stubGlobal('localStorage', new Proxy({}, { get: () => { throw new Error('forbidden') } }))
    const report = summary(value)
    expect(encode(value)).toBe(original)
    expect(JSON.stringify(report)).not.toMatch(/"(?:name|email|userId|browserId|participantId|contact|url|notes|filename|score|seed|board)"/)
    expect(report.sessions.map(row => row.code)).toEqual(value.sessions.map(row => row.code))
    const withPrivate = { ...value, summary: 'private@example.test' } as Operations2048
    expect(() => summary(withPrivate)).toThrowError(OPERATIONS_2048_ERROR)
    expect(fetch).not.toHaveBeenCalled()
  })
})
