import { describe, expect, it, vi } from 'vitest'
import { buildPlayer2048RetentionReport, parsePlayer2048ActivityBody, parsePlayer2048RetentionReport,
  player2048ChileDay, player2048RetentionRange, readPlayer2048Retention, recordPlayer2048Activity,
  type Player2048ActivityDay } from '../lib/game/player-2048-retention'

const activity = (userId: string, activityDay: string, mode: 'practice' | 'daily' = 'practice'): Player2048ActivityDay =>
  ({ userId, activityDay, practice: mode === 'practice', daily: mode === 'daily' })

describe('2048 authenticated account calendar retention', () => {
  it('uses Santiago calendar dates at midnight in both summer and winter', () => {
    expect(player2048ChileDay('2026-10-15T02:59:59.999Z')).toBe('2026-10-14')
    expect(player2048ChileDay('2026-10-15T03:00:00.000Z')).toBe('2026-10-15')
    expect(player2048ChileDay('2026-06-15T03:59:59.999Z')).toBe('2026-06-14')
    expect(player2048ChileDay('2026-06-15T04:00:00.000Z')).toBe('2026-06-15')
    expect(() => player2048ChileDay('invalid')).toThrow()
  })

  it('matures only after the exact target calendar day finishes, including DST', () => {
    const rows = [activity('a', '2026-09-05'), activity('a', '2026-09-06', 'daily'), activity('a', '2026-09-12')]
    const duringD1 = buildPlayer2048RetentionReport(rows, '2026-09-05', '2026-09-05', '2026-09-06')
    expect(duringD1.totals.day1).toEqual({ eligibleAccounts: 0, returnedAccounts: 0, rate: null })
    expect(buildPlayer2048RetentionReport(rows, '2026-09-05', '2026-09-05', '2026-09-07').totals.day1.rate).toBe(1)
    expect(buildPlayer2048RetentionReport(rows, '2026-09-05', '2026-09-05', '2026-09-12').totals.day7.rate).toBeNull()
    expect(buildPlayer2048RetentionReport(rows, '2026-09-05', '2026-09-05', '2026-09-13').totals.day7.rate).toBe(1)
  })

  it('counts accounts once, merges both modes and requires the exact D1/D7 day', () => {
    const rows = [activity('private-account-a', '2026-10-01'), activity('private-account-a', '2026-10-01', 'daily'),
      activity('private-account-a', '2026-10-02', 'daily'), activity('private-account-a', '2026-10-08'),
      activity('private-account-b', '2026-10-01'), activity('private-account-b', '2026-10-03'), activity('private-account-b', '2026-10-09')]
    const report = buildPlayer2048RetentionReport(rows, '2026-10-01', '2026-10-01', '2026-10-15')
    expect(report.totals).toEqual({ accounts: 2, day1: { eligibleAccounts: 2, returnedAccounts: 1, rate: 0.5 }, day7: { eligibleAccounts: 2, returnedAccounts: 1, rate: 0.5 } })
    expect(JSON.stringify(report)).not.toContain('private-account')
    expect(report.unit).toBe('accounts')
    expect(report.cohortBasis).toBe('first_known_activity_day')
  })

  it('finds first known activity before filtering the requested cohort range', () => {
    const report = buildPlayer2048RetentionReport([activity('a', '2026-10-08'), activity('a', '2026-10-01'), activity('b', '2026-10-08')],
      '2026-10-08', '2026-10-09', '2026-10-20')
    expect(report.totals.accounts).toBe(1)
    expect(report.cohorts[0].accounts).toBe(1)
    expect(report.cohorts[1].accounts).toBe(0)
  })

  it('aggregates only mature accounts rather than averaging cohort percentages', () => {
    const rows = [activity('a', '2026-10-01'), activity('a', '2026-10-02'), activity('b', '2026-10-02'),
      activity('c', '2026-10-02'), activity('d', '2026-10-03'), activity('d', '2026-10-04')]
    const report = buildPlayer2048RetentionReport(rows, '2026-10-01', '2026-10-03', '2026-10-04')
    expect(report.totals.accounts).toBe(4)
    expect(report.totals.day1.eligibleAccounts).toBe(3)
    expect(report.totals.day1.returnedAccounts).toBe(1)
    expect(report.totals.day1.rate).toBe(1 / 3)
    expect(report.totals.day7.rate).toBeNull()
  })

  it('includes empty cohort days and never substitutes a zero rate for no denominator', () => {
    const report = buildPlayer2048RetentionReport([], '2026-10-01', '2026-10-03', '2026-10-15')
    expect(report.cohorts).toHaveLength(3)
    expect(report.totals).toEqual({ accounts: 0, day1: { eligibleAccounts: 0, returnedAccounts: 0, rate: null }, day7: { eligibleAccounts: 0, returnedAccounts: 0, rate: null } })
    expect(parsePlayer2048RetentionReport(report)).toEqual(report)
  })

  it('bounds inclusive ranges to 90 valid dates and checks leap days', () => {
    expect(player2048RetentionRange('2026-01-01', '2026-03-31')?.days).toBe(90)
    expect(player2048RetentionRange('2026-01-01', '2026-04-01')).toBeNull()
    expect(player2048RetentionRange('2026-02-29', '2026-03-01')).toBeNull()
    expect(player2048RetentionRange('2028-02-29', '2028-03-01')?.days).toBe(2)
    expect(player2048RetentionRange('2026-10-02', '2026-10-01')).toBeNull()
    expect(player2048RetentionRange('2026-10-01T00:00:00Z', '2026-10-02')).toBeNull()
  })

  it('rejects forged activity identities/dates and all extra body fields', () => {
    expect(parsePlayer2048ActivityBody({ mode: 'practice' })).toBe('practice')
    expect(parsePlayer2048ActivityBody({ mode: 'daily' })).toBe('daily')
    for (const body of [null, [], 'practice', {}, { mode: 'tournament' }, { mode: 'practice', userId: 'other' },
      { mode: 'practice', activityDay: '2026-10-01' }, { mode: 'practice', score: 100 }]) expect(parsePlayer2048ActivityBody(body)).toBeNull()
  })

  it('whitelists report output and refuses invalid or prematurely mature aggregates', () => {
    const report = buildPlayer2048RetentionReport([activity('a', '2026-10-01')], '2026-10-01', '2026-10-01', '2026-10-02')
    expect(parsePlayer2048RetentionReport({ ...report, userId: 'private', rows: ['private'] })).toEqual(report)
    expect(parsePlayer2048RetentionReport({ ...report, totals: { ...report.totals, accounts: 2 } })).toBeNull()
    expect(parsePlayer2048RetentionReport({ ...report, cohorts: [{ ...report.cohorts[0], day1: { eligibleAccounts: 1, returnedAccounts: 0, rate: 0 } }] })).toBeNull()
    expect(parsePlayer2048RetentionReport({ ...report, cohorts: [{ ...report.cohorts[0], day7: { eligibleAccounts: 0, returnedAccounts: 0, rate: 0 } }] })).toBeNull()
  })

  it('uses server RPC args only and treats persistence/aggregate failures as unconfirmed', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { activityDay: '2026-10-15', userId: 'private' }, error: null })
    expect(await recordPlayer2048Activity({ rpc }, 'server-account', 'daily')).toEqual({ activityDay: '2026-10-15' })
    expect(rpc).toHaveBeenCalledWith('record_2048_player_activity', { p_user_id: 'server-account', p_mode: 'daily' })
    rpc.mockResolvedValue({ data: null, error: { message: 'private SQL detail' } })
    await expect(recordPlayer2048Activity({ rpc }, 'server-account', 'practice')).rejects.toThrow('no confirmada')
    await expect(readPlayer2048Retention({ rpc }, '2026-10-01', '2026-10-15')).rejects.toThrow('no confirmada')
  })
})
