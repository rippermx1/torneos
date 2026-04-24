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
  const now = new Date().toISOString()

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
    const result = await processSingleTournament(t, now)
    results.push(result)
  }

  return results
}

async function processSingleTournament(
  tournament: Tournament,
  now: string
): Promise<TransitionResult> {
  const supabase = createAdminClient()
  const base = { tournamentId: tournament.id, name: tournament.name }

  try {
    // ── scheduled → open ────────────────────────────────────
    if (
      tournament.status === 'scheduled' &&
      now >= tournament.registration_opens_at
    ) {
      const { error } = await supabase
        .from('tournaments')
        .update({ status: 'open' })
        .eq('id', tournament.id)
        .eq('status', 'scheduled') // guard contra race condition

      if (error) throw new Error(error.message)
      return { ...base, action: 'opened' }
    }

    // ── open → live o cancelled ──────────────────────────────
    if (tournament.status === 'open' && now >= tournament.play_window_start) {
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
        return { ...base, action: 'cancelled', detail: { playerCount, reason: 'min_players_not_reached', ...data } }
      }

      // Suficientes jugadores → activar
      const { error } = await supabase
        .from('tournaments')
        .update({ status: 'live' })
        .eq('id', tournament.id)
        .eq('status', 'open')

      if (error) throw new Error(error.message)
      return { ...base, action: 'started', detail: { playerCount } }
    }

    // ── live → finalizing ────────────────────────────────────
    if (tournament.status === 'live' && now >= tournament.play_window_end) {
      const { error } = await supabase
        .from('tournaments')
        .update({ status: 'finalizing' })
        .eq('id', tournament.id)
        .eq('status', 'live')

      if (error) throw new Error(error.message)
      return { ...base, action: 'set_finalizing' }
    }

    // ── finalizing → completed ───────────────────────────────
    // La transición de live→finalizing ocurre en una pasada y
    // completed en la siguiente para que sean dos operaciones cortas.
    if (tournament.status === 'finalizing') {
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
