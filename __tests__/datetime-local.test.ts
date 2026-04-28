import { describe, expect, it } from 'vitest'
import { formatDateTimeLocalInput, parseDateTimeLocalToIso } from '@/lib/utils'

describe('datetime-local timezone helpers', () => {
  it('convierte hora de Chile a UTC para producción', () => {
    expect(parseDateTimeLocalToIso('2026-04-28T16:26')).toBe('2026-04-28T20:26:00.000Z')
  })

  it('formatea UTC a datetime-local visible en Chile', () => {
    expect(formatDateTimeLocalInput('2026-04-28T20:26:00.000Z')).toBe('2026-04-28T16:26')
  })

  it('hace roundtrip sin perder la hora elegida por admin', () => {
    const initialValue = '2026-01-15T10:45'
    const iso = parseDateTimeLocalToIso(initialValue)
    expect(formatDateTimeLocalInput(iso)).toBe(initialValue)
  })

  it('rechaza strings inválidos', () => {
    expect(() => parseDateTimeLocalToIso('2026/04/28 16:26')).toThrow('Fecha inválida')
  })
})
