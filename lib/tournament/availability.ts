import type { Tournament } from '@/types/database'
import {
  getChallengeAvailability, normalizeRegistrationCount, sortChallenges, toChallenge, toChallengeSchedule,
  type AvailabilityKind as ChallengeAvailabilityKind,
} from '@entities/challenge'

export type PublicTournament = Pick<Tournament,
  'id' | 'name' | 'game_type' | 'status' | 'entry_fee_cents' |
  'prize_1st_cents' | 'prize_2nd_cents' | 'prize_3rd_cents' |
  'registration_opens_at' | 'play_window_start' | 'play_window_end' |
  'min_players' | 'max_players' | 'max_game_duration_seconds'
> & { registeredCount: number | null }

type AvailabilityKind = 'open' | 'upcoming' | 'full' | 'live' | 'closed' | 'completed' | 'cancelled' | 'unknown'

export interface TournamentAvailability {
  kind: AvailabilityKind
  label: string
  canRegister: boolean
  slots: number | null
  priority: number
}

// Legacy labels for pages not yet migrated; the challenge-card widget reads content/es-CL.
const LEGACY_LABELS: Record<ChallengeAvailabilityKind, string> = {
  open: 'Inscripciones abiertas',
  upcoming: 'Próximamente',
  full: 'Cupos completos',
  live: 'En curso · inscripción cerrada',
  finalizing: 'Finalizando resultados',
  closed: 'Partidas cerradas',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
  unknown: 'Disponibilidad por confirmar',
}

export { normalizeRegistrationCount }

// Presentation only. Registration and payment continue to be checked by the server.
export function getTournamentAvailability(
  tournament: Pick<PublicTournament, 'game_type' | 'status' | 'registration_opens_at' | 'play_window_start' | 'play_window_end' | 'max_players' | 'registeredCount'>,
  now = Date.now(),
): TournamentAvailability {
  const availability = getChallengeAvailability(toChallengeSchedule(tournament), now)
  // Legacy callers group finalizing with closed; the label still tells them apart.
  const kind = availability.kind === 'finalizing' ? 'closed' : availability.kind
  return { ...availability, kind, label: LEGACY_LABELS[availability.kind] }
}

export function sortPublicTournaments(tournaments: PublicTournament[], now = Date.now()) {
  const rows = new Map(tournaments.map((tournament) => [toChallenge(tournament), tournament]))
  return sortChallenges([...rows.keys()], now).map((challenge) => rows.get(challenge)!)
}
