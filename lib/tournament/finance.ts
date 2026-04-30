import type { TournamentType } from '@/types/database'

export const IVA_BPS = 1900
export const FLOW_NEXT_DAY_FEE_BPS = 319
export const MIN_TARGET_MARGIN_BPS = 1200

const BPS = 10000
const IVA_MULTIPLIER_BPS = BPS + IVA_BPS
const FLOW_EFFECTIVE_COST_BPS = Math.ceil((FLOW_NEXT_DAY_FEE_BPS * IVA_MULTIPLIER_BPS) / BPS)
const FLOW_NET_BPS = BPS - FLOW_EFFECTIVE_COST_BPS

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

export const TOURNAMENT_PRESETS = [
  {
    key: 'express',
    label: 'Express rentable',
    shortLabel: 'Express',
    description: 'Baja entrada, premio visible y cierre rápido para actividad diaria.',
    entryFeePesos: 1000,
    prize1Pesos: 6000,
    prize2Pesos: 2500,
    prize3Pesos: 1000,
    minPlayers: 14,
    targetPlayers: 28,
    maxPlayers: 60,
    durationMinutes: 8,
    windowHours: 2,
    strategy: 'daily',
  },
  {
    key: 'standard',
    label: 'Estándar balanceado',
    shortLabel: 'Estándar',
    description: 'Premios atractivos con margen sano desde el mínimo.',
    entryFeePesos: 3000,
    prize1Pesos: 15000,
    prize2Pesos: 8000,
    prize3Pesos: 4000,
    minPlayers: 14,
    targetPlayers: 35,
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
    prize1Pesos: 60000,
    prize2Pesos: 25000,
    prize3Pesos: 10000,
    minPlayers: 14,
    targetPlayers: 20,
    maxPlayers: 24,
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
    prize1Pesos: 5000,
    prize2Pesos: 0,
    prize3Pesos: 0,
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
  return calculateTournamentFinancials({
    entryFeeCents: pesosToCents(preset.entryFeePesos),
    prize1Cents: pesosToCents(preset.prize1Pesos),
    prize2Cents: pesosToCents(preset.prize2Pesos),
    prize3Cents: pesosToCents(preset.prize3Pesos),
    minPlayers: preset.minPlayers,
    targetPlayers: preset.targetPlayers,
  })
}
