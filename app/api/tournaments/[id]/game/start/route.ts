import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Game2048 } from '@/lib/game/engine'
import { DeterministicRNG, generateGameSeed } from '@/lib/game/rng'
import { checkPlayWindow } from '@/lib/tournament/helpers'
import type { Tournament, Game } from '@/types/database'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })
  const userId = user.id

  const { id: tournamentId } = await params
  const supabase = createAdminClient()

  // Verificar que el usuario no esté baneado
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_banned')
    .eq('id', userId)
    .single()

  if (profile?.is_banned) {
    return Response.json({ error: 'Tu cuenta ha sido suspendida.' }, { status: 403 })
  }

  // Obtener torneo
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single()

  if (!tournament) return Response.json({ error: 'Torneo no encontrado' }, { status: 404 })

  const playability = checkPlayWindow(tournament as Tournament)
  if (!playability.ok) {
    return Response.json({ error: playability.reason }, { status: 400 })
  }

  // Verificar inscripción
  const { data: registration } = await supabase
    .from('registrations')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .single()

  if (!registration) {
    return Response.json({ error: 'No estás inscrito en este torneo' }, { status: 403 })
  }

  // Verificar si ya existe una partida
  const { data: existingGame } = await supabase
    .from('games')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .single()

  if (existingGame) {
    const game = existingGame as Game
    if (game.status === 'completed' || game.status === 'abandoned') {
      return Response.json({ error: 'Tu partida en este torneo ya finalizó' }, { status: 400 })
    }
    // Retornar estado actual para reanudar
    return Response.json({
      gameId: game.id,
      board: game.current_board,
      score: game.final_score,
      moveCount: game.move_count,
      seed: game.seed,
      moveNumber: game.move_count + 2, // +2 por los dos spawns iniciales
      resuming: true,
    })
  }

  // Crear nueva partida
  const seed = generateGameSeed(tournamentId, userId)
  const gameBoard = new Game2048()
  gameBoard.spawnTile(new DeterministicRNG(seed, 0))
  gameBoard.spawnTile(new DeterministicRNG(seed, 1))

  const { data: newGame, error: insertErr } = await supabase
    .from('games')
    .insert({
      tournament_id: tournamentId,
      user_id: userId,
      seed,
      status: 'active',
      final_score: 0,
      highest_tile: 0,
      move_count: 0,
      current_board: gameBoard.board,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insertErr || !newGame) {
    return Response.json({ error: `Error creando partida: ${insertErr?.message}` }, { status: 500 })
  }

  return Response.json({
    gameId: newGame.id,
    board: gameBoard.board,
    score: 0,
    moveCount: 0,
    seed,
    moveNumber: 2,
    resuming: false,
  })
}
