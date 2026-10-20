import type { GameEndReason } from '@/types/database'

export interface GameSnapshot {
  stateConfirmed: true
  gameId: string
  status: 'active' | 'completed' | 'abandoned'
  board: number[][]
  score: number
  moveCount: number
  moveNumber: number
  gameOver: boolean
  endReason: GameEndReason | null
  endedAt: string | null
  deadlineAt: string | null
  serverNow: string
}

// Partial legacy responses are not snapshots and cannot recover an unknown move.
export function parseGameSnapshot(data: Record<string, unknown>): GameSnapshot | null {
  if (data.stateConfirmed === undefined) return null
  const terminal = data.status === 'completed' || data.status === 'abandoned'
  const board = data.board
  if (data.stateConfirmed !== true || (!terminal && data.status !== 'active')
    || typeof data.gameId !== 'string' || !data.gameId
    || !Array.isArray(board) || board.length !== 4
    || board.some(row => !Array.isArray(row) || row.length !== 4)
    || !board.flat().every(value => Number.isSafeInteger(value) && value >= 0)
    || !Number.isSafeInteger(data.score) || Number(data.score) < 0
    || !Number.isSafeInteger(data.moveCount) || Number(data.moveCount) < 0
    || !Number.isSafeInteger(data.moveNumber) || data.moveNumber !== Number(data.moveCount) + 2
    || data.gameOver !== terminal
    || !(data.endReason === null || ['timeout','no_moves','self_ended','invalid'].includes(String(data.endReason)))
    || (!terminal && data.endReason !== null)
    || !(data.endedAt === null || typeof data.endedAt === 'string' && Number.isFinite(Date.parse(data.endedAt)))
    || !(terminal && data.deadlineAt === null || typeof data.deadlineAt === 'string' && Number.isFinite(Date.parse(data.deadlineAt)))
    || typeof data.serverNow !== 'string' || !Number.isFinite(Date.parse(data.serverNow))) {
    throw new Error('No se pudo recuperar un estado de partida completo.')
  }
  return { ...data, board: board.map(row => [...row]) } as unknown as GameSnapshot
}

export function gameResultLabel(status: string | null | undefined, reason: string | null | undefined) {
  if (status === 'abandoned') return 'Partida abandonada'
  if (reason === 'timeout') return 'Tiempo terminado'
  if (reason === 'no_moves') return 'Sin movimientos'
  return 'Partida finalizada'
}
