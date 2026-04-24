import { createClient } from '@/lib/supabase/server'
import { Game2048 } from '@/lib/game/engine'
import { DeterministicRNG } from '@/lib/game/rng'
import type { PracticeMoveRequest, PracticeMoveResponse } from '@/types/game'

const VALID_DIRECTIONS = new Set(['up', 'down', 'left', 'right'])

export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })
  const userId = user.id

  let body: PracticeMoveRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { board, score, direction, moveNumber, seed } = body

  // Validaciones básicas
  if (!VALID_DIRECTIONS.has(direction)) {
    return Response.json({ error: `Dirección inválida: ${direction}` }, { status: 400 })
  }
  if (!Array.isArray(board) || board.length !== 4 || board.some((r) => r.length !== 4)) {
    return Response.json({ error: 'Board inválido' }, { status: 400 })
  }
  if (typeof score !== 'number' || score < 0) {
    return Response.json({ error: 'Score inválido' }, { status: 400 })
  }
  if (typeof moveNumber !== 'number' || moveNumber < 2) {
    return Response.json({ error: 'moveNumber inválido' }, { status: 400 })
  }
  if (typeof seed !== 'string' || !seed.startsWith('practice:')) {
    return Response.json({ error: 'Seed inválido para modo práctica' }, { status: 400 })
  }
  // El seed debe pertenecer al usuario autenticado
  if (!seed.startsWith(`practice:${userId}:`)) {
    return Response.json({ error: 'Seed no pertenece a este usuario' }, { status: 403 })
  }

  const game = new Game2048(board, score)
  const rng = new DeterministicRNG(seed, moveNumber)
  const result = game.applyMove(direction, rng)

  const gameOver = !game.canMove()

  const responseBody: PracticeMoveResponse = {
    board: game.board,
    score: game.score,
    scoreGained: result.scoreGained,
    moved: result.moved,
    gameOver,
    spawnedTile: result.spawnedTile,
    moveNumber: result.moved ? moveNumber + 1 : moveNumber,
  }

  return Response.json(responseBody)
}
