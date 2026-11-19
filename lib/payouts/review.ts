import type { createAdminClient } from '@/lib/supabase/server'
import { computeIntervalStats, reviewWinnerStats } from '@/lib/anticheat/winner-review'

export const OPEN_PAYOUT_STATUSES = ['pending', 'claimed', 'approved', 'transferring', 'reconciling'] as const

export function financialError(error: { code?: string; message: string }): Response {
  const status = /^PT(400|402|403|404|409|422|423|429)$/.test(error.code ?? '')
    ? Number(error.code!.slice(2)) : error.code === '23505' ? 409 : 503
  return Response.json({ error: status === 503 ? 'Resultado incierto. Consulta el estado antes de repetir; no transfieras nuevamente.' : error.message }, { status })
}

// Read every stored move: PostgREST's first-page limit must not hide bursts.
export async function loadPrizeEvidence(admin: ReturnType<typeof createAdminClient>, tournamentId: string, userId: string) {
  const { data: game, error } = await admin.from('games').select('id, move_count, final_score, status')
    .eq('tournament_id', tournamentId).eq('user_id', userId).single()
  if (error || !game || game.status !== 'completed') throw new Error('Partida completa no disponible para revisar')
  const timestamps: number[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error: movesError } = await admin.from('game_moves').select('server_timestamp')
      .eq('game_id', game.id).order('move_number', { ascending: true }).range(offset, offset + 499)
    if (movesError || !data) throw new Error('No se pudo cargar la evidencia completa')
    for (const move of data) {
      const stamp = Date.parse(move.server_timestamp)
      if (!Number.isFinite(stamp) || (timestamps.length > 0 && stamp < timestamps.at(-1)!)) throw new Error('Cronología de movimientos inválida')
      timestamps.push(stamp)
    }
    if (data.length < 500) break
    if (offset >= 100000) throw new Error('Evidencia excede el límite de revisión manual')
  }
  // The initial two tile spawns consume sequence numbers, but are not moves.
  if (timestamps.length !== Number(game.move_count)) throw new Error('Historial de movimientos incompleto: conciliar partida')
  const stats = { moveCount: Number(game.move_count), finalScore: Number(game.final_score), ...computeIntervalStats(timestamps) }
  return { games: [{ id: game.id, ...stats }], flags: reviewWinnerStats(stats), loaded_at: new Date().toISOString() }
}
