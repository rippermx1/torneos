import {
  getChallengeAvailability, totalPrizeCents, type AvailabilityKind, type Challenge,
} from '@entities/challenge'
import { interpolate, type ContentRegistry } from '@shared/content'
import { formatDateTime, formatMoney, secondsToMinutes } from '@shared/lib/format'
import type { BadgeTone } from '@shared/ui'
import { AVAILABILITY_TONE } from '../config/availability-tone'

export type ChallengeCardContent = ContentRegistry['challenge-card']

export interface AvailabilityBadgeViewModel {
  tone: BadgeTone
  label: string
}

export interface ChallengeCardViewModel {
  href: string
  gameLabel: string
  title: string
  availability: AvailabilityBadgeViewModel
  facts: ReadonlyArray<{ id: string; label: string; value: string }>
  schedule: readonly string[]
  capacity: string
  minimum: string
  cta: string
}

/** Kinds where registration is over: capacity shows only the final count. */
const REGISTRATION_OVER: readonly AvailabilityKind[] = ['live', 'finalizing', 'closed', 'completed', 'cancelled']
/** Kinds whose ranking is worth opening from the card. */
const RANKING_VISIBLE: readonly AvailabilityKind[] = ['live', 'finalizing', 'closed']

export function toAvailabilityBadgeViewModel(
  challenge: Challenge, now: number, content: ChallengeCardContent,
): AvailabilityBadgeViewModel {
  const { kind } = getChallengeAvailability(challenge, now)
  return { tone: AVAILABILITY_TONE[kind], label: content.availability[kind] }
}

function capacityText(
  challenge: Challenge, kind: AvailabilityKind, slots: number | null, content: ChallengeCardContent,
): string {
  if (slots === null) return content.capacity.unknown
  const counts = { registered: challenge.registeredCount ?? 0, max: challenge.maxPlayers }
  if (REGISTRATION_OVER.includes(kind)) return interpolate(content.capacity.closed, counts)
  return interpolate(content.capacity.open, { ...counts, slots })
}

export function toChallengeCardViewModel(input: {
  challenge: Challenge
  now: number
  content: ChallengeCardContent
  href: string
}): ChallengeCardViewModel {
  const { challenge, now, content, href } = input
  const { kind, slots } = getChallengeAvailability(challenge, now)
  const { schedule } = content
  const entryFee = challenge.entryFeeCents === 0 ? content.entryFee.free : formatMoney(challenge.entryFeeCents)
  return {
    href,
    gameLabel: content.gameLabel,
    title: challenge.name,
    availability: toAvailabilityBadgeViewModel(challenge, now, content),
    facts: [
      { id: 'entry-fee', label: content.entryFee.label, value: entryFee },
      { id: 'total-prize', label: content.totalPrize.label, value: formatMoney(totalPrizeCents(challenge)) },
    ],
    schedule: [
      interpolate(schedule.registrationOpens, { date: formatDateTime(challenge.registrationOpensAt) }),
      interpolate(schedule.registrationCloses, { date: formatDateTime(challenge.playWindowStart) }),
      interpolate(schedule.playWindow, {
        start: formatDateTime(challenge.playWindowStart),
        end: formatDateTime(challenge.playWindowEnd),
      }),
      interpolate(schedule.format, { minutes: secondsToMinutes(challenge.maxGameDurationSeconds) }),
    ],
    capacity: capacityText(challenge, kind, slots, content),
    minimum: interpolate(content.minimum, { min: challenge.minPlayers }),
    cta: RANKING_VISIBLE.includes(kind) ? content.cta.viewRanking : content.cta.viewRules,
  }
}
