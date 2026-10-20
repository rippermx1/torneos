import type { Tournament } from '@/types/database'

export type PublicTournament = Pick<Tournament,
  'id' | 'name' | 'game_type' | 'status' | 'entry_fee_cents' |
  'prize_1st_cents' | 'prize_2nd_cents' | 'prize_3rd_cents' |
  'registration_opens_at' | 'play_window_start' | 'play_window_end' |
  'min_players' | 'max_players' | 'max_game_duration_seconds'
> & { registeredCount: number | null; preset_key?: Tournament['preset_key'] }

type AvailabilityKind = 'open' | 'upcoming' | 'full' | 'live' | 'closed' | 'completed' | 'cancelled' | 'unknown'

export interface TournamentAvailability {
  kind: AvailabilityKind
  label: string
  canRegister: boolean
  slots: number | null
  priority: number
}

export function normalizeRegistrationCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

// Presentation only. Registration and payment continue to be checked by the server.
export function getTournamentAvailability(
  tournament: Pick<PublicTournament, 'game_type' | 'status' | 'registration_opens_at' | 'play_window_start' | 'play_window_end' | 'max_players' | 'registeredCount'>,
  now = Date.now(),
): TournamentAvailability {
  const count = normalizeRegistrationCount(tournament.registeredCount)
  const capacity = Number.isSafeInteger(tournament.max_players) && tournament.max_players > 0
  const slots = count !== null && capacity ? Math.max(0, tournament.max_players - count) : null
  const state = (kind: AvailabilityKind, label: string, priority: number): TournamentAvailability =>
    ({ kind, label, priority, slots, canRegister: kind === 'open' })

  if (tournament.status === 'cancelled') return state('cancelled', 'Cancelado', 7)
  if (tournament.status === 'completed') return state('completed', 'Finalizado', 6)
  if (tournament.status === 'finalizing') return state('closed', 'Finalizando resultados', 5)

  const opens = Date.parse(tournament.registration_opens_at)
  const start = Date.parse(tournament.play_window_start)
  const end = Date.parse(tournament.play_window_end)
  if (tournament.game_type !== '2048_score' || !Number.isFinite(now) ||
      ![opens, start, end].every(Number.isFinite) || opens >= start || start >= end) {
    return state('unknown', 'Disponibilidad por confirmar', 3)
  }
  if (now >= end) return state('closed', 'Partidas cerradas', 5)
  if (now >= start) return state('live', 'En curso · inscripción cerrada', 4)
  if (now < opens) return state('upcoming', 'Próximamente', 1)
  if (!['scheduled', 'open'].includes(tournament.status) || slots === null) {
    return state('unknown', 'Disponibilidad por confirmar', 3)
  }
  if (slots === 0) return state('full', 'Cupos completos', 2)
  return state('open', 'Inscripciones abiertas', 0)
}

export function sortPublicTournaments(tournaments: PublicTournament[], now = Date.now()) {
  return [...tournaments].sort((a, b) =>
    getTournamentAvailability(a, now).priority - getTournamentAvailability(b, now).priority ||
    Date.parse(a.play_window_start) - Date.parse(b.play_window_start) || a.id.localeCompare(b.id),
  )
}
