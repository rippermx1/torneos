import { describe, expect, it } from 'vitest'
import {
  isOwnKycDocumentPath,
  isValidRut,
  normalizePersonName,
  normalizeRut,
  samePersonName,
  sameRut,
  getAgeFromBirthDate,
  isAdult,
} from '@/lib/identity/verification'

describe('age gate (getAgeFromBirthDate / isAdult)', () => {
  // now local fijo = 2026-07-01 (constructor local, mes 0-indexado) para
  // determinismo independiente de la zona horaria del runner.
  const now = new Date(2026, 6, 1)

  it('calcula la edad cumplida sin desfase de zona horaria', () => {
    expect(getAgeFromBirthDate('2008-07-01', now)).toBe(18) // cumple justo hoy
    expect(getAgeFromBirthDate('2008-06-30', now)).toBe(18) // ya cumplió
    expect(getAgeFromBirthDate('2008-07-02', now)).toBe(17) // cumple mañana
    expect(getAgeFromBirthDate('2010-01-01', now)).toBe(16)
  })

  it('isAdult exige 18 años cumplidos', () => {
    expect(isAdult('2008-07-01', now)).toBe(true)
    expect(isAdult('2008-07-02', now)).toBe(false) // un día menos de 18
    expect(isAdult('2000-05-15', now)).toBe(true)
    expect(isAdult('2012-01-01', now)).toBe(false)
  })

  it('fecha ausente o inválida ⇒ no adulto', () => {
    expect(getAgeFromBirthDate(null, now)).toBeNull()
    expect(getAgeFromBirthDate(undefined, now)).toBeNull()
    expect(getAgeFromBirthDate('', now)).toBeNull()
    expect(getAgeFromBirthDate('no-es-fecha', now)).toBeNull()
    expect(getAgeFromBirthDate('2000-02-30', now)).toBeNull()
    expect(isAdult(null, now)).toBe(false)
    expect(isAdult('2008-13-40', now)).toBe(false)
  })
})

describe('identity verification helpers', () => {
  it('normalizes and validates Chilean RUT values', () => {
    expect(normalizeRut('12.345.678-5')).toBe('123456785')
    expect(isValidRut('12.345.678-5')).toBe(true)
    expect(isValidRut('12.345.678-9')).toBe(false)
    expect(sameRut('12.345.678-5', '12345678-5')).toBe(true)
  })

  it('normalizes names for bank ownership comparison', () => {
    expect(normalizePersonName('Jose  Nunez')).toBe('JOSE NUNEZ')
    expect(normalizePersonName('Jose   Nunez')).toBe('JOSE NUNEZ')
    // exact match (different casing/spacing)
    expect(samePersonName('Jose Nunez', 'JOSE  NUNEZ')).toBe(true)
    // bank may omit second first name — subset must match
    expect(samePersonName('Jose Andres Nunez', 'Jose Nunez')).toBe(true)
    expect(samePersonName('Jose Nunez', 'Jose Andres Nunez')).toBe(true)
    // completely different names must not match
    expect(samePersonName('Jose Nunez', 'Maria Nunez')).toBe(false)
    expect(samePersonName('Pedro Garcia', 'Juan Garcia')).toBe(false)
    // empty / null must not match
    expect(samePersonName(null, 'Jose Nunez')).toBe(false)
    expect(samePersonName('', 'Jose Nunez')).toBe(false)
  })

  it('accepts only storage paths scoped to the authenticated user', () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    expect(isOwnKycDocumentPath(`${userId}/front.pdf`, userId)).toBe(true)
    expect(isOwnKycDocumentPath(`${userId}\\front.pdf`, userId)).toBe(true)
    expect(isOwnKycDocumentPath(`${userId}/../front.pdf`, userId)).toBe(false)
    expect(isOwnKycDocumentPath('22222222-2222-4222-8222-222222222222/front.pdf', userId)).toBe(false)
  })
})
