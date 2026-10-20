import { createAdminClient } from '@/lib/supabase/server'
import type { SkillTier } from '@/types/database'
import { PLATFORM_BUSINESS_RULES } from '@/lib/business/rules'
import { buildCommunityFreeTournamentFields, isCommunityFreePresetKey } from './community-free'
import { DEFAULT_PLATFORM_FEE_BPS, DEFAULT_PRIZE_1ST_BPS, DEFAULT_PRIZE_2ND_BPS,
  DEFAULT_PRIZE_3RD_BPS, DEFAULT_PRIZE_MODEL, FIXED_PRIZE_BUDGET_BPS,
  buildFixedPrize, getTournamentPreset, pesosToCents } from './finance'

export interface GovernedTournamentInput {
  name: string; description?: string; presetKey: string; skillTier: SkillTier | null
  registrationOpensAt: string; playWindowStart: string; playWindowEnd: string
}

// Both administrative entry points use the same server-owned preset and fields.
export async function createGovernedTournament(input: GovernedTournamentInput, adminId: string) {
  // Shared by the API and the Server Action; changing a form field cannot create money obligations.
  if (!isCommunityFreePresetKey(input.presetKey)) throw new Error('Esta versión sólo permite retos comunitarios gratuitos y sin premios.')
  const preset = getTournamentPreset(input.presetKey)
  if (!preset) throw new Error('El formato seleccionado no está autorizado.')
  const name = input.name.trim(), description = input.description?.trim() || null
  const registration = Date.parse(input.registrationOpensAt), start = Date.parse(input.playWindowStart), end = Date.parse(input.playWindowEnd)
  if (!name || name.length > 120 || (description?.length ?? 0) > 2000
    || ![registration, start, end].every(Number.isFinite) || registration >= start || start >= end
    || preset.durationMinutes * 60 > (end - start) / 1000) throw new Error('Revisa el nombre y las fechas del torneo.')

  const db = createAdminClient()
  if (isCommunityFreePresetKey(preset.key)) {
    const fields = buildCommunityFreeTournamentFields({ registrationOpensAt: input.registrationOpensAt, playWindowStart: input.playWindowStart })
    if (input.skillTier !== null || end !== Date.parse(fields.play_window_end) || start <= Date.now()) {
      throw new Error('El reto comunitario requiere inicio futuro, una categoría abierta y una ventana exacta de 24 horas.')
    }
    const { data, error } = await db.from('tournaments').insert({ ...fields, name, description, status: 'scheduled', created_by: adminId }).select('id').single()
    if (error || !data) throw new Error('No se pudo crear el reto comunitario. Comprueba la disponibilidad del formato.')
    return { tournamentId: data.id }
  }

  const entryFee = pesosToCents(preset.entryFeePesos)
  const prizes = { fundCents: pesosToCents(preset.prize1Pesos + preset.prize2Pesos + preset.prize3Pesos),
    prize1Cents: pesosToCents(preset.prize1Pesos), prize2Cents: pesosToCents(preset.prize2Pesos), prize3Cents: pesosToCents(preset.prize3Pesos) }
  if (entryFee > 0) {
    const calculated = buildFixedPrize({ entryFeeCents: entryFee, minPlayers: preset.minPlayers, maxPlayers: preset.maxPlayers })
    if (Object.keys(prizes).some(key => calculated[key as keyof typeof calculated] !== prizes[key as keyof typeof prizes])) {
      throw new Error('El formato comercial no coincide con la política económica vigente.')
    }
  }
  if (preset.key === 'freeroll_v1') {
    const { count, error } = await db.from('tournaments').select('*', { count: 'exact', head: true })
      .eq('preset_key', 'freeroll_v1').in('status', ['scheduled', 'open', 'live']).gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    if (error) throw new Error('No se pudo comprobar el límite de freerolls.')
    if ((count ?? 0) >= 1) throw new Error('Ya existe un freeroll activo creado durante los últimos 7 días.')
  }
  const { data, error } = await db.from('tournaments').insert({ name, description, game_type: '2048_score',
    tournament_type: preset.tournamentType, prize_model: DEFAULT_PRIZE_MODEL, entry_fee_cents: entryFee,
    prize_1st_cents: prizes.prize1Cents, prize_2nd_cents: prizes.prize2Cents, prize_3rd_cents: prizes.prize3Cents,
    prize_fund_bps: FIXED_PRIZE_BUDGET_BPS, platform_fee_bps: DEFAULT_PLATFORM_FEE_BPS,
    prize_1st_bps: DEFAULT_PRIZE_1ST_BPS, prize_2nd_bps: DEFAULT_PRIZE_2ND_BPS, prize_3rd_bps: DEFAULT_PRIZE_3RD_BPS,
    min_players: preset.minPlayers, max_players: preset.maxPlayers, registration_opens_at: new Date(registration).toISOString(),
    play_window_start: new Date(start).toISOString(), play_window_end: new Date(end).toISOString(), max_game_duration_seconds: preset.durationMinutes * 60,
    status: 'scheduled', is_test: preset.isTest, business_rule_version: PLATFORM_BUSINESS_RULES.policyVersion,
    preset_key: preset.key, skill_tier: input.skillTier, created_by: adminId }).select('id').single()
  if (error || !data) throw new Error('No se pudo crear el torneo.')
  return { tournamentId: data.id }
}
