import { createAdminClient } from '@/lib/supabase/server'
import type { Tournament } from '@/types/database'
import { isCommunityFreePresetKey } from './community-free'

export interface TournamentLeaderboardRow {
  user_id: string
  final_score: number
  highest_tile: number
  move_count?: number
  status?: string
  prize_awarded_cents?: number
  rank?: number
}

// Shared by the public ranking page and the post-game table. Read only.
export async function loadTournamentLeaderboard(id: string) {
  const db = createAdminClient()
  const { data, error } = await db.from('tournaments').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error('No se pudo consultar el torneo.')
  if (!data) return null
  const tournament = data as Tournament
  let rows: TournamentLeaderboardRow[]
  if (tournament.status === 'completed') {
    const result = await db.from('tournament_results')
      .select('user_id, rank, final_score, prize_awarded_cents')
      .eq('tournament_id', id).order('rank', { ascending: true }).limit(50)
    if (result.error) throw new Error('No se pudieron consultar los resultados oficiales.')
    rows = (result.data ?? []).map(row => ({ ...row, highest_tile: 0 }))
    if (rows.length && isCommunityFreePresetKey(tournament.preset_key)) {
      const games = await db.from('games').select('user_id,highest_tile,final_score').eq('tournament_id', id).eq('status', 'completed')
        .in('user_id', rows.map(row => row.user_id))
      if (games.error) throw new Error('No se pudieron confirmar las fichas de los resultados oficiales.')
      const byUser = new Map((games.data ?? []).map(game => [game.user_id, game]))
      rows = rows.map(row => {
        const game = byUser.get(row.user_id)
        if (!game || game.final_score !== row.final_score || !Number.isSafeInteger(game.highest_tile) || game.highest_tile < 0) throw new Error('Resultado oficial incompleto.')
        return { ...row, highest_tile: game.highest_tile }
      })
    }
  } else {
    const result = await db.from('games')
      .select('user_id, final_score, highest_tile, move_count, status')
      .eq('tournament_id', id).in('status', ['completed', 'active'])
      .order('final_score', { ascending: false }).order('highest_tile', { ascending: false })
      .order('move_count', { ascending: true }).order('user_id', { ascending: true }).limit(50)
    if (result.error) throw new Error('No se pudo consultar la clasificación provisional.')
    rows = result.data ?? []
  }
  const userIds = [...new Set(rows.map(row => row.user_id))]
  const profiles = userIds.length
    ? await db.from('profiles').select('id, username').in('id', userIds)
    : { data: [], error: null }
  if (profiles.error) throw new Error('No se pudieron consultar los nombres de jugadores.')
  const usernameMap: Record<string, string> = Object.fromEntries(
    (profiles.data ?? []).map(profile => [profile.id, profile.username]))
  return { tournament, rows, usernameMap }
}
