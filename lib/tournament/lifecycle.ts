import { createAdminClient } from '@/lib/supabase/server'
import type { Tournament, TournamentResult } from '@/types/database'
import { issueFlowRefunds } from '@/lib/tournament/refunds'
import { getAppUrl } from '@/lib/env'
import { sendTournamentPrizeEmail } from '@/lib/email/tournament-notifications'
import { sendOpsAlertEmail } from '@/lib/email/ops-notifications'
import { updateRating } from '@/lib/tournament/rating'
import { reviewWinnerStats, computeIntervalStats } from '@/lib/anticheat/winner-review'

export interface TransitionResult {
  tournamentId: string
  name: string
  action: 'opened' | 'started' | 'cancelled' | 'set_finalizing' | 'finalized' | 'skipped'
  detail?: Record<string, unknown>
  error?: string
}

// Procesa los torneos que necesitan una transición de estado.
// Llamado por el scheduler cada cinco minutos y por un respaldo independiente.
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
    .limit(25)

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
      const claimed = await claimTournamentStatus(
        supabase,
        tournament.id,
        'scheduled',
        'open'
      )
      if (!claimed) return concurrentTransition(base, 'scheduled')

      currentStatus = 'open'
      previousActions.push('opened')

      if (nowMs < new Date(tournament.play_window_start).getTime()) {
        return { ...base, action: 'opened' }
      }
    }

    // ── open → live o cancelled ──────────────────────────────
    if (currentStatus === 'open' && nowMs >= new Date(tournament.play_window_start).getTime()) {
      const { count, error: countError } = await supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id)

      if (countError) throw new Error(countError.message)

      const playerCount = count ?? 0

      if (playerCount < tournament.min_players) {
        // No alcanzó mínimo → cancelar y emitir reversas Flow
        const { data, error } = await supabase.rpc('cancel_tournament', {
          p_tournament_id: tournament.id,
        })
        if (error) {
          const latestStatus = await readTournamentStatus(supabase, tournament.id)
          if (latestStatus === 'cancelled') return concurrentTransition(base, 'open')
          throw new Error(error.message)
        }

        const cancelData = data as { refunds_to_issue: number; entry_fee_cents: number }
        let refundResults: { error?: string }[] = []
        if (cancelData.entry_fee_cents > 0 && cancelData.refunds_to_issue > 0) {
          refundResults = await issueFlowRefunds(
            tournament.id,
            cancelData.entry_fee_cents,
            getAppUrl() ?? 'https://torneosplay.cl',
            tournament.name
          )
        }

        const refundErrors = refundResults.filter((r) => r.error).length
        return {
          ...base,
          action: 'cancelled',
          detail: {
            playerCount,
            reason: 'min_players_not_reached',
            previousActions,
            refunds_to_issue: cancelData.refunds_to_issue,
            refunds_initiated: refundResults.length - refundErrors,
            refunds_failed: refundErrors,
          },
        }
      }

      // Suficientes jugadores → activar
      const claimed = await claimTournamentStatus(
        supabase,
        tournament.id,
        'open',
        'live'
      )
      if (!claimed) return concurrentTransition(base, 'open')

      currentStatus = 'live'
      previousActions.push('started')

      if (nowMs < new Date(tournament.play_window_end).getTime()) {
        return { ...base, action: 'started', detail: { playerCount, previousActions } }
      }
    }

    // ── live → finalizing ────────────────────────────────────
    if (currentStatus === 'live' && nowMs >= new Date(tournament.play_window_end).getTime()) {
      const claimed = await claimTournamentStatus(
        supabase,
        tournament.id,
        'live',
        'finalizing'
      )
      if (!claimed) return concurrentTransition(base, 'live')

      currentStatus = 'finalizing'
      previousActions.push('set_finalizing')
    }

    // ── finalizing → completed ───────────────────────────────
    // Se finaliza en la misma pasada. Ambas operaciones de base de datos son
    // cortas y separadas; no se mantiene un lock durante llamadas externas.
    if (currentStatus === 'finalizing') {
      const finalization = await finalizeTournament(supabase, tournament.id)
      if (finalization.completedByAnotherExecution) {
        return concurrentTransition(base, 'finalizing')
      }

      // En runtimes serverless el trabajo no esperado puede cortarse al enviar
      // la respuesta. Esperar garantiza que ratings y controles post-premio
      // terminen antes de dar por exitosa esta corrida.
      await Promise.all([
        notifyPrizeWinners(supabase, tournament.id, tournament.name),
        updatePlayerRatings(supabase, tournament.id),
        reviewPrizeWinners(supabase, tournament.id, tournament.name),
      ])

      return {
        ...base,
        action: 'finalized',
        detail: {
          ...finalization.data,
          previousActions,
        },
      }
    }

    return { ...base, action: 'skipped' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[lifecycle] Error en torneo ${tournament.id}:`, message)
    return { ...base, action: 'skipped', error: message }
  }
}

type AdminClient = ReturnType<typeof createAdminClient>

async function claimTournamentStatus(
  supabase: AdminClient,
  tournamentId: string,
  fromStatus: Tournament['status'],
  toStatus: Tournament['status']
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tournaments')
    .update({ status: toStatus })
    .eq('id', tournamentId)
    .eq('status', fromStatus)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return Boolean(data)
}

async function readTournamentStatus(
  supabase: AdminClient,
  tournamentId: string
): Promise<Tournament['status'] | null> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('status')
    .eq('id', tournamentId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data?.status as Tournament['status'] | undefined) ?? null
}

async function finalizeTournament(
  supabase: AdminClient,
  tournamentId: string
): Promise<{
  data: Record<string, unknown>
  completedByAnotherExecution: boolean
}> {
  const { data, error } = await supabase.rpc('finalize_tournament', {
    p_tournament_id: tournamentId,
  })

  if (!error) {
    return {
      data: (data ?? {}) as Record<string, unknown>,
      completedByAnotherExecution: false,
    }
  }

  // El scheduler principal y el respaldo pueden coincidir. La funcion SQL
  // serializa por torneo; si otra corrida termino primero, no es un fallo.
  const latestStatus = await readTournamentStatus(supabase, tournamentId)
  if (latestStatus === 'completed') {
    return { data: {}, completedByAnotherExecution: true }
  }

  throw new Error(error.message)
}

function concurrentTransition(
  base: Pick<TransitionResult, 'tournamentId' | 'name'>,
  fromStatus: Tournament['status']
): TransitionResult {
  return {
    ...base,
    action: 'skipped',
    detail: {
      reason: 'transition_claimed_by_another_execution',
      fromStatus,
    },
  }
}

// Fuerza la finalización de un torneo específico (uso admin / manual).
// Solo funciona si el torneo está en live o finalizing.
export async function forceFinalizeTournament(tournamentId: string): Promise<TransitionResult> {
  const supabase = createAdminClient()

  const { data: tData, error: tournamentError } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single()

  if (tournamentError) {
    throw new Error(`No se pudo obtener el torneo: ${tournamentError.message}`)
  }

  if (!tData) {
    throw new Error('Torneo no encontrado')
  }

  const tournament = tData as Tournament

  if (!['live', 'finalizing'].includes(tournament.status)) {
    throw new Error(`No se puede finalizar torneo en estado: ${tournament.status}`)
  }

  if (tournament.status === 'live' && Date.now() < new Date(tournament.play_window_end).getTime()) {
    const [registrationsResult, gamesResult] = await Promise.all([
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

    if (registrationsResult.error) throw new Error(registrationsResult.error.message)
    if (gamesResult.error) throw new Error(gamesResult.error.message)

    const registeredCount = registrationsResult.count
    const completedGamesCount = gamesResult.count

    if ((completedGamesCount ?? 0) < (registeredCount ?? 0)) {
      throw new Error('No se puede finalizar antes del cierre mientras haya inscritos sin partida completada.')
    }
  }

  // Pasar a finalizing si está en live
  if (tournament.status === 'live') {
    const claimed = await claimTournamentStatus(
      supabase,
      tournamentId,
      'live',
      'finalizing'
    )
    if (!claimed) {
      const latestStatus = await readTournamentStatus(supabase, tournamentId)
      if (latestStatus !== 'finalizing' && latestStatus !== 'completed') {
        throw new Error(`No se pudo iniciar la finalización (estado actual: ${latestStatus ?? 'desconocido'}).`)
      }
    }
  }

  const finalization = await finalizeTournament(supabase, tournamentId)
  if (finalization.completedByAnotherExecution) {
    return concurrentTransition(
      { tournamentId, name: tournament.name },
      'finalizing'
    )
  }

  await Promise.all([
    notifyPrizeWinners(supabase, tournament.id, tournament.name),
    updatePlayerRatings(supabase, tournament.id),
    reviewPrizeWinners(supabase, tournament.id, tournament.name),
  ])

  return {
    tournamentId,
    name: tournament.name,
    action: 'finalized',
    detail: finalization.data,
  }
}

async function notifyPrizeWinners(
  supabase: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  tournamentName: string,
): Promise<void> {
  try {
    const { data: results } = await supabase
      .from('tournament_results')
      .select('user_id, rank, prize_awarded_cents, final_score')
      .eq('tournament_id', tournamentId)
      .gt('prize_awarded_cents', 0)
      .order('rank', { ascending: true })

    for (const result of (results ?? []) as TournamentResult[]) {
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(result.user_id)
        const email = authUser?.user?.email
        const username = authUser?.user?.user_metadata?.username ?? email
        if (email) {
          await sendTournamentPrizeEmail({
            to: email,
            username,
            tournamentName,
            rank: result.rank,
            prizeCents: result.prize_awarded_cents,
            finalScore: result.final_score,
          })
        }
      } catch (e) {
        console.error(`[lifecycle] Error enviando email de premio a user ${result.user_id}:`, e)
      }
    }
  } catch (e) {
    console.error(`[lifecycle] Error notificando ganadores del torneo ${tournamentId}:`, e)
  }
}

// Umbral de premio que gatilla revisión informativa aunque no haya señales
// anómalas ($50.000): los premios grandes merecen una revisión adicional.
const BIG_PRIZE_REVIEW_CENTS = 5000000

// Revisa a los ganadores premiados en busca de señales de automatización y
// alerta al operador por email (no bloquea el pago del premio). Es la capa
// "gris" del anti-cheat: el detector en vivo banea lo flagrante; esto expone
// consistencias sobrehumanas para revisión manual en el admin.
async function reviewPrizeWinners(
  supabase: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  tournamentName: string,
): Promise<void> {
  try {
    const { data: results } = await supabase
      .from('tournament_results')
      .select('user_id, rank, prize_awarded_cents, final_score')
      .eq('tournament_id', tournamentId)
      .gt('prize_awarded_cents', 0)
      .order('rank', { ascending: true })

    const winners = (results ?? []) as TournamentResult[]
    if (winners.length === 0) return

    const appUrl = getAppUrl() ?? 'https://www.torneosplay.cl'
    const alertLines: string[] = []

    for (const winner of winners) {
      const { data: game } = await supabase
        .from('games')
        .select('id, move_count, final_score')
        .eq('tournament_id', tournamentId)
        .eq('user_id', winner.user_id)
        .single()
      if (!game) continue

      const { data: moves } = await supabase
        .from('game_moves')
        .select('server_timestamp')
        .eq('game_id', game.id)
        .order('move_number', { ascending: true })

      const timestamps = (moves ?? []).map((m) => Date.parse(m.server_timestamp as string))
      const intervals = computeIntervalStats(timestamps)
      const flags = reviewWinnerStats({
        moveCount: Number(game.move_count),
        finalScore: Number(game.final_score),
        ...intervals,
      })

      const bigPrize = winner.prize_awarded_cents >= BIG_PRIZE_REVIEW_CENTS
      if (flags.length === 0 && !bigPrize) continue

      alertLines.push(
        `Rank ${winner.rank} · premio $${Math.round(winner.prize_awarded_cents / 100).toLocaleString('es-CL')} · score ${Number(game.final_score).toLocaleString('es-CL')} en ${game.move_count} movs.`
      )
      for (const flag of flags) alertLines.push(`  → ${flag.code}: ${flag.detail}`)
      alertLines.push(`  Partida: ${appUrl}/admin/tournaments/${tournamentId}/games/${game.id}`)
    }

    if (alertLines.length > 0) {
      await sendOpsAlertEmail({
        subject: `Revisar ganadores de "${tournamentName}"`,
        lines: [
          `El torneo "${tournamentName}" finalizó con ganadores que ameritan revisión:`,
          ...alertLines,
          'Los premios ya fueron acreditados; el control efectivo es la aprobación manual del pago (cobro de premios).',
        ],
      })
    }
  } catch (e) {
    console.error(`[lifecycle] Error revisando ganadores del torneo ${tournamentId}:`, e)
  }
}

// Actualiza el rating por habilidad de cada participante tras finalizar, usando su
// score final (EMA). No bloquea el pago; si falla, se recupera en el próximo torneo.
async function updatePlayerRatings(
  supabase: ReturnType<typeof createAdminClient>,
  tournamentId: string,
): Promise<void> {
  try {
    const { data: results } = await supabase
      .from('tournament_results')
      .select('user_id, final_score')
      .eq('tournament_id', tournamentId)

    const rows = (results ?? []) as Pick<TournamentResult, 'user_id' | 'final_score'>[]
    if (rows.length === 0) return

    const userIds = rows.map((r) => r.user_id)
    const { data: existing } = await supabase
      .from('player_ratings')
      .select('profile_id, rating, games_rated')
      .in('profile_id', userIds)

    const byUser = new Map(
      (existing ?? []).map((r) => [r.profile_id, r as { profile_id: string; rating: number; games_rated: number }])
    )

    const nowIso = new Date().toISOString()
    const upserts = rows.map((r) => {
      const prev = byUser.get(r.user_id)
      const next = updateRating(prev?.rating ?? 0, prev?.games_rated ?? 0, Number(r.final_score))
      return {
        profile_id: r.user_id,
        rating: next.rating,
        games_rated: next.gamesRated,
        tier: next.tier,
        updated_at: nowIso,
      }
    })

    const { error } = await supabase
      .from('player_ratings')
      .upsert(upserts, { onConflict: 'profile_id' })
    if (error) {
      console.error(`[lifecycle] Error actualizando ratings del torneo ${tournamentId}:`, error.message)
    }
  } catch (e) {
    console.error(`[lifecycle] Error en updatePlayerRatings ${tournamentId}:`, e)
  }
}
