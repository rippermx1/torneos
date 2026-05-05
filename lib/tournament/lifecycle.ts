import { createAdminClient } from '@/lib/supabase/server'
import type { Tournament } from '@/types/database'

export interface TransitionResult {
  tournamentId: string
  name: string
  action: 'opened' | 'started' | 'cancelled' | 'set_finalizing' | 'finalized' | 'skipped'
  detail?: Record<string, unknown>
  error?: string
}

// Procesa TODOS los torneos que necesitan una transición de estado.
// Llamado por el cron cada minuto.
export async function processTournamentTransitions(): Promise<TransitionResult[]> {
  const supabase = createAdminClient()
  const results: TransitionResult[] = []
  const nowMs = Date.now()

  // Obtener torneos que pueden necesitar transición
  const { data: tournaments, error } = await supabase
    .from('tournaments')
    .select('*')
    .in('status', ['scheduled', 'open', 'live', 'finalizing'])
    .order('play_window_start', { ascending: true })

  if (error) {
    throw new Error(`Error obteniendo torneos: ${error.message}`)
  }

  for (const t of (tournaments ?? []) as Tournament[]) {
    const result = await processSingleTournament(t, nowMs)
    results.push(result)
  }

  return results
}

async function processSingleTournament(
  tournament: Tournament,
  nowMs: number
): Promise<TransitionResult> {
  const supabase = createAdminClient()
  const base = { tournamentId: tournament.id, name: tournament.name }
  let currentStatus = tournament.status
  const previousActions: TransitionResult['action'][] = []

  try {
    // ── scheduled → open ────────────────────────────────────
    if (
      currentStatus === 'scheduled' &&
      nowMs >= new Date(tournament.registration_opens_at).getTime()
    ) {
      const { error } = await supabase
        .from('tournaments')
        .update({ status: 'open' })
        .eq('id', tournament.id)
        .eq('status', 'scheduled') // guard contra race condition

      if (error) throw new Error(error.message)
      currentStatus = 'open'
      previousActions.push('opened')

      if (nowMs < new Date(tournament.play_window_start).getTime()) {
        return { ...base, action: 'opened' }
      }
    }

    // ── open → live o cancelled ──────────────────────────────
    if (currentStatus === 'open' && nowMs >= new Date(tournament.play_window_start).getTime()) {
      const { count } = await supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id)

      const playerCount = count ?? 0

      if (playerCount < tournament.min_players) {
        // No alcanzó mínimo → cancelar y reembolsar
        const { data, error } = await supabase.rpc('cancel_tournament', {
          p_tournament_id: tournament.id,
        })
        if (error) throw new Error(error.message)
        return {
          ...base,
          action: 'cancelled',
          detail: {
            playerCount,
            reason: 'min_players_not_reached',
            previousActions,
            ...data,
          },
        }
      }

      // Suficientes jugadores → activar
      const { error } = await supabase
        .from('tournaments')
        .update({ status: 'live' })
        .eq('id', tournament.id)
        .eq('status', 'open')

      if (error) throw new Error(error.message)
      currentStatus = 'live'
      previousActions.push('started')

      if (nowMs < new Date(tournament.play_window_end).getTime()) {
        return { ...base, action: 'started', detail: { playerCount, previousActions } }
      }
    }

    // ── live → finalizing ────────────────────────────────────
    if (currentStatus === 'live' && nowMs >= new Date(tournament.play_window_end).getTime()) {
      const { error } = await supabase
        .from('tournaments')
        .update({ status: 'finalizing' })
        .eq('id', tournament.id)
        .eq('status', 'live')

      if (error) throw new Error(error.message)
      currentStatus = 'finalizing'
      previousActions.push('set_finalizing')

      return { ...base, action: 'set_finalizing', detail: { previousActions } }
    }

    // ── finalizing → completed ───────────────────────────────
    // La transición de live→finalizing ocurre en una pasada y
    // completed en la siguiente para que sean dos operaciones cortas.
    if (currentStatus === 'finalizing') {
      const { data, error } = await supabase.rpc('finalize_tournament', {
        p_tournament_id: tournament.id,
      })
      if (error) throw new Error(error.message)
      return { ...base, action: 'finalized', detail: data as Record<string, unknown> }
    }

    return { ...base, action: 'skipped' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[lifecycle] Error en torneo ${tournament.id}:`, message)
    return { ...base, action: 'skipped', error: message }
  }
}

// Fuerza la finalización de un torneo específico (uso admin / manual).
// Solo funciona si el torneo está en live o finalizing.
export async function forceFinalizeTournament(tournamentId: string): Promise<TransitionResult> {
  const supabase = createAdminClient()

  const { data: tData } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single()

  if (!tData) {
    throw new Error('Torneo no encontrado')
  }

  const tournament = tData as Tournament

  if (!['live', 'finalizing'].includes(tournament.status)) {
    throw new Error(`No se puede finalizar torneo en estado: ${tournament.status}`)
  }

  if (tournament.status === 'live' && Date.now() < new Date(tournament.play_window_end).getTime()) {
    const [{ count: registeredCount }, { count: completedGamesCount }] = await Promise.all([
      supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId),
      supabase
        .from('games')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('status', 'completed'),
    ])

    if ((completedGamesCount ?? 0) < (registeredCount ?? 0)) {
      throw new Error('No se puede finalizar antes del cierre mientras haya inscritos sin partida completada.')
    }
  }

  // Pasar a finalizing si está en live
  if (tournament.status === 'live') {
    await supabase
      .from('tournaments')
      .update({ status: 'finalizing' })
      .eq('id', tournamentId)
  }

  const { data, error } = await supabase.rpc('finalize_tournament', {
    p_tournament_id: tournamentId,
  })

  if (error) throw new Error(error.message)

  return {
    tournamentId,
    name: tournament.name,
    action: 'finalized',
    detail: data as Record<string, unknown>,
  }
}
