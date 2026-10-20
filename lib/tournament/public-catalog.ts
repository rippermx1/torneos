import { createAdminClient, createClient } from '@/lib/supabase/server'
import { isLocalEnvironment } from '@/lib/dev/local-environment'
import { normalizeRegistrationCount, sortPublicTournaments, type PublicTournament } from './availability'

const PUBLIC_COLUMNS = 'id,name,preset_key,game_type,status,entry_fee_cents,prize_1st_cents,prize_2nd_cents,prize_3rd_cents,registration_opens_at,play_window_start,play_window_end,min_players,max_players,max_game_duration_seconds'

export async function getPublicTournaments(): Promise<{ tournaments: PublicTournament[]; error: boolean; asOf: number }> {
  const supabase = await createClient()
  let query = supabase.from('tournaments')
    .select(PUBLIC_COLUMNS)
  if (!isLocalEnvironment()) query = query.eq('is_test', false)
  const { data, error } = await query
    .eq('game_type', '2048_score')
    .in('status', ['scheduled', 'open', 'live'])
    .order('play_window_start', { ascending: true })

  if (error || !data) return { tournaments: [], error: true, asOf: Date.now() }
  const tournaments = data as Omit<PublicTournament, 'registeredCount'>[]
  const counts = new Map<string, number | null>()
  if (tournaments.length) {
    try {
      // A single server query returns only aggregates, never participant records.
      // Use admin so a player's own-registration RLS cannot undercount capacity.
      const { data: countData, error: countError } = await createAdminClient().from('tournaments')
        .select('id,registrations(count)')
        .in('id', tournaments.map((t) => t.id))
      if (!countError && countData) {
        const rows = countData as unknown as Array<{ id: string; registrations: Array<{ count: number }> }>
        for (const row of rows) counts.set(row.id, normalizeRegistrationCount(row.registrations?.[0]?.count))
      }
    } catch {
      // A missing service key or failed count must not look like an empty tournament.
    }
  }

  const asOf = Date.now()
  return {
    tournaments: sortPublicTournaments(tournaments.map((t) => ({ ...t, registeredCount: counts.get(t.id) ?? null })), asOf),
    error: false,
    asOf,
  }
}
