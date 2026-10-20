import type { Tournament } from '@/types/database'
import { isCommunityFreeTournament } from '@/lib/tournament/community-free'

export const COMMUNITY_REPORT_MAX_EVENTS = 30
export const COMMUNITY_REPORT_MAX_ROWS = 450
export const COMMUNITY_REPORT_LIMITATIONS = [
  'Participaciones por cuenta; no equivale a personas ni a consentimiento humano verificado.',
  'Primer movimiento significa move_count > 0 en una partida válida del servidor. Abrir la página no cuenta.',
  'Retorno al siguiente reto no cancelado: sólo se calcula cuando ambos resultados son oficiales. No es D1/D7.',
  'Las pruebas QA deben identificarse y limpiarse por separado antes de interpretar resultados comerciales.',
  'Se muestran hasta 30 retos; no representa el historial completo ni los torneos pagados.',
] as const

export interface CommunityRegistrationInput { tournament_id: string; user_id: string }
export interface CommunityGameInput {
  tournament_id: string; user_id: string; status: string; started_at: string | null; move_count: number
}
export interface CommunityEventReport {
  tournamentId: string; name: string; status: Tournament['status']; startsAt: string; closesAt: string
  registrations: number; starts: number; firstMoves: number; completed: number
  nextTournamentId: string | null
  returnToNext: { eligibleAccounts: number; returnedAccounts: number; rate: number | null } | null
}

/** Internal IDs are used only for intersections and never included in output. */
export function buildCommunity2048Report(tournaments: Tournament[], registrations: CommunityRegistrationInput[], games: CommunityGameInput[]) {
  if (tournaments.length > COMMUNITY_REPORT_MAX_EVENTS || registrations.length > COMMUNITY_REPORT_MAX_ROWS
    || games.length > COMMUNITY_REPORT_MAX_ROWS) throw new Error('COMMUNITY_REPORT_BOUND_EXCEEDED')
  const events = tournaments.filter(tournament => tournament.preset_key === 'community_free_v1' && !tournament.is_test)
  if (events.some(tournament => !isCommunityFreeTournament(tournament))) throw new Error('COMMUNITY_REPORT_INVALID_FORMAT')
  if (new Set(events.map(tournament => tournament.id)).size !== events.length) throw new Error('COMMUNITY_REPORT_DUPLICATE_EVENT')
  events.sort((a, b) => Date.parse(a.play_window_start) - Date.parse(b.play_window_start) || a.id.localeCompare(b.id))
  const registered = new Map(events.map(tournament => [tournament.id, new Set<string>()]))
  for (const row of registrations) if (typeof row.user_id === 'string' && row.user_id) registered.get(row.tournament_id)?.add(row.user_id)
  const starts = new Map(events.map(tournament => [tournament.id, new Set<string>()]))
  const firstMoves = new Map(events.map(tournament => [tournament.id, new Set<string>()]))
  const completed = new Map(events.map(tournament => [tournament.id, new Set<string>()]))
  for (const game of games) {
    if (!registered.get(game.tournament_id)?.has(game.user_id) || !['active', 'completed'].includes(game.status)) continue
    if (!game.started_at || !Number.isFinite(Date.parse(game.started_at)) || !Number.isSafeInteger(game.move_count) || game.move_count < 0) {
      throw new Error('COMMUNITY_REPORT_INVALID_GAME')
    }
    starts.get(game.tournament_id)!.add(game.user_id)
    if (game.move_count > 0) firstMoves.get(game.tournament_id)!.add(game.user_id)
    if (game.status === 'completed') completed.get(game.tournament_id)!.add(game.user_id)
  }
  const reports: CommunityEventReport[] = events.map((tournament, index) => {
    const next = tournament.status === 'cancelled' ? undefined : events.slice(index + 1).find(event => event.status !== 'cancelled')
    let returnToNext: CommunityEventReport['returnToNext'] = null
    if (tournament.status === 'completed' && next?.status === 'completed') {
      const eligible = firstMoves.get(tournament.id)!, returned = firstMoves.get(next.id)!
      const returnedAccounts = [...eligible].filter(id => returned.has(id)).length
      returnToNext = { eligibleAccounts: eligible.size, returnedAccounts, rate: eligible.size ? returnedAccounts / eligible.size : null }
    }
    return { tournamentId: tournament.id, name: tournament.name, status: tournament.status,
      startsAt: tournament.play_window_start, closesAt: tournament.play_window_end,
      registrations: registered.get(tournament.id)!.size, starts: starts.get(tournament.id)!.size,
      firstMoves: firstMoves.get(tournament.id)!.size, completed: completed.get(tournament.id)!.size,
      nextTournamentId: next?.id ?? null, returnToNext }
  })
  return { version: 1 as const, source: 'server_tournament_games' as const, unit: 'account_participations' as const,
    maxEvents: COMMUNITY_REPORT_MAX_EVENTS, events: reports.reverse(), limitations: COMMUNITY_REPORT_LIMITATIONS }
}

/** All three queries are bounded; an incomplete response is unknown, not zero. */
export async function readCommunity2048Report(db: import('@supabase/supabase-js').SupabaseClient<import('@/types/database').Database>) {
  const tournaments = await db.from('tournaments').select('*').eq('preset_key', 'community_free_v1')
    .eq('is_test', false).eq('game_type', '2048_score').order('play_window_start', { ascending: false }).order('id', { ascending: false })
    .limit(COMMUNITY_REPORT_MAX_EVENTS)
  if (tournaments.error || !Array.isArray(tournaments.data)) throw new Error('COMMUNITY_REPORT_UNAVAILABLE')
  const ids = tournaments.data.map(tournament => tournament.id)
  if (!ids.length) return buildCommunity2048Report([], [], [])
  const [registrations, games] = await Promise.all([
    db.from('registrations').select('tournament_id, user_id', { count: 'exact' }).in('tournament_id', ids).limit(COMMUNITY_REPORT_MAX_ROWS),
    db.from('games').select('tournament_id, user_id, status, started_at, move_count', { count: 'exact' }).in('tournament_id', ids).limit(COMMUNITY_REPORT_MAX_ROWS),
  ])
  for (const result of [registrations, games]) if (result.error || !Array.isArray(result.data)
    || !Number.isSafeInteger(result.count) || result.count! < 0 || result.count! > COMMUNITY_REPORT_MAX_ROWS
    || result.data.length !== result.count) throw new Error('COMMUNITY_REPORT_INCOMPLETE')
  return buildCommunity2048Report(tournaments.data, registrations.data!, games.data!)
}
