import { describe, expect, it } from 'vitest'
import {
  isOwnKycDocumentPath,
  isValidRut,
  normalizePersonName,
  normalizeRut,
  samePersonName,
  sameRut,
} from '@/lib/identity/verification'

describe('identity verification helpers', () => {
  it('normalizes and validates Chilean RUT values', () => {
    expect(normalizeRut('12.345.678-5')).toBe('123456785')
    expect(isValidRut('12.345.678-5')).toBe(true)
    expect(isValidRut('12.345.678-9')).toBe(false)
    expect(sameRut('12.345.678-5', '12345678-5')).toBe(true)
  })

  it('normalizes names for strict bank ownership comparison', () => {
    expect(normalizePersonName('Jose  Nunez')).toBe('JOSE NUNEZ')
    expect(normalizePersonName('Jose   Nunez')).toBe('JOSE NUNEZ')
    expect(samePersonName('Jose Nunez', 'JOSE  NUNEZ')).toBe(true)
    expect(samePersonName('Jose Nunez', 'Jose Andres Nunez')).toBe(false)
  })

  it('accepts only storage paths scoped to the authenticated user', () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    expect(isOwnKycDocumentPath(`${userId}/front.pdf`, userId)).toBe(true)
    expect(isOwnKycDocumentPath(`${userId}\\front.pdf`, userId)).toBe(true)
    expect(isOwnKycDocumentPath(`${userId}/../front.pdf`, userId)).toBe(false)
    expect(isOwnKycDocumentPath('22222222-2222-4222-8222-222222222222/front.pdf', userId)).toBe(false)
  })
})
