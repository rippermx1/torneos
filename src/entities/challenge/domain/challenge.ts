export type ChallengeStatus = 'scheduled' | 'open' | 'live' | 'finalizing' | 'completed' | 'cancelled'

export const SUPPORTED_GAME_TYPES = ['2048_score'] as const

export interface Challenge {
  id: string
  name: string
  gameType: string
  status: ChallengeStatus
  entryFeeCents: number
  prizeCents: readonly number[]
  registrationOpensAt: string
  playWindowStart: string
  playWindowEnd: string
  minPlayers: number
  maxPlayers: number
  maxGameDurationSeconds: number
  registeredCount: number | null
}

/** The fields availability depends on. */
export type ChallengeSchedule = Pick<Challenge,
  'gameType' | 'status' | 'registrationOpensAt' | 'playWindowStart' | 'playWindowEnd' | 'maxPlayers' | 'registeredCount'>
