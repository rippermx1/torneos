import { describe, expect, it } from 'vitest'
import { getSafeAuthRedirectPath } from '@/lib/auth/redirect'

describe('getSafeAuthRedirectPath', () => {
  it('conserva destinos internos y sus parámetros', () => {
    expect(getSafeAuthRedirectPath('/tournaments/abc?from=signup')).toBe('/tournaments/abc?from=signup')
  })

  it('rechaza destinos absolutos, protocol-relative y con userinfo', () => {
    expect(getSafeAuthRedirectPath('https://attacker.example')).toBe('/onboarding')
    expect(getSafeAuthRedirectPath('//attacker.example')).toBe('/onboarding')
    expect(getSafeAuthRedirectPath('@attacker.example')).toBe('/onboarding')
    expect(getSafeAuthRedirectPath('/\\attacker.example')).toBe('/onboarding')
  })

  it('permite definir un fallback interno', () => {
    expect(getSafeAuthRedirectPath(null, '/')).toBe('/')
  })
})
