import type { createAdminClient } from '@/lib/supabase/server'
import { GAME_SNAPSHOT_FIELDS, type SnapshotGame } from './game-snapshot-response'

type ClosedGame = SnapshotGame
const fields = GAME_SNAPSHOT_FIELDS
const unconfirmed = () => ({
  ok: false as const,
  response: Response.json({
    error: 'No se pudo confirmar el cierre de la partida. Recupera su estado antes de continuar.',
    code: 'GAME_CLOSURE_UNCONFIRMED',
  }, { status: 503 }),
})
function isClosed(game: ClosedGame | null): game is ClosedGame {
  return !!game && (game.status === 'completed' || game.status === 'abandoned')
    && Number.isSafeInteger(game.final_score) && game.final_score >= 0
}

// UPDATE RETURNING supplies the persisted score after any preceding move. If
// another closer won, read its result; never retry the write or invent a closure.
export async function closeExpiredGame(
  db: ReturnType<typeof createAdminClient>,
  identity: { gameId: string; tournamentId: string; userId: string },
) {
  try {
    const { data, error } = await db.from('games')
      .update({ status: 'completed', end_reason: 'timeout', ended_at: new Date().toISOString() })
      .eq('id', identity.gameId)
      .eq('tournament_id', identity.tournamentId)
      .eq('user_id', identity.userId)
      .eq('status', 'active')
      .select(fields)
      .maybeSingle()
    if (error) return unconfirmed()
    if (isClosed(data)) return { ok: true as const, game: data }
    if (data) return unconfirmed()

    const current = await db.from('games').select(fields)
      .eq('id', identity.gameId)
      .eq('tournament_id', identity.tournamentId)
      .eq('user_id', identity.userId)
      .maybeSingle()
    if (current.error || !isClosed(current.data)) return unconfirmed()
    return { ok: true as const, game: current.data }
  } catch {
    // The transport can fail after committing. Recovery is a read, not a retry.
    return unconfirmed()
  }
}
