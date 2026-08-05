import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/auth'
import { formatDateTimeLocalInput, parseDateTimeLocalToIso } from '@/lib/utils'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { SkillTier } from '@/types/database'
import {
  DEFAULT_PLATFORM_FEE_BPS,
  DEFAULT_PRIZE_1ST_BPS,
  DEFAULT_PRIZE_2ND_BPS,
  DEFAULT_PRIZE_3RD_BPS,
  DEFAULT_PRIZE_MODEL,
  FIXED_PRIZE_BUDGET_BPS,
  buildFixedPrize,
  getTournamentPreset,
  pesosToCents,
} from '@/lib/tournament/finance'
import { PLATFORM_BUSINESS_RULES } from '@/lib/business/rules'
import { TournamentPresetForm } from '@/components/admin/tournament-preset-form'

async function createTournament(formData: FormData) {
  'use server'

  const userId = await requireAdmin()
  const presetKey = String(formData.get('preset_key') ?? '')
  const preset = getTournamentPreset(presetKey)

  if (!preset) {
    throw new Error('El formato seleccionado no está autorizado.')
  }

  const name = String(formData.get('name') ?? '').trim()
  const rawDescription = String(formData.get('description') ?? '').trim()
  const description = rawDescription || null
  const rawSkillTier = formData.get('skill_tier')
  const skillTier: SkillTier | null =
    rawSkillTier === 'novato' || rawSkillTier === 'intermedio' || rawSkillTier === 'pro'
      ? rawSkillTier
      : null
  const registrationOpens = parseDateTimeLocalToIso(
    String(formData.get('registration_opens_at') ?? '')
  )
  const playStart = parseDateTimeLocalToIso(String(formData.get('play_window_start') ?? ''))
  const playEnd = parseDateTimeLocalToIso(String(formData.get('play_window_end') ?? ''))
  const registrationOpensMs = Date.parse(registrationOpens)
  const playStartMs = Date.parse(playStart)
  const playEndMs = Date.parse(playEnd)
  const maxDuration = preset.durationMinutes * 60
  const playWindowSeconds = (playEndMs - playStartMs) / 1000

  if (
    !name ||
    name.length > 120 ||
    !Number.isFinite(registrationOpensMs) ||
    !Number.isFinite(playStartMs) ||
    !Number.isFinite(playEndMs) ||
    registrationOpensMs >= playStartMs ||
    playStartMs >= playEndMs ||
    maxDuration > playWindowSeconds
  ) {
    throw new Error('Revisa el nombre y las fechas del torneo.')
  }

  const entryFee = pesosToCents(preset.entryFeePesos)
  const configuredPrize = {
    fundCents: pesosToCents(preset.prize1Pesos + preset.prize2Pesos + preset.prize3Pesos),
    prize1Cents: pesosToCents(preset.prize1Pesos),
    prize2Cents: pesosToCents(preset.prize2Pesos),
    prize3Cents: pesosToCents(preset.prize3Pesos),
  }

  // En el formato comercial, el premio debe coincidir exactamente con la
  // regla económica. El navegador nunca decide precios, cupos ni premios.
  if (entryFee > 0) {
    const calculatedPrize = buildFixedPrize({
      entryFeeCents: entryFee,
      minPlayers: preset.minPlayers,
      maxPlayers: preset.maxPlayers,
    })
    if (
      calculatedPrize.fundCents !== configuredPrize.fundCents ||
      calculatedPrize.prize1Cents !== configuredPrize.prize1Cents ||
      calculatedPrize.prize2Cents !== configuredPrize.prize2Cents ||
      calculatedPrize.prize3Cents !== configuredPrize.prize3Cents
    ) {
      throw new Error('El formato comercial no coincide con la política económica vigente.')
    }
  }

  // Los freerolls comerciales son una inversión promocional controlada.
  if (preset.key === 'freeroll_v1') {
    const supabaseCheck = createAdminClient()
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await supabaseCheck
      .from('tournaments')
      .select('*', { count: 'exact', head: true })
      .eq('preset_key', 'freeroll_v1')
      .in('status', ['scheduled', 'open', 'live'])
      .gte('created_at', oneWeekAgo)

    if (countError) throw new Error(`No se pudo comprobar el límite de freerolls: ${countError.message}`)
    if ((count ?? 0) >= 1) {
      throw new Error('Ya existe un freeroll activo creado durante los últimos 7 días.')
    }
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name,
      description,
      game_type: '2048_score',
      tournament_type: preset.tournamentType,
      prize_model: DEFAULT_PRIZE_MODEL,
      entry_fee_cents: entryFee,
      prize_1st_cents: configuredPrize.prize1Cents,
      prize_2nd_cents: configuredPrize.prize2Cents,
      prize_3rd_cents: configuredPrize.prize3Cents,
      prize_fund_bps: FIXED_PRIZE_BUDGET_BPS,
      platform_fee_bps: DEFAULT_PLATFORM_FEE_BPS,
      prize_1st_bps: DEFAULT_PRIZE_1ST_BPS,
      prize_2nd_bps: DEFAULT_PRIZE_2ND_BPS,
      prize_3rd_bps: DEFAULT_PRIZE_3RD_BPS,
      min_players: preset.minPlayers,
      max_players: preset.maxPlayers,
      registration_opens_at: registrationOpens,
      play_window_start: playStart,
      play_window_end: playEnd,
      max_game_duration_seconds: maxDuration,
      status: 'scheduled',
      is_test: preset.isTest,
      business_rule_version: PLATFORM_BUSINESS_RULES.policyVersion,
      preset_key: preset.key,
      skill_tier: skillTier,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Error creando torneo: ${error.message}`)

  redirect(`/tournaments/${data.id}`)
}

export default function NewTournamentPage() {
  const registrationOpens = new Date()
  registrationOpens.setMinutes(registrationOpens.getMinutes() + 5, 0, 0)
  const start = new Date(registrationOpens)
  start.setHours(start.getHours() + 1)
  const end = new Date(start)
  end.setHours(end.getHours() + 24)

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/tournaments" className="text-sm text-muted-foreground hover:text-foreground">
          ← Torneos
        </Link>
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
