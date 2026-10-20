import { createClient } from '@/lib/supabase/server'
import { loadTournamentLeaderboard } from '@/lib/tournament/leaderboard'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
    return Response.json({ error: 'Torneo inválido.' }, { status: 400, headers })
  }
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return Response.json({ error: 'Inicia sesión para consultar los resultados.' }, { status: 401, headers })
    const ranking = await loadTournamentLeaderboard(id)
    if (!ranking || ranking.tournament.game_type !== '2048_score') {
      return Response.json({ error: 'Torneo no encontrado.' }, { status: 404, headers })
    }
    const official = ranking.tournament.status === 'completed'
    return Response.json({ tournamentId: id, presetKey: ranking.tournament.preset_key, phase: official ? 'official' : 'provisional',
      rows: ranking.rows.map((row, index) => ({
        position: official ? row.rank : index + 1,
        name: ranking.usernameMap[row.user_id] ?? '—', score: row.final_score,
        highestTile: row.highest_tile, prizeCents: official ? row.prize_awarded_cents ?? 0 : null,
        isMe: row.user_id === user?.id,
      })),
    }, { headers })
  } catch {
    return Response.json({ error: 'No se pudo cargar la tabla de resultados. Reintenta.' }, { status: 503, headers })
  }
}
