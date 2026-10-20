import type { Tournament } from '@/types/database'

export const COMMUNITY_FREE_PRESET_KEY = 'community_free_v1' as const
export const COMMUNITY_FREE_BUSINESS_RULE_VERSION = 4 as const
export const COMMUNITY_FREE_WINDOW_MS = 24 * 60 * 60 * 1000
export const COMMUNITY_FREE_CONFIG = {
  preset_key: COMMUNITY_FREE_PRESET_KEY,
  business_rule_version: COMMUNITY_FREE_BUSINESS_RULE_VERSION,
  tournament_type: 'freeroll',
  game_type: '2048_score',
  prize_model: 'fixed',
  is_test: false,
  entry_fee_cents: 0,
  prize_1st_cents: 0,
  prize_2nd_cents: 0,
  prize_3rd_cents: 0,
  prize_fund_bps: 5500,
  platform_fee_bps: 4500,
  prize_1st_bps: 7500,
  prize_2nd_bps: 2500,
  prize_3rd_bps: 0,
  min_players: 2,
  max_players: 15,
  max_game_duration_seconds: 300,
  skill_tier: null,
} as const satisfies Partial<Tournament>

export type CommunityFreeTournamentFields = typeof COMMUNITY_FREE_CONFIG & Pick<
  Tournament, 'registration_opens_at' | 'play_window_start' | 'play_window_end'
>

export function isCommunityFreePresetKey(value: unknown): value is typeof COMMUNITY_FREE_PRESET_KEY {
  return value === COMMUNITY_FREE_PRESET_KEY
}

function instant(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const dateOnly = Date.parse(`${value.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(dateOnly) || new Date(dateOnly).toISOString().slice(0, 10) !== value.slice(0, 10)) return null
  const at = Date.parse(value)
  return Number.isFinite(at) ? at : null
}

/** A preset label alone never authorizes a monetary or malformed tournament. */
export function isCommunityFreeTournament(value: unknown): value is CommunityFreeTournamentFields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  if (!Object.entries(COMMUNITY_FREE_CONFIG).every(([key, expected]) => row[key] === expected)) return false
  const registration = instant(row.registration_opens_at), start = instant(row.play_window_start), end = instant(row.play_window_end)
  return registration !== null && start !== null && end !== null && registration < start && end - start === COMMUNITY_FREE_WINDOW_MS
}

/** Only identity/text/status are supplied by the administrative creator. */
export function buildCommunityFreeTournamentFields(input: {
  registrationOpensAt: string
  playWindowStart: string
}): CommunityFreeTournamentFields {
  const registration = instant(input.registrationOpensAt), start = instant(input.playWindowStart)
  if (registration === null || start === null || registration >= start) throw new Error('La inscripción debe abrir antes del reto comunitario.')
  const end = start + COMMUNITY_FREE_WINDOW_MS
  if (!Number.isFinite(new Date(end).getTime())) throw new Error('La ventana del reto comunitario es inválida.')
  return { ...COMMUNITY_FREE_CONFIG, registration_opens_at: new Date(registration).toISOString(),
    play_window_start: new Date(start).toISOString(), play_window_end: new Date(end).toISOString() }
}

export function communityFreeLatestStartMs(tournament: Pick<Tournament, 'play_window_end' | 'max_game_duration_seconds'>) {
  const end = instant(tournament.play_window_end)
  if (end === null || tournament.max_game_duration_seconds !== COMMUNITY_FREE_CONFIG.max_game_duration_seconds) return null
  return end - COMMUNITY_FREE_CONFIG.max_game_duration_seconds * 1000
}

export function canStartCommunityFreeTournament(tournament: Pick<Tournament,
  'preset_key' | 'status' | 'play_window_start' | 'play_window_end' | 'max_game_duration_seconds'>, now = Date.now()) {
  if (!isCommunityFreePresetKey(tournament.preset_key) || !['scheduled', 'open', 'live'].includes(tournament.status)
    || !Number.isFinite(now)) return false
  const start = instant(tournament.play_window_start), latest = communityFreeLatestStartMs(tournament)
  return start !== null && latest !== null && now >= start && now <= latest
}
