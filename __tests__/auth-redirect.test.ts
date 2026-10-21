import { describe, expect, it } from 'vitest'
import { getSafeAuthRedirectPath, getOnboardingPath, getOnboardingReturnPath, getTournamentReturnPath, withAuthDestination } from '@/lib/auth/redirect'

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

const tournamentHref = '/tournaments/10000000-0000-0000-0000-000000000001'

describe('participation destinations', () => {
  it('preserves the chosen tournament through signup, login and onboarding', () => {
    const signup = new URL(withAuthDestination('/sign-up', tournamentHref), 'https://local.test')
    const onboarding = getOnboardingPath(signup.searchParams.get('next'))
    const login = new URL(withAuthDestination('/sign-in', onboarding), 'https://local.test')
    expect(getOnboardingPath(login.searchParams.get('next'))).toBe(onboarding)
    const completion = new URL(onboarding, 'https://local.test')
    expect(getOnboardingReturnPath(completion.searchParams.get('next'))).toBe(tournamentHref)
  })

  it('keeps generic signup working without a tournament', () => {
    expect(getOnboardingPath(undefined)).toBe('/onboarding')
    expect(getOnboardingReturnPath(null)).toBe('/play')
  })

  it.each(['/play', '/play/2048/ticket?from=practice', '/tournaments', tournamentHref])('preserves an explicit internal choice after onboarding: %s', destination => {
    const onboarding = new URL(getOnboardingPath(destination), 'https://local.test')
    expect(onboarding.pathname).toBe('/onboarding')
    expect(getOnboardingReturnPath(onboarding.searchParams.get('next'))).toBe(destination)
  })

  it.each(['https://outside.test', '//outside.test', '/\\outside.test', '/\n/outside.test', '/onboarding', '/onboarding?next=/onboarding'])('rejects unsafe or looping onboarding destination %s', (input) => {
    expect(getOnboardingReturnPath(input)).toBe('/play')
  })

  it('rejects an untrusted FormData File as a redirect', () => {
    const form = new FormData()
    form.append('next', new Blob(['https://outside.test']), 'next.txt')
    expect(getOnboardingReturnPath(form.get('next'))).toBe('/play')
  })

  it('practice returns only to the public detail of a chosen tournament', () => {
    expect(getTournamentReturnPath(tournamentHref)).toBe(tournamentHref)
    for (const input of [`${tournamentHref}/play`, '/api/tournaments/pay', `${tournamentHref}?next=https://outside.test`, ['x', tournamentHref], '//outside.test', '/tournaments/../wallet']) {
      expect(getTournamentReturnPath(input)).toBeNull()
    }
  })
})
