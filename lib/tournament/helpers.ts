import type { Tournament } from '@/types/database'

export type TournamentPlayability =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'cancelled' | 'window_not_open' | 'window_closed' | 'completed' }

// Determina si un torneo está dentro de su ventana de juego.
// Usamos timestamps directamente porque el cron (paso 6) aún no existe.
export function checkPlayWindow(tournament: Tournament): TournamentPlayability {
  if (!tournament) return { ok: false, reason: 'not_found' }
  if (tournament.status === 'cancelled') return { ok: false, reason: 'cancelled' }
  if (tournament.status === 'completed') return { ok: false, reason: 'completed' }

  const now = Date.now()
  const start = new Date(tournament.play_window_start).getTime()
  const end = new Date(tournament.play_window_end).getTime()

  if (now < start) return { ok: false, reason: 'window_not_open' }
  if (now > end) return { ok: false, reason: 'window_closed' }

  return { ok: true }
}

export function checkRegistrationWindow(tournament: Tournament): TournamentPlayability {
  if (!tournament) return { ok: false, reason: 'not_found' }
  if (tournament.status === 'cancelled') return { ok: false, reason: 'cancelled' }
  if (tournament.status === 'completed') return { ok: false, reason: 'completed' }

  const now = Date.now()
  const registrationOpens = new Date(tournament.registration_opens_at).getTime()
  const playStart = new Date(tournament.play_window_start).getTime()

  if (now < registrationOpens) return { ok: false, reason: 'window_not_open' }
  // Cortar inscripciones al inicio de la ventana de juego
  if (now > playStart) return { ok: false, reason: 'window_closed' }

  return { ok: true }
}

export const PLAY_WINDOW_ERROR: Record<string, string> = {
  not_found: 'Torneo no encontrado.',
  cancelled: 'Este torneo fue cancelado.',
  window_not_open: 'La ventana de juego aún no ha comenzado.',
  window_closed: 'La ventana de juego ya cerró.',
  completed: 'Este torneo ya finalizó.',
}
