import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { randomUUID } from 'crypto'
import { Game2048 } from '@/lib/game/engine'
import { DeterministicRNG } from '@/lib/game/rng'
import type { PracticeStartResponse } from '@/types/game'

export async function POST(): Promise<Response> {
  const auth = await requireAnyRoleForApi(['user'])
  if (!auth.ok) return auth.response

  const userId = auth.access.userId

  // Seed único por partida de práctica. No necesita ser reproducible entre sesiones.
  const seed = `practice:${userId}:${randomUUID()}`

  // Dos spawns iniciales, igual que el 2048 original.
  // Usamos moveNumber 0 y 1 para los tiles de inicio.
  const game = new Game2048()
  game.spawnTile(new DeterministicRNG(seed, 0))
  game.spawnTile(new DeterministicRNG(seed, 1))

  const body: PracticeStartResponse = {
    board: game.board,
    score: 0,
    seed,
    moveNumber: 2, // el primer movimiento del usuario será el número 2
  }

  return Response.json(body)
}
