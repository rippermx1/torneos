import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/auth'
import { formatDateTimeLocalInput, parseDateTimeLocalToIso } from '@/lib/utils'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { TournamentType } from '@/types/database'
import {
  DEFAULT_FREEROLL_PRIZE_CENTS,
  DEFAULT_PLATFORM_FEE_BPS,
  DEFAULT_PRIZE_1ST_BPS,
  DEFAULT_PRIZE_2ND_BPS,
  DEFAULT_PRIZE_3RD_BPS,
  DEFAULT_PRIZE_FUND_BPS,
  MAX_FREEROLL_PRIZE_CENTS,
  buildPrizeLadder,
} from '@/lib/tournament/finance'
import { TournamentPresetForm } from '@/components/admin/tournament-preset-form'

async function createTournament(formData: FormData) {
  'use server'

  const userId = await requireAdmin()

  const name             = String(formData.get('name') ?? '').trim()
  const description      = (formData.get('description') as string) || null
  const rawTournamentType = formData.get('tournament_type')
  const tournamentType: TournamentType =
    rawTournamentType === 'express' ||
    rawTournamentType === 'elite' ||
    rawTournamentType === 'freeroll' ||
    rawTournamentType === 'challenger' ||
    rawTournamentType === 'pro'
      ? rawTournamentType
      : 'standard'
  const isTest           = formData.get('is_test') === '1'
  const entryFeePesos    = Number.parseFloat(String(formData.get('entry_fee') ?? ''))
  const entryFee         = Math.round(entryFeePesos * 100)
  const freerollPrizeInput = Number.parseFloat(String(formData.get('freeroll_prize') ?? ''))
  const freerollPrizeCents = Number.isFinite(freerollPrizeInput) && freerollPrizeInput > 0
    ? Math.round(freerollPrizeInput * 100)
    : DEFAULT_FREEROLL_PRIZE_CENTS
  const minPlayers       = Number.parseInt(String(formData.get('min_players') ?? ''), 10)
  const targetPlayers    = Number.parseInt(String(formData.get('target_players') ?? minPlayers), 10)
  const maxPlayers       = Number.parseInt(String(formData.get('max_players') ?? ''), 10)
  const registrationOpens = parseDateTimeLocalToIso(formData.get('registration_opens_at') as string)
  const playStart        = parseDateTimeLocalToIso(formData.get('play_window_start') as string)
  const playEnd          = parseDateTimeLocalToIso(formData.get('play_window_end') as string)
  const maxDurationMinutes = Number.parseInt(String(formData.get('max_game_duration_minutes') ?? ''), 10)
  const maxDuration      = maxDurationMinutes * 60

  const registrationOpensMs = Date.parse(registrationOpens)
  const playStartMs = Date.parse(playStart)
  const playEndMs = Date.parse(playEnd)
  const playWindowSeconds = (playEndMs - playStartMs) / 1000

  if (
    !name ||
    !Number.isFinite(entryFee) ||
    !Number.isInteger(minPlayers) ||
    !Number.isInteger(targetPlayers) ||
    !Number.isInteger(maxPlayers) ||
    !Number.isInteger(maxDurationMinutes) ||
    entryFee < 0 ||
    minPlayers < (isTest ? 1 : 2) ||
    targetPlayers < minPlayers ||
    maxPlayers < minPlayers ||
    targetPlayers > maxPlayers ||
    maxDuration <= 0 ||
    maxDuration > playWindowSeconds ||
    registrationOpensMs >= playStartMs ||
    playStartMs >= playEndMs
  ) {
    throw new Error('Datos del torneo inválidos')
  }

  if (!isTest && entryFee > 0 && minPlayers < 2) {
    throw new Error('Los torneos pagados requieren al menos 2 jugadores.')
  }

  if (isTest && entryFee > 0) {
    throw new Error('Los torneos de prueba deben ser gratuitos.')
  }

  if (entryFee === 0 && (freerollPrizeCents <= 0 || freerollPrizeCents > MAX_FREEROLL_PRIZE_CENTS)) {
    throw new Error('El premio del freeroll debe ser mayor a 0 y hasta $500.000.')
  }

  // Escalera de premios publicada. Torneos pagados: bolsa garantizada escalonada
  // que sube por tramos con la convocatoria (buildPrizeLadder). Freerolls: un
  // único tramo con el premio fijo de marketing. El tramo base define las
  // columnas prize_*_cents del torneo (compatibilidad y fallback de finalize).
  const prizeLadder =
    entryFee > 0
      ? buildPrizeLadder({ entryFeeCents: entryFee, minPlayers, maxPlayers })
      : [{ thresholdPlayers: minPlayers, fundCents: freerollPrizeCents, prize1Cents: freerollPrizeCents, prize2Cents: 0, prize3Cents: 0 }]
  const baseTier = prizeLadder[0]!
  const prize1 = baseTier.prize1Cents
  const prize2 = baseTier.prize2Cents
  const prize3 = baseTier.prize3Cents

  // C6 guard: para torneos pagados, los premios fijos no pueden superar la
  // recaudacion bruta al minimo de jugadores. Este chequeo replica el CHECK
  // de DB pero da un error amigable antes de impactar la transaccion.
  const totalPrizeCents = prize1 + prize2 + prize3
  if (entryFee > 0 && totalPrizeCents > entryFee * minPlayers) {
    throw new Error(
      `Los premios publicados (${totalPrizeCents} centavos) exceden la recaudacion minima (${entryFee * minPlayers} centavos al minimo de ${minPlayers} jugadores). Reduce los premios o aumenta el minimo.`
    )
  }

  // Freerolls: máximo 1 por semana activo (scheduled/open/live). Los de prueba están exentos.
  if (tournamentType === 'freeroll' && !isTest) {
    const supabaseCheck = createAdminClient()
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabaseCheck
      .from('tournaments')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_type', 'freeroll')
      .in('status', ['scheduled', 'open', 'live'])
      .gte('created_at', oneWeekAgo)
    if ((count ?? 0) >= 1) {
      throw new Error('Ya existe un freeroll activo en los últimos 7 días. Solo se permite uno por semana.')
    }
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name,
      description,
      game_type: '2048_score',
      tournament_type: tournamentType,
      prize_model: 'entry_pool',
      entry_fee_cents: entryFee,
      prize_1st_cents: prize1,
      prize_2nd_cents: prize2,
      prize_3rd_cents: prize3,
      prize_fund_bps: DEFAULT_PRIZE_FUND_BPS,
      platform_fee_bps: DEFAULT_PLATFORM_FEE_BPS,
      prize_1st_bps: DEFAULT_PRIZE_1ST_BPS,
      prize_2nd_bps: DEFAULT_PRIZE_2ND_BPS,
      prize_3rd_bps: DEFAULT_PRIZE_3RD_BPS,
      min_players: minPlayers,
      max_players: maxPlayers,
      registration_opens_at: registrationOpens,
      play_window_start: playStart,
      play_window_end: playEnd,
      max_game_duration_seconds: maxDuration,
      status: 'scheduled',
      is_test: isTest,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Error creando torneo: ${error.message}`)

  // Publicar la escalera de premios. Si falla, revertir el torneo para no dejar
  // torneos huérfanos sin escalera (finalize caería al fallback, pero la ficha
  // no mostraría los tramos publicados).
  const { error: tiersError } = await supabase.from('tournament_prize_tiers').insert(
    prizeLadder.map((tier) => ({
      tournament_id: data.id,
      min_players_threshold: tier.thresholdPlayers,
      prize_fund_cents: tier.fundCents,
      prize_1st_cents: tier.prize1Cents,
      prize_2nd_cents: tier.prize2Cents,
      prize_3rd_cents: tier.prize3Cents,
    }))
  )
  if (tiersError) {
    await supabase.from('tournaments').delete().eq('id', data.id)
    throw new Error(`Error publicando la escalera de premios: ${tiersError.message}`)
  }

  redirect(`/tournaments/${data.id}`)
}

export default function NewTournamentPage() {
  const registrationOpens = new Date()
  registrationOpens.setMinutes(registrationOpens.getMinutes() + 5, 0, 0)
  const now = new Date(registrationOpens)
  const start = new Date(now)
  start.setHours(start.getHours() + 1)
  const end = new Date(start)
  end.setHours(end.getHours() + 24)

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/tournaments" className="text-sm text-muted-foreground hover:text-foreground">← Torneos</Link>
        <h1 className="text-2xl font-bold">Crear torneo</h1>
      </div>
      <TournamentPresetForm
        action={createTournament}
        registrationOpensAt={formatDateTimeLocalInput(registrationOpens)}
        playWindowStart={formatDateTimeLocalInput(start)}
        playWindowEnd={formatDateTimeLocalInput(end)}
      />
    </div>
  )
}
