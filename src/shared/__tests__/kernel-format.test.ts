import { describe, expect, it } from 'vitest'
import { ok, err } from '@shared/kernel/result'
import { formatMoney, formatDateTime, secondsToMinutes } from '@shared/lib/format'
import { formatCLP } from '@/lib/utils'

describe('kernel and format', () => {
  it('builds results', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 })
    expect(err('X')).toEqual({ ok: false, error: 'X' })
  })
  it('formats CLP from cents like the legacy helper', () => {
    expect(formatMoney(500000)).toBe('$5.000')
    expect(formatMoney(0)).toBe('$0')
    expect(formatCLP(3300000)).toBe(formatMoney(3300000))
  })
  it('shows Santiago time in summer and winter regardless of server zone', () => {
    // Same 12-hour es-CL output as the legacy helper: 20:00Z is 05:00 p. m. (UTC-3) and 04:00 p. m. (UTC-4).
    expect(formatDateTime('2026-09-30T20:00:00Z')).toMatch(/05:00\sp\.\sm\./)
    expect(formatDateTime('2026-06-30T20:00:00Z')).toMatch(/04:00\sp\.\sm\./)
  })
  it('renders an unparseable date like the legacy helper instead of throwing', () => {
    expect(formatDateTime('not a date')).toBe('Invalid Date')
  })
  it('converts seconds to whole minutes', () => {
    expect(secondsToMinutes(600)).toBe(10)
  })
})
