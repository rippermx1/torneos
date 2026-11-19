// Type-only import: the legacy module delegates to this entity at runtime.
import type { PublicTournament } from '@/lib/tournament/availability'
import type { Challenge, ChallengeSchedule } from '../domain/challenge'

type ScheduleRow = Pick<PublicTournament,
  'game_type' | 'status' | 'registration_opens_at' | 'play_window_start' | 'play_window_end' | 'max_players' | 'registeredCount'>

export function toChallengeSchedule(row: ScheduleRow): ChallengeSchedule {
  return {
    gameType: row.game_type,
    status: row.status,
    registrationOpensAt: row.registration_opens_at,
    playWindowStart: row.play_window_start,
    playWindowEnd: row.play_window_end,
    maxPlayers: row.max_players,
    registeredCount: row.registeredCount,
  }
}

export function toChallenge(row: PublicTournament): Challenge {
  return {
    ...toChallengeSchedule(row),
    id: row.id,
    name: row.name,
    entryFeeCents: row.entry_fee_cents,
    prizeCents: [row.prize_1st_cents, row.prize_2nd_cents, row.prize_3rd_cents],
    minPlayers: row.min_players,
    maxGameDurationSeconds: row.max_game_duration_seconds,
  }
}
