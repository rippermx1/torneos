import type { Game } from '@/types/database'
import { parseGameSnapshot } from '@/lib/game/game-snapshot'
import { calculateGameDeadline } from './game-deadline'

export type SnapshotGame = Pick<Game, 'id' | 'status' | 'current_board' | 'final_score' | 'move_count' | 'started_at' | 'end_reason' | 'ended_at'>
export const GAME_SNAPSHOT_FIELDS = 'id, status, current_board, final_score, move_count, started_at, end_reason, ended_at'

export function gameSnapshotResponse(game: SnapshotGame, windowEnd: string, duration: number,
  extras: Record<string, unknown> = {}, httpStatus = 200) {
  try {
    const data = { ...extras, stateConfirmed: true, gameId: game.id, status: game.status,
      board: game.current_board, score: game.final_score, moveCount: game.move_count,
      moveNumber: game.move_count + 2, gameOver: game.status !== 'active', endReason: game.end_reason,
      endedAt: game.ended_at, serverNow: new Date().toISOString(),
      deadlineAt: game.started_at ? calculateGameDeadline(game.started_at, windowEnd, duration) : null,
      // Preserve both legacy names while separating the terminal state from its cause.
      timedOut: game.end_reason === 'timeout', timeout: game.end_reason === 'timeout' }
    if (!parseGameSnapshot(data)) throw new Error('Missing snapshot')
    return Response.json(data, { status: httpStatus })
  } catch {
    return Response.json({ error: 'No se pudo recuperar el estado completo de la partida.',
      code: 'GAME_STATE_UNCONFIRMED' }, { status: 503 })
  }
}
