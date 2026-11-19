import type { Challenge } from './challenge'

export function totalPrizeCents(challenge: Pick<Challenge, 'prizeCents'>): number {
  return challenge.prizeCents.reduce((sum, cents) => sum + cents, 0)
}
