import { getAgeFromBirthDate } from '@/lib/identity/verification'
import type { KycStatus } from '@/types/database'

export interface ParticipationProfile {
  username: string
  birthDate: string | null
  kycStatus: KycStatus
  isBanned: boolean
}

export type ParticipationBlockerKind =
  | 'suspended'
  | 'email'
  | 'onboarding'
  | 'age_restricted'
  | 'kyc_required'
  | 'kyc_pending'
  | 'kyc_rejected'

export interface ParticipationBlocker {
  kind: ParticipationBlockerKind
  title: string
  detail: string
  href: string | null
  actionLabel: string | null
}

export function getParticipationBlocker({
  emailConfirmed,
  profile,
  entryFeeCents,
  hasPendingKycSubmission,
}: {
  emailConfirmed: boolean
  profile: ParticipationProfile | null
  entryFeeCents: number
  hasPendingKycSubmission: boolean
}): ParticipationBlocker | null {
  if (profile?.isBanned) {
    return {
      kind: 'suspended',
      title: 'Cuenta suspendida',
      detail: 'No puedes inscribirte mientras tu cuenta esté suspendida. Contacta a soporte si necesitas una revisión.',
      href: '/support/dispute',
      actionLabel: 'Contactar soporte',
    }
  }

  if (!emailConfirmed) {
    return {
      kind: 'email',
      title: 'Confirma tu correo',
      detail: 'Activa tu cuenta desde el enlace que enviamos a tu email antes de inscribirte.',
      href: '/verify-email',
      actionLabel: 'Ver instrucciones',
    }
  }

  const age = getAgeFromBirthDate(profile?.birthDate)

  if (!profile || profile.username.startsWith('user_') || age === null) {
    return {
      kind: 'onboarding',
      title: 'Completa tus datos básicos',
      detail: 'Necesitamos tu nombre de usuario, fecha de nacimiento y aceptación de las bases antes de participar.',
      href: '/onboarding',
      actionLabel: 'Completar registro',
    }
  }

  if (age < 18) {
    return {
      kind: 'age_restricted',
      title: 'Disponible solo para mayores de 18 años',
      detail: 'No puedes participar en TorneosPlay mientras no cumplas la edad mínima exigida.',
      href: null,
      actionLabel: null,
    }
  }

  if (entryFeeCents <= 0 || profile.kycStatus === 'approved') {
    return null
  }

  if (profile.kycStatus === 'rejected') {
    return {
      kind: 'kyc_rejected',
      title: 'Corrige tu verificación de identidad',
      detail: 'La revisión anterior fue rechazada. Actualiza los datos solicitados antes de pagar una inscripción.',
      href: '/profile/kyc',
      actionLabel: 'Corregir verificación',
    }
  }

  if (hasPendingKycSubmission) {
    return {
      kind: 'kyc_pending',
      title: 'Verificación de identidad en revisión',
      detail: 'Recibimos tus documentos. Podrás pagar inscripciones cuando el equipo complete la revisión.',
      href: '/profile/kyc',
      actionLabel: 'Ver estado',
    }
  }

  return {
    kind: 'kyc_required',
    title: 'Verifica tu identidad antes de pagar',
    detail: 'La verificación protege tus pagos, premios y futuros retiros. Solo se realiza una vez.',
    href: '/profile/kyc',
    actionLabel: 'Verificar identidad',
  }
}
