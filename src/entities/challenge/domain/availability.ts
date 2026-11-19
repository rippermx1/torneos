import { AVAILABILITY_PRIORITY } from '../config/availability-priority'
import { SUPPORTED_GAME_TYPES, type Challenge, type ChallengeSchedule } from './challenge'

export const AVAILABILITY_KINDS = ['open', 'upcoming', 'full', 'live', 'finalizing', 'closed', 'completed', 'cancelled', 'unknown'] as const
export type AvailabilityKind = (typeof AVAILABILITY_KINDS)[number]

export interface ChallengeAvailability {
  kind: AvailabilityKind
  canRegister: boolean
  slots: number | null
  priority: number
}

const REGISTRABLE_STATUSES: readonly string[] = ['scheduled', 'open']

export function normalizeRegistrationCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function isSupportedGame(gameType: string): boolean {
  return (SUPPORTED_GAME_TYPES as readonly string[]).includes(gameType)
}

function freeSlots(challenge: ChallengeSchedule): number | null {
  const count = normalizeRegistrationCount(challenge.registeredCount)
  const hasCapacity = Number.isSafeInteger(challenge.maxPlayers) && challenge.maxPlayers > 0
  return count !== null && hasCapacity ? Math.max(0, challenge.maxPlayers - count) : null
}

function availabilityKind(challenge: ChallengeSchedule, now: number, slots: number | null): AvailabilityKind {
  if (challenge.status === 'cancelled') return 'cancelled'
  if (challenge.status === 'completed') return 'completed'
  if (challenge.status === 'finalizing') return 'finalizing'

  const opens = Date.parse(challenge.registrationOpensAt)
  const start = Date.parse(challenge.playWindowStart)
  const end = Date.parse(challenge.playWindowEnd)
  if (!isSupportedGame(challenge.gameType) || !Number.isFinite(now) ||
      ![opens, start, end].every(Number.isFinite) || opens >= start || start >= end) {
    return 'unknown'
  }
  if (now >= end) return 'closed'
  if (now >= start) return 'live'
  if (now < opens) return 'upcoming'
  if (!REGISTRABLE_STATUSES.includes(challenge.status) || slots === null) return 'unknown'
  if (slots === 0) return 'full'
  return 'open'
}

// Presentation only. Registration and payment continue to be checked by the server.
export function getChallengeAvailability(challenge: ChallengeSchedule, now: number): ChallengeAvailability {
  const slots = freeSlots(challenge)
  const kind = availabilityKind(challenge, now, slots)
  return { kind, slots, canRegister: kind === 'open', priority: AVAILABILITY_PRIORITY[kind] }
}

export function sortChallenges<T extends Challenge>(challenges: readonly T[], now: number): T[] {
  return [...challenges].sort((a, b) =>
    getChallengeAvailability(a, now).priority - getChallengeAvailability(b, now).priority ||
    Date.parse(a.playWindowStart) - Date.parse(b.playWindowStart) || a.id.localeCompare(b.id),
  )
}
