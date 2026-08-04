import type { TournamentType } from '@/types/database'
import { PILOT_BUSINESS_RULES } from '@/lib/business/rules'

const BPS = 10000

export const IVA_BPS = 1900
export const DEFAULT_PRIZE_MODEL = 'entry_pool' as const
export const DEFAULT_PRIZE_FUND_BPS = PILOT_BUSINESS_RULES.prizeBudgetBps
export const DEFAULT_PRIZE_POOL_BPS = DEFAULT_PRIZE_FUND_BPS
export const DEFAULT_PLATFORM_FEE_BPS = BPS - DEFAULT_PRIZE_FUND_BPS
export const DEFAULT_PRIZE_1ST_BPS = 7000
export const DEFAULT_PRIZE_2ND_BPS = 2000
export const DEFAULT_PRIZE_3RD_BPS = BPS - DEFAULT_PRIZE_1ST_BPS - DEFAULT_PRIZE_2ND_BPS
export const MIN_TARGET_PLATFORM_NET_MARGIN_BPS = 1500
export const MIN_TARGET_MARGIN_BPS = MIN_TARGET_PLATFORM_NET_MARGIN_BPS

// Premio de 1er lugar por defecto para freerolls de adquisición. Un freeroll
// sin premio no capta a nadie: el premio ES la herramienta de adquisición. Es
// costo de marketing puro (sin cuota que lo financie) y configurable por torneo.
export const DEFAULT_FREEROLL_PRIZE_CENTS = 500000
// Tope de sanidad para evitar premios de freeroll por error de tipeo.
export const MAX_FREEROLL_PRIZE_CENTS = PILOT_BUSINESS_RULES.maxFirstPrizeCents
export const MAX_PILOT_TOTAL_PRIZE_CENTS = PILOT_BUSINESS_RULES.maxTotalPrizeCents
export const MAX_PILOT_FIRST_PRIZE_CENTS = PILOT_BUSINESS_RULES.maxFirstPrizeCents

export const FLOW_NEXT_DAY_FEE_BPS = PILOT_BUSINESS_RULES.flowFeeNetBps
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
  strategy: 'acquisition' | 'daily' | 'balanced' | 'premium' | 'growth'
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
    description: 'Entrada baja, premio fijo y rotación diaria.',
    entryFeePesos: 1000,
    minPlayers: 8,
    targetPlayers: 20,
    maxPlayers: 40,
    durationMinutes: 8,
    windowHours: 2,
    strategy: 'daily',
  },
  {
    key: 'challenger',
    label: 'Challenger',
    shortLabel: 'Challenger',
    description: 'Punto medio entre Express y Estándar. Mayor premio con menor barrera.',
    entryFeePesos: 1500,
    minPlayers: 6,
    targetPlayers: 15,
    maxPlayers: 30,
    durationMinutes: 8,
    windowHours: 6,
    strategy: 'growth',
  },
  {
    key: 'standard',
    label: 'Estándar balanceado',
    shortLabel: 'Estándar',
    description: 'Premio fijo atractivo con margen de plataforma sano.',
    entryFeePesos: 3000,
    minPlayers: 6,
    targetPlayers: 15,
    maxPlayers: 30,
    durationMinutes: 10,
    windowHours: 24,
    strategy: 'balanced',
  },
  {
    key: 'pro',
    label: 'Pro',
    shortLabel: 'Pro',
    description: 'Premio de alto impacto para competidores regulares exigentes.',
    entryFeePesos: 5000,
    minPlayers: 4,
    targetPlayers: 10,
    maxPlayers: 20,
    durationMinutes: 12,
    windowHours: 24,
    strategy: 'premium',
  },
  {
    key: 'elite',
    label: 'Elite alto premio',
    shortLabel: 'Elite',
    description: 'Ticket alto, cupos limitados y premio publicado antes de inscribir.',
    entryFeePesos: 10000,
    minPlayers: 4,
    targetPlayers: 10,
    maxPlayers: 10,
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

export const LATENCY_PRESET = {
  entryFeePesos: 0,
  minPlayers: 1,
  targetPlayers: 1,
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
  prizeFundBps: number = DEFAULT_PRIZE_FUND_BPS
): EntryFeeSplit {
  if (!Number.isInteger(entryFeeCents) || entryFeeCents < 0) {
    throw new Error(`entryFeeCents inválido: ${entryFeeCents}`)
  }
  if (!Number.isInteger(prizeFundBps) || prizeFundBps < 0 || prizeFundBps > BPS) {
    throw new Error(`prizeFundBps inválido: ${prizeFundBps}`)
  }

  const prizeFundContributionCents = Math.round((entryFeeCents * prizeFundBps) / BPS)
  const platformFeeGrossCents = entryFeeCents - prizeFundContributionCents
  // La empresa vende la inscripcion completa. Por eso el IVA se extrae del
  // precio total, no solamente del remanente presupuestado para plataforma.
  const saleTax = calculateIvaIncludedBreakdown(entryFeeCents)

  return {
    entryFeeCents,
    prizeFundContributionCents,
    platformFeeGrossCents,
    platformFeeNetCents: platformFeeGrossCents - saleTax.ivaCents,
    platformFeeIvaCents: saleTax.ivaCents,
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

// ── Escalera de premios ("bolsa garantizada escalonada") ──────────────
// Premios fijos y publicados por tramos que suben con la convocatoria. Cada
// tramo reserva 65% del bruto y deja una contribucion estimada de ~15,8% luego
// de IVA de la venta y comision Flow neta, evitando que el
// retorno al jugador colapse al llenarse el torneo. Ver
// docs/roadmap-retencion-rentabilidad.md.

/** Múltiplos del mínimo que definen los umbrales de la escalera. */
export const DEFAULT_PRIZE_LADDER_MULTIPLES = [1, 2.5, 5, 8, 13] as const

export interface PrizeTier {
  /** El tramo aplica cuando los inscritos ≥ thresholdPlayers. */
  thresholdPlayers: number
  fundCents: number
  prize1Cents: number
  prize2Cents: number
  prize3Cents: number
}

/**
 * Construye la escalera publicada para un torneo PAGADO (entry > 0).
 * Para cada umbral (round(múltiplo × mínimo), único, ≤ maxPlayers), el fondo =
 * prizeFundBps × entry × umbral, repartido 70/20/10. Invariante de solvencia:
 * fondo ≤ entry × umbral (porque prizeFundBps ≤ 100%), garantizado a ese llenado.
 * Los freerolls (entry = 0) NO usan esta función: su premio es un costo fijo de
 * marketing, se maneja como un único tramo aparte en createTournament.
 */
export function buildPrizeLadder(input: {
  entryFeeCents: number
  minPlayers: number
  maxPlayers?: number
  prizeFundBps?: number
  prize1Bps?: number
  prize2Bps?: number
  prize3Bps?: number
  multiples?: readonly number[]
}): PrizeTier[] {
  const { entryFeeCents, minPlayers } = input
  if (!Number.isInteger(entryFeeCents) || entryFeeCents < 0) {
    throw new Error(`entryFeeCents inválido: ${entryFeeCents}`)
  }
  if (!Number.isInteger(minPlayers) || minPlayers < 1) {
    throw new Error(`minPlayers inválido: ${minPlayers}`)
  }

  const prizeFundBps = input.prizeFundBps ?? DEFAULT_PRIZE_FUND_BPS
  const prize1Bps = input.prize1Bps ?? DEFAULT_PRIZE_1ST_BPS
  const prize2Bps = input.prize2Bps ?? DEFAULT_PRIZE_2ND_BPS
  const prize3Bps = input.prize3Bps ?? DEFAULT_PRIZE_3RD_BPS
  if (prize1Bps + prize2Bps + prize3Bps !== BPS) {
    throw new Error('La distribución de premios debe sumar 100%')
  }

  const maxPlayers = input.maxPlayers ?? Number.POSITIVE_INFINITY
  const multiples = input.multiples ?? DEFAULT_PRIZE_LADDER_MULTIPLES

  // Umbrales: el base (mínimo) siempre; el resto = round(múltiplo × min), únicos,
  // dentro de [min, maxPlayers]. Orden ascendente.
  const thresholds = new Set<number>([minPlayers])
  for (const m of multiples) {
    const t = Math.round(m * minPlayers)
    if (t >= minPlayers && t <= maxPlayers) thresholds.add(t)
  }
  // La capacidad maxima tambien es una promesa economica. Se publica como
  // tramo final para evitar que el premio quede congelado al llenarse.
  if (Number.isFinite(maxPlayers)) thresholds.add(maxPlayers)

  const tiers = [...thresholds]
    .sort((a, b) => a - b)
    .map((threshold) => {
      const fund = Math.round((entryFeeCents * threshold * prizeFundBps) / BPS)
      const prize1Cents = Math.round((fund * prize1Bps) / BPS)
      const prize2Cents = Math.round((fund * prize2Bps) / BPS)
      const prize3Cents = fund - prize1Cents - prize2Cents
      return { thresholdPlayers: threshold, fundCents: fund, prize1Cents, prize2Cents, prize3Cents }
    })

  const exceedsPilotCaps = tiers.some(
    (tier) =>
      tier.fundCents > MAX_PILOT_TOTAL_PRIZE_CENTS ||
      tier.prize1Cents > MAX_PILOT_FIRST_PRIZE_CENTS
  )

  if (exceedsPilotCaps) {
    throw new Error(
      'La capacidad o un tramo supera los topes de premios vigentes para el piloto'
    )
  }

  return tiers
}

/**
 * Selecciona el tramo aplicable dado el número de inscritos: el de mayor umbral
 * que no supere `registeredCount`. Si ninguno aplica (registrados < base),
 * retorna el tramo base. Asume `tiers` ascendente por thresholdPlayers.
 */
export function selectPrizeTier(tiers: readonly PrizeTier[], registeredCount: number): PrizeTier {
  if (tiers.length === 0) throw new Error('No hay tramos de premio')
  let selected = tiers[0]!
  for (const tier of tiers) {
    if (registeredCount >= tier.thresholdPlayers) selected = tier
    else break
  }
  return selected
}

export function calculateTournamentDisplayPayouts(
  tournament: TournamentPrizeDisplayInput,
  playerCount: number
): PrizeFundPayouts {
  const fixedPrizeFundCents =
    tournament.prize_1st_cents + tournament.prize_2nd_cents + tournament.prize_3rd_cents

  if (fixedPrizeFundCents > 0 || tournament.entry_fee_cents === 0) {
    return {
      playerCount,
      prizeFundCents: fixedPrizeFundCents,
      prizePoolCents: fixedPrizeFundCents,
      prize1Cents: tournament.prize_1st_cents,
      prize2Cents: tournament.prize_2nd_cents,
      prize3Cents: tournament.prize_3rd_cents,
    }
  }

  return calculatePrizeFundPayouts({
    entryFeeCents: tournament.entry_fee_cents,
    playerCount: Math.max(playerCount, tournament.min_players),
    prizeFundBps: tournament.prize_fund_bps ?? tournament.prize_pool_bps ?? DEFAULT_PRIZE_FUND_BPS,
    prize1Bps: tournament.prize_1st_bps ?? DEFAULT_PRIZE_1ST_BPS,
    prize2Bps: tournament.prize_2nd_bps ?? DEFAULT_PRIZE_2ND_BPS,
    prize3Bps: tournament.prize_3rd_bps ?? DEFAULT_PRIZE_3RD_BPS,
  })
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
  const minPlatformFeeGrossCents = minRevenueCents - minPayouts.prizeFundCents
  const targetPlatformFeeGrossCents = targetRevenueCents - targetPayouts.prizeFundCents
  const maxPlatformFeeGrossCents = maxRevenueCents - maxPayouts.prizeFundCents
  const minTax = calculateIvaIncludedBreakdown(minRevenueCents)
  const targetTax = calculateIvaIncludedBreakdown(targetRevenueCents)
  const maxTax = calculateIvaIncludedBreakdown(maxRevenueCents)
  const minFlowFeeNetCents = Math.round((minRevenueCents * FLOW_NEXT_DAY_FEE_BPS) / BPS)
  const targetFlowFeeNetCents = Math.round((targetRevenueCents * FLOW_NEXT_DAY_FEE_BPS) / BPS)
  const maxFlowFeeNetCents = Math.round((maxRevenueCents * FLOW_NEXT_DAY_FEE_BPS) / BPS)
  const contributionPerEntryCents =
    split.platformFeeNetCents - Math.round((input.entryFeeCents * FLOW_NEXT_DAY_FEE_BPS) / BPS)
  const platformNetMarginBps = input.entryFeeCents > 0
    ? Math.round((contributionPerEntryCents * BPS) / input.entryFeeCents)
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
    minPlatformFeeNetCents:
      minPlatformFeeGrossCents - minTax.ivaCents - minFlowFeeNetCents,
    targetPlatformFeeNetCents:
      targetPlatformFeeGrossCents - targetTax.ivaCents - targetFlowFeeNetCents,
    maxPlatformFeeNetCents:
      maxPlatformFeeGrossCents - maxTax.ivaCents - maxFlowFeeNetCents,
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
