import type { TournamentType } from '@/types/database'
import { PILOT_BUSINESS_RULES } from '@/lib/business/rules'

const BPS = 10000

export const IVA_BPS = PILOT_BUSINESS_RULES.vatBps
export const DEFAULT_PRIZE_MODEL = 'fixed' as const
export const FIXED_PRIZE_BUDGET_BPS = PILOT_BUSINESS_RULES.prizeBudgetBps
export const DEFAULT_PLATFORM_FEE_BPS = BPS - FIXED_PRIZE_BUDGET_BPS
export const DEFAULT_PRIZE_1ST_BPS = 7500
export const DEFAULT_PRIZE_2ND_BPS = BPS - DEFAULT_PRIZE_1ST_BPS
export const DEFAULT_PRIZE_3RD_BPS = 0
export const MIN_PAID_ENTRY_FEE_CENTS = PILOT_BUSINESS_RULES.minPaidEntryFeeCents
export const MAX_PAID_CAPACITY_RATIO_BPS = PILOT_BUSINESS_RULES.maxCapacityRatioBps
export const MIN_TARGET_MARGIN_BPS = PILOT_BUSINESS_RULES.minContributionMarginBps

export const DEFAULT_FREEROLL_PRIZE_CENTS = 500000
export const MAX_FREEROLL_PRIZE_CENTS = PILOT_BUSINESS_RULES.maxFirstPrizeCents
export const MAX_PILOT_TOTAL_PRIZE_CENTS = PILOT_BUSINESS_RULES.maxTotalPrizeCents
export const MAX_PILOT_FIRST_PRIZE_CENTS = PILOT_BUSINESS_RULES.maxFirstPrizeCents

export const FLOW_NEXT_DAY_FEE_BPS = PILOT_BUSINESS_RULES.flowFeeNetBps
const IVA_MULTIPLIER_BPS = BPS + IVA_BPS

export interface TournamentPreset {
  key: TournamentType
  label: string
  shortLabel: string
  description: string
  entryFeePesos: number
  prize1Pesos: number
  prize2Pesos: number
  prize3Pesos: number
  minPlayers: number
  maxPlayers: number
  durationMinutes: number
  windowHours: number
  strategy: 'acquisition' | 'balanced'
}

export interface FixedPrize {
  fundCents: number
  prize1Cents: number
  prize2Cents: number
  prize3Cents: number
}

export interface FinancialSnapshot {
  playerCount: number
  grossRevenueCents: number
  netSalesCents: number
  vatDebitCents: number
  flowFeeNetCents: number
  fixedPrizeCents: number
  contributionCents: number
  contributionMarginBps: number
  prizeToSalesBps: number
}

export interface FixedPrizeFinancials {
  totalPrizesCents: number
  min: FinancialSnapshot
  max: FinancialSnapshot
  requiredMinPlayers: number
  isBreakEven: boolean
  isMinHealthy: boolean
}

export interface TournamentPrizeDisplayInput {
  prize_1st_cents: number
  prize_2nd_cents: number
  prize_3rd_cents: number
}

export interface PrizeFundPayouts extends FixedPrize {
  playerCount: number
  prizeFundCents: number
  prizePoolCents: number
}

export const TOURNAMENT_PRESETS = [
  {
    key: 'standard',
    label: 'Piloto fijo',
    shortLabel: 'Piloto',
    description: 'Un solo formato pagado: cupos limitados y premio fijo desde la publicación.',
    entryFeePesos: 2000,
    prize1Pesos: 6600,
    prize2Pesos: 2200,
    prize3Pesos: 0,
    minPlayers: 8,
    maxPlayers: 10,
    durationMinutes: 10,
    windowHours: 24,
    strategy: 'balanced',
  },
  {
    key: 'freeroll',
    label: 'Freeroll controlado',
    shortLabel: 'Freeroll',
    description: 'Torneo gratuito excepcional tratado como gasto de marketing.',
    entryFeePesos: 0,
    prize1Pesos: 5000,
    prize2Pesos: 0,
    prize3Pesos: 0,
    minPlayers: 2,
    maxPlayers: 10,
    durationMinutes: 10,
    windowHours: 24,
    strategy: 'acquisition',
  },
] as const satisfies readonly TournamentPreset[]

export const LATENCY_PRESET = {
  entryFeePesos: 0,
  minPlayers: 1,
  maxPlayers: 1,
  durationMinutes: 5,
  tournamentType: 'freeroll' as TournamentType,
} as const

export function pesosToCents(pesos: number) {
  return Math.round(pesos * 100)
}

export function centsToPesos(cents: number) {
  return Math.round(cents / 100)
}

export function getPresetByType(type: TournamentType) {
  return TOURNAMENT_PRESETS.find((preset) => preset.key === type) ?? TOURNAMENT_PRESETS[0]
}

export function calculateIvaIncludedBreakdown(grossCents: number) {
  if (!Number.isInteger(grossCents) || grossCents < 0) {
    throw new Error(`grossCents inválido: ${grossCents}`)
  }

  const ivaCents = Math.round((grossCents * IVA_BPS) / IVA_MULTIPLIER_BPS)
  return {
    grossCents,
    netCents: grossCents - ivaCents,
    ivaCents,
  }
}

export function maxPlayersForMinimum(minPlayers: number) {
  if (!Number.isInteger(minPlayers) || minPlayers < 1) {
    throw new Error(`minPlayers inválido: ${minPlayers}`)
  }
  return Math.floor((minPlayers * MAX_PAID_CAPACITY_RATIO_BPS) / BPS)
}

export function buildFixedPrize(input: {
  entryFeeCents: number
  minPlayers: number
  maxPlayers: number
  prizeBudgetBps?: number
  prize1Bps?: number
  prize2Bps?: number
  prize3Bps?: number
}): FixedPrize {
  const { entryFeeCents, minPlayers, maxPlayers } = input
  if (!Number.isInteger(entryFeeCents) || entryFeeCents < MIN_PAID_ENTRY_FEE_CENTS) {
    throw new Error('La inscripción pagada mínima del piloto es $2.000.')
  }
  if (!Number.isInteger(minPlayers) || minPlayers < 2) {
    throw new Error('Los torneos pagados requieren al menos 2 jugadores.')
  }
  if (!Number.isInteger(maxPlayers) || maxPlayers < minPlayers) {
    throw new Error('La capacidad máxima no puede ser menor al mínimo.')
  }
  if (maxPlayers > maxPlayersForMinimum(minPlayers)) {
    throw new Error('El cupo máximo no puede superar 1,25 veces el mínimo.')
  }

  const prizeBudgetBps = input.prizeBudgetBps ?? FIXED_PRIZE_BUDGET_BPS
  const prize1Bps = input.prize1Bps ?? DEFAULT_PRIZE_1ST_BPS
  const prize2Bps = input.prize2Bps ?? DEFAULT_PRIZE_2ND_BPS
  const prize3Bps = input.prize3Bps ?? DEFAULT_PRIZE_3RD_BPS
  if (
    !Number.isInteger(prizeBudgetBps) ||
    prizeBudgetBps < 0 ||
    prizeBudgetBps > FIXED_PRIZE_BUDGET_BPS
  ) {
    throw new Error('El premio fijo supera el presupuesto máximo del piloto.')
  }
  if (
    ![prize1Bps, prize2Bps, prize3Bps].every(
      (value) => Number.isInteger(value) && value >= 0 && value <= BPS
    )
  ) {
    throw new Error('Cada porcentaje de premio debe estar entre 0% y 100%.')
  }
  if (prize1Bps + prize2Bps + prize3Bps !== BPS) {
    throw new Error('La distribución de premios debe sumar 100%.')
  }

  // Se calcula una sola vez al publicar. Floor evita exceder el 55% por redondeo.
  const fundCents = Math.floor((entryFeeCents * minPlayers * prizeBudgetBps) / BPS)
  const prize1Cents = Math.floor((fundCents * prize1Bps) / BPS)
  // El remanente por redondeo queda en el segundo lugar cuando no existe
  // tercer premio. Así nunca se crea accidentalmente una tercera obligación.
  const prize2Cents =
    prize3Bps === 0
      ? fundCents - prize1Cents
      : Math.floor((fundCents * prize2Bps) / BPS)
  const prize3Cents = prize3Bps === 0 ? 0 : fundCents - prize1Cents - prize2Cents

  if (
    fundCents > MAX_PILOT_TOTAL_PRIZE_CENTS ||
    prize1Cents > MAX_PILOT_FIRST_PRIZE_CENTS
  ) {
    throw new Error('El premio fijo supera los topes monetarios del piloto.')
  }

  return { fundCents, prize1Cents, prize2Cents, prize3Cents }
}

function financialSnapshot(input: {
  entryFeeCents: number
  playerCount: number
  totalPrizesCents: number
}): FinancialSnapshot {
  const grossRevenueCents = input.entryFeeCents * input.playerCount
  const sale = calculateIvaIncludedBreakdown(grossRevenueCents)
  const flowFeeNetCents = Math.round((grossRevenueCents * FLOW_NEXT_DAY_FEE_BPS) / BPS)
  const contributionCents = sale.netCents - flowFeeNetCents - input.totalPrizesCents

  return {
    playerCount: input.playerCount,
    grossRevenueCents,
    netSalesCents: sale.netCents,
    vatDebitCents: sale.ivaCents,
    flowFeeNetCents,
    fixedPrizeCents: input.totalPrizesCents,
    contributionCents,
    contributionMarginBps:
      grossRevenueCents > 0 ? Math.round((contributionCents * BPS) / grossRevenueCents) : 0,
    prizeToSalesBps:
      grossRevenueCents > 0 ? Math.round((input.totalPrizesCents * BPS) / grossRevenueCents) : 0,
  }
}

export function calculateFixedPrizeFinancials(input: {
  entryFeeCents: number
  prize1Cents: number
  prize2Cents: number
  prize3Cents: number
  minPlayers: number
  maxPlayers?: number
}): FixedPrizeFinancials {
  const totalPrizesCents = input.prize1Cents + input.prize2Cents + input.prize3Cents
  const maxPlayers = input.maxPlayers ?? input.minPlayers
  const min = financialSnapshot({
    entryFeeCents: input.entryFeeCents,
    playerCount: input.minPlayers,
    totalPrizesCents,
  })
  const max = financialSnapshot({
    entryFeeCents: input.entryFeeCents,
    playerCount: maxPlayers,
    totalPrizesCents,
  })
  const availablePerEntry =
    input.entryFeeCents -
    calculateIvaIncludedBreakdown(input.entryFeeCents).ivaCents -
    Math.round((input.entryFeeCents * FLOW_NEXT_DAY_FEE_BPS) / BPS)
  const requiredMinPlayers = availablePerEntry > 0
    ? Math.ceil(totalPrizesCents / availablePerEntry)
    : Number.POSITIVE_INFINITY

  return {
    totalPrizesCents,
    min,
    max,
    requiredMinPlayers,
    isBreakEven: input.entryFeeCents === 0 || min.contributionCents >= 0,
    isMinHealthy:
      input.entryFeeCents === 0 || min.contributionMarginBps >= MIN_TARGET_MARGIN_BPS,
  }
}

export function calculateTournamentDisplayPayouts(
  tournament: TournamentPrizeDisplayInput,
  playerCount: number
): PrizeFundPayouts {
  const prizeFundCents =
    tournament.prize_1st_cents + tournament.prize_2nd_cents + tournament.prize_3rd_cents
  return {
    playerCount,
    fundCents: prizeFundCents,
    prizeFundCents,
    prizePoolCents: prizeFundCents,
    prize1Cents: tournament.prize_1st_cents,
    prize2Cents: tournament.prize_2nd_cents,
    prize3Cents: tournament.prize_3rd_cents,
  }
}

export function calculateRequiredRevenueCents(totalPrizesCents: number) {
  if (totalPrizesCents <= 0) return 0
  const availableRatio = BPS / IVA_MULTIPLIER_BPS - FLOW_NEXT_DAY_FEE_BPS / BPS
  return Math.ceil(totalPrizesCents / availableRatio)
}

export function calculateTournamentFinancials(input: {
  entryFeeCents: number
  prize1Cents: number
  prize2Cents: number
  prize3Cents: number
  minPlayers: number
  targetPlayers?: number
}) {
  const result = calculateFixedPrizeFinancials({
    ...input,
    maxPlayers: input.targetPlayers ?? input.minPlayers,
  })

  return {
    totalPrizesCents: result.totalPrizesCents,
    minRevenueCents: result.min.grossRevenueCents,
    targetRevenueCents: result.max.grossRevenueCents,
    requiredRevenueCents: calculateRequiredRevenueCents(result.totalPrizesCents),
    minProfitCents: result.min.contributionCents,
    targetProfitCents: result.max.contributionCents,
    minMarginBps: result.min.contributionMarginBps,
    targetMarginBps: result.max.contributionMarginBps,
    requiredMinPlayers: result.requiredMinPlayers,
    isBreakEven: result.isBreakEven,
    isTargetHealthy: result.isMinHealthy,
  }
}

export function calculatePresetFinancials(preset: TournamentPreset) {
  return calculateFixedPrizeFinancials({
    entryFeeCents: pesosToCents(preset.entryFeePesos),
    prize1Cents: pesosToCents(preset.prize1Pesos),
    prize2Cents: pesosToCents(preset.prize2Pesos),
    prize3Cents: pesosToCents(preset.prize3Pesos),
    minPlayers: preset.minPlayers,
    maxPlayers: preset.maxPlayers,
  })
}
