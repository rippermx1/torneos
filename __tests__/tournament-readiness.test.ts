import { describe, expect, it } from 'vitest'
import { getParticipationBlocker, type ParticipationProfile } from '@/lib/tournament/readiness'

const READY_PROFILE: ParticipationProfile = {
  username: 'jugador_cl',
  birthDate: '1990-05-10',
  kycStatus: 'approved',
  isBanned: false,
}

describe('getParticipationBlocker', () => {
  it('permite un torneo pagado cuando la cuenta está completamente lista', () => {
    expect(getParticipationBlocker({
      emailConfirmed: true,
      profile: READY_PROFILE,
      entryFeeCents: 500_000,
      hasPendingKycSubmission: false,
    })).toBeNull()
  })

  it('permite torneos gratuitos sin exigir KYC', () => {
    expect(getParticipationBlocker({
      emailConfirmed: true,
      profile: { ...READY_PROFILE, kycStatus: 'pending' },
      entryFeeCents: 0,
      hasPendingKycSubmission: false,
    })).toBeNull()
  })

  it('dirige al onboarding si faltan los datos básicos', () => {
    expect(getParticipationBlocker({
      emailConfirmed: true,
      profile: { ...READY_PROFILE, username: 'user_12345678', birthDate: null },
      entryFeeCents: 0,
      hasPendingKycSubmission: false,
    })).toMatchObject({ kind: 'onboarding', href: '/onboarding' })
  })

  it('explica la restricción cuando la persona es menor de edad', () => {
    expect(getParticipationBlocker({
      emailConfirmed: true,
      profile: { ...READY_PROFILE, birthDate: '2012-05-10' },
      entryFeeCents: 0,
      hasPendingKycSubmission: false,
    })).toMatchObject({ kind: 'age_restricted', href: null })
  })

  it('distingue KYC nuevo, pendiente y rechazado', () => {
    const base = {
      emailConfirmed: true,
      entryFeeCents: 500_000,
    }

    expect(getParticipationBlocker({
      ...base,
      profile: { ...READY_PROFILE, kycStatus: 'pending' },
      hasPendingKycSubmission: false,
    })?.kind).toBe('kyc_required')
    expect(getParticipationBlocker({
      ...base,
      profile: { ...READY_PROFILE, kycStatus: 'pending' },
      hasPendingKycSubmission: true,
    })?.kind).toBe('kyc_pending')
    expect(getParticipationBlocker({
      ...base,
      profile: { ...READY_PROFILE, kycStatus: 'rejected' },
      hasPendingKycSubmission: false,
    })?.kind).toBe('kyc_rejected')
  })
})
