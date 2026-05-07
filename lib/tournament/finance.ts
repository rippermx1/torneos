import type { TournamentType } from '@/types/database'

const BPS = 10000

export const IVA_BPS = 1900
export const DEFAULT_PRIZE_MODEL = 'entry_pool' as const
export const DEFAULT_PRIZE_FUND_BPS = 8500
export const DEFAULT_PRIZE_POOL_BPS = DEFAULT_PRIZE_FUND_BPS
export const DEFAULT_PLATFORM_FEE_BPS = BPS - DEFAULT_PRIZE_FUND_BPS
export const DEFAULT_PRIZE_1ST_BPS = 7000
export const DEFAULT_PRIZE_2ND_BPS = 2000
export const DEFAULT_PRIZE_3RD_BPS = BPS - DEFAULT_PRIZE_1ST_BPS - DEFAULT_PRIZE_2ND_BPS
export const MIN_TARGET_PLATFORM_NET_MARGIN_BPS = 1000
export const MIN_TARGET_MARGIN_BPS = MIN_TARGET_PLATFORM_NET_MARGIN_BPS

export const FLOW_NEXT_DAY_FEE_BPS = 319
const IVA_MULTIPLIER_BPS = BPS + IVA_BPS
const FLOW_EFFECTIVE_COST_BPS = Math.ceil((FLOW_NEXT_DAY_FEE_BPS * IVA_MULTIPLIER_BPS) / BPS)
const FLOW_NET_BPS = BPS - FLOW_EFFECTIVE_COST_BPS

export interface TournamentPreset {
  key: TournamentType
  label: string
  shortLabel: string
  description: string
  entryFeePesos: number
  minPlayers: number
  targetPlayers: number
  maxPlayers: number
  durationMinutes: number
  windowHours: number
  strategy: 'acquisition' | 'daily' | 'balanced' | 'premium'
}

export interface TournamentFinancials {
  totalPrizesCents: number
  minRevenueCents: number
  targetRevenueCents: number
  requiredRevenueCents: number
  minProfitCents: number
  targetProfitCents: number
  minMarginBps: number
  targetMarginBps: number
  requiredMinPlayers: number
  isBreakEven: boolean
  isTargetHealthy: boolean
}

export interface EntryFeeSplit {
  entryFeeCents: number
  prizeFundContributionCents: number
  platformFeeGrossCents: number
  platformFeeNetCents: number
  platformFeeIvaCents: number
  prizeFundBps: number
  platformFeeBps: number
}

export interface PrizeFundPayouts {
  playerCount: number
  prizeFundCents: number
  prizePoolCents: number
  prize1Cents: number
  prize2Cents: number
  prize3Cents: number
}

export interface TournamentPrizeDisplayInput {
  entry_fee_cents: number
  prize_1st_cents: number
  prize_2nd_cents: number
  prize_3rd_cents: number
  min_players: number
  prize_fund_bps?: number
  prize_pool_bps?: number
  prize_1st_bps?: number
  prize_2nd_bps?: number
  prize_3rd_bps?: number
}

export interface EntryPoolFinancials {
  split: EntryFeeSplit
  minRevenueCents: number
  targetRevenueCents: number
  maxRevenueCents: number
  minPrizeFundCents: number
  targetPrizeFundCents: number
  maxPrizeFundCents: number
  minPlatformFeeGrossCents: number
  targetPlatformFeeGrossCents: number
  maxPlatformFeeGrossCents: number
  minPlatformFeeNetCents: number
  targetPlatformFeeNetCents: number
  maxPlatformFeeNetCents: number
  minPlatformFeeIvaCents: number
  targetPlatformFeeIvaCents: number
  maxPlatformFeeIvaCents: number
  minPayouts: PrizeFundPayouts
  targetPayouts: PrizeFundPayouts
  maxPayouts: PrizeFundPayouts
  platformNetMarginBps: number
  isTargetHealthy: boolean
}

export const TOURNAMENT_PRESETS = [
  {
    key: 'express',
    label: 'Express diario',
    shortLabel: 'Express',
    description: 'Entrada baja y premios dinámicos para actividad diaria.',
    entryFeePesos: 1000,
    minPlayers: 8,
    targetPlayers: 30,
    maxPlayers: 120,
    durationMinutes: 8,
    windowHours: 2,
    strategy: 'daily',
  },
  {
    key: 'standard',
    label: 'Estándar balanceado',
    shortLabel: 'Estándar',
    description: 'Premios crecientes con buena relación premio/entrada.',
    entryFeePesos: 3000,
    minPlayers: 6,
    targetPlayers: 30,
    maxPlayers: 100,
    durationMinutes: 10,
    windowHours: 24,
    strategy: 'balanced',
  },
  {
    key: 'elite',
    label: 'Elite alto premio',
    shortLabel: 'Elite',
    description: 'Ticket alto, cupos limitados y premio principal fuerte.',
    entryFeePesos: 10000,
    minPlayers: 4,
    targetPlayers: 20,
    maxPlayers: 50,
    durationMinutes: 15,
    windowHours: 48,
    strategy: 'premium',
  },
  {
    key: 'freeroll',
    label: 'Freeroll adquisición',
    shortLabel: 'Freeroll',
    description: 'Costo de marketing controlado para captar y reactivar usuarios.',
    entryFeePesos: 0,
    minPlayers: 2,
    targetPlayers: 80,
    maxPlayers: 200,
    durationMinutes: 10,
    windowHours: 48,
    strategy: 'acquisition',
  },
] as const satisfies readonly TournamentPreset[]

export function pesosToCents(pesos: number) {
  return Math.round(pesos * 100)
}

export function centsToPesos(cents: number) {
  return Math.round(cents / 100)
}

export function getPresetByType(type: TournamentType) {
  return TOURNAMENT_PRESETS.find((preset) => preset.key === type) ?? TOURNAMENT_PRESETS[1]
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

export function splitEntryFee(
  entryFeeCents: number,
  prizeFundBps = DEFAULT_PRIZE_FUND_BPS
): EntryFeeSplit {
  if (!Number.isInteger(entryFeeCents) || entryFeeCents < 0) {
    throw new Error(`entryFeeCents inválido: ${entryFeeCents}`)
  }
  if (!Number.isInteger(prizeFundBps) || prizeFundBps < 0 || prizeFundBps > BPS) {
    throw new Error(`prizeFundBps inválido: ${prizeFundBps}`)
  }

  const prizeFundContributionCents = Math.round((entryFeeCents * prizeFundBps) / BPS)
  const platformFeeGrossCents = entryFeeCents - prizeFundContributionCents
  const platformTax = calculateIvaIncludedBreakdown(platformFeeGrossCents)

  return {
    entryFeeCents,
    prizeFundContributionCents,
    platformFeeGrossCents,
    platformFeeNetCents: platformTax.netCents,
    platformFeeIvaCents: platformTax.ivaCents,
    prizeFundBps,
    platformFeeBps: BPS - prizeFundBps,
  }
}

export function calculatePrizeFundPayouts(input: {
  entryFeeCents: number
  playerCount: number
  prizeFundBps?: number
  prize1Bps?: number
  prize2Bps?: number
  prize3Bps?: number
}): PrizeFundPayouts {
  const playerCount = Math.max(0, Math.floor(input.playerCount))
  const prizeFundBps = input.prizeFundBps ?? DEFAULT_PRIZE_FUND_BPS
  const prize1Bps = input.prize1Bps ?? DEFAULT_PRIZE_1ST_BPS
  const prize2Bps = input.prize2Bps ?? DEFAULT_PRIZE_2ND_BPS
  const prize3Bps = input.prize3Bps ?? DEFAULT_PRIZE_3RD_BPS

  if (prize1Bps + prize2Bps + prize3Bps !== BPS) {
    throw new Error('La distribución de premios debe sumar 100%')
  }

  const prizeFundCents = Math.round((input.entryFeeCents * playerCount * prizeFundBps) / BPS)
  const prize1Cents = Math.round((prizeFundCents * prize1Bps) / BPS)
  const prize2Cents = Math.round((prizeFundCents * prize2Bps) / BPS)
  const prize3Cents = prizeFundCents - prize1Cents - prize2Cents

  return {
    playerCount,
    prizeFundCents,
    prizePoolCents: prizeFundCents,
    prize1Cents,
    prize2Cents,
    prize3Cents,
  }
}

export function calculateTournamentDisplayPayouts(
  tournament: TournamentPrizeDisplayInput,
  playerCount: number
): PrizeFundPayouts {
  if (tournament.entry_fee_cents > 0) {
    return calculatePrizeFundPayouts({
      entryFeeCents: tournament.entry_fee_cents,
      playerCount: Math.max(playerCount, tournament.min_players),
      prizeFundBps: tournament.prize_fund_bps ?? tournament.prize_pool_bps ?? DEFAULT_PRIZE_FUND_BPS,
      prize1Bps: tournament.prize_1st_bps ?? DEFAULT_PRIZE_1ST_BPS,
      prize2Bps: tournament.prize_2nd_bps ?? DEFAULT_PRIZE_2ND_BPS,
      prize3Bps: tournament.prize_3rd_bps ?? DEFAULT_PRIZE_3RD_BPS,
    })
  }

  return {
    playerCount,
    prizeFundCents:
      tournament.prize_1st_cents + tournament.prize_2nd_cents + tournament.prize_3rd_cents,
    prizePoolCents:
      tournament.prize_1st_cents + tournament.prize_2nd_cents + tournament.prize_3rd_cents,
    prize1Cents: tournament.prize_1st_cents,
    prize2Cents: tournament.prize_2nd_cents,
    prize3Cents: tournament.prize_3rd_cents,
  }
}

export function calculateEntryPoolFinancials(input: {
  entryFeeCents: number
  minPlayers: number
  targetPlayers?: number
  maxPlayers?: number
  prizeFundBps?: number
  prizePoolBps?: number
}): EntryPoolFinancials {
  const targetPlayers = input.targetPlayers ?? input.minPlayers
  const maxPlayers = input.maxPlayers ?? targetPlayers
  const split = splitEntryFee(input.entryFeeCents, input.prizeFundBps ?? input.prizePoolBps)
  const minPayouts = calculatePrizeFundPayouts({
    entryFeeCents: input.entryFeeCents,
    playerCount: input.minPlayers,
    prizeFundBps: split.prizeFundBps,
  })
  const targetPayouts = calculatePrizeFundPayouts({
    entryFeeCents: input.entryFeeCents,
    playerCount: targetPlayers,
    prizeFundBps: split.prizeFundBps,
  })
  const maxPayouts = calculatePrizeFundPayouts({
    entryFeeCents: input.entryFeeCents,
    playerCount: maxPlayers,
    prizeFundBps: split.prizeFundBps,
  })

  const minRevenueCents = input.entryFeeCents * input.minPlayers
  const targetRevenueCents = input.entryFeeCents * targetPlayers
  const maxRevenueCents = input.entryFeeCents * maxPlayers
  const minPlatformFeeGrossCents = split.platformFeeGrossCents * input.minPlayers
  const targetPlatformFeeGrossCents = split.platformFeeGrossCents * targetPlayers
  const maxPlatformFeeGrossCents = split.platformFeeGrossCents * maxPlayers
  const minTax = calculateIvaIncludedBreakdown(minPlatformFeeGrossCents)
  const targetTax = calculateIvaIncludedBreakdown(targetPlatformFeeGrossCents)
  const maxTax = calculateIvaIncludedBreakdown(maxPlatformFeeGrossCents)
  const platformNetMarginBps = input.entryFeeCents > 0
    ? Math.round((split.platformFeeNetCents * BPS) / input.entryFeeCents)
    : 0

  return {
    split,
    minRevenueCents,
    targetRevenueCents,
    maxRevenueCents,
    minPrizeFundCents: minPayouts.prizeFundCents,
    targetPrizeFundCents: targetPayouts.prizeFundCents,
    maxPrizeFundCents: maxPayouts.prizeFundCents,
    minPlatformFeeGrossCents,
    targetPlatformFeeGrossCents,
    maxPlatformFeeGrossCents,
    minPlatformFeeNetCents: minTax.netCents,
    targetPlatformFeeNetCents: targetTax.netCents,
    maxPlatformFeeNetCents: maxTax.netCents,
    minPlatformFeeIvaCents: minTax.ivaCents,
    targetPlatformFeeIvaCents: targetTax.ivaCents,
    maxPlatformFeeIvaCents: maxTax.ivaCents,
    minPayouts,
    targetPayouts,
    maxPayouts,
    platformNetMarginBps,
    isTargetHealthy: input.entryFeeCents === 0 || platformNetMarginBps >= MIN_TARGET_PLATFORM_NET_MARGIN_BPS,
  }
}

export function calculateRequiredRevenueCents(totalPrizesCents: number) {
  if (totalPrizesCents <= 0) return 0
  return Math.ceil((totalPrizesCents * IVA_MULTIPLIER_BPS) / FLOW_NET_BPS)
}

export function calculateTournamentFinancials(input: {
  entryFeeCents: number
  prize1Cents: number
  prize2Cents: number
  prize3Cents: number
  minPlayers: number
  targetPlayers?: number
}): TournamentFinancials {
  const totalPrizesCents = input.prize1Cents + input.prize2Cents + input.prize3Cents
  const minRevenueCents = input.entryFeeCents * input.minPlayers
  const targetRevenueCents = input.entryFeeCents * (input.targetPlayers ?? input.minPlayers)
  const requiredRevenueCents = calculateRequiredRevenueCents(totalPrizesCents)
  const minProfitCents = minRevenueCents - requiredRevenueCents
  const targetProfitCents = targetRevenueCents - requiredRevenueCents
  const minMarginBps = minRevenueCents > 0 ? Math.round((minProfitCents * BPS) / minRevenueCents) : 0
  const targetMarginBps = targetRevenueCents > 0 ? Math.round((targetProfitCents * BPS) / targetRevenueCents) : 0
  const requiredMinPlayers = input.entryFeeCents > 0
    ? Math.ceil(requiredRevenueCents / input.entryFeeCents)
    : input.minPlayers

  return {
    totalPrizesCents,
    minRevenueCents,
    targetRevenueCents,
    requiredRevenueCents,
    minProfitCents,
    targetProfitCents,
    minMarginBps,
    targetMarginBps,
    requiredMinPlayers,
    isBreakEven: input.entryFeeCents === 0 || minRevenueCents >= requiredRevenueCents,
    isTargetHealthy: input.entryFeeCents === 0 || targetMarginBps >= MIN_TARGET_MARGIN_BPS,
  }
}

export function calculatePresetFinancials(preset: TournamentPreset) {
  return calculateEntryPoolFinancials({
    entryFeeCents: pesosToCents(preset.entryFeePesos),
    minPlayers: preset.minPlayers,
    targetPlayers: preset.targetPlayers,
    maxPlayers: preset.maxPlayers,
  })
}
