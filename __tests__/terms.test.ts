import { describe, expect, it } from 'vitest'
import { CURRENT_TERMS_VERSION, hasAcceptedCurrentTerms } from '@/lib/legal/terms'

describe('hasAcceptedCurrentTerms', () => {
  it('exige fecha y versión vigente', () => {
    expect(CURRENT_TERMS_VERSION).toBe('1.4')
    expect(hasAcceptedCurrentTerms('2026-07-13T00:00:00.000Z', CURRENT_TERMS_VERSION)).toBe(true)
    expect(hasAcceptedCurrentTerms(null, CURRENT_TERMS_VERSION)).toBe(false)
    expect(hasAcceptedCurrentTerms('2026-07-13T00:00:00.000Z', '1.0')).toBe(false)
    expect(hasAcceptedCurrentTerms('2026-10-20T00:00:00.000Z', '1.3')).toBe(false)
    expect(hasAcceptedCurrentTerms('', CURRENT_TERMS_VERSION)).toBe(false)
  })
})
