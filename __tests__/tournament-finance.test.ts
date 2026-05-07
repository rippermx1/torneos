import { describe, expect, it } from 'vitest'
import {
  calculateEntryPoolFinancials,
  calculateIvaIncludedBreakdown,
  calculatePresetFinancials,
  calculatePrizeFundPayouts,
  calculateRequiredRevenueCents,
  calculateTournamentDisplayPayouts,
  calculateTournamentFinancials,
  splitEntryFee,
  TOURNAMENT_PRESETS,
  pesosToCents,
} from '@/lib/tournament/finance'

describe('tournament finance', () => {
  it('requires revenue above prize fund adjusted for IVA and Flow cost', () => {
    const required = calculateRequiredRevenueCents(pesosToCents(27000))

    expect(required).toBeGreaterThan(pesosToCents(27000))
    expect(required).toBeGreaterThanOrEqual(pesosToCents(33300))
  })

  it('separa cada inscripción en fondo de premios y fee con IVA incluido', () => {
    const split = splitEntryFee(pesosToCents(1000))

    expect(split.prizeFundContributionCents).toBe(pesosToCents(850))
    expect(split.platformFeeGrossCents).toBe(pesosToCents(150))
    expect(split.platformFeeIvaCents).toBe(calculateIvaIncludedBreakdown(pesosToCents(150)).ivaCents)
    expect(split.platformFeeNetCents).toBe(split.platformFeeGrossCents - split.platformFeeIvaCents)
  })

  it('calcula premios dinámicos con distribución 70/20/10', () => {
    const payouts = calculatePrizeFundPayouts({
      entryFeeCents: pesosToCents(1000),
      playerCount: 10,
    })

    expect(payouts.prizeFundCents).toBe(pesosToCents(8500))
    expect(payouts.prize1Cents).toBe(pesosToCents(5950))
    expect(payouts.prize2Cents).toBe(pesosToCents(1700))
    expect(payouts.prize3Cents).toBe(pesosToCents(850))
  })

  it('muestra al menos el premio mínimo en torneos entry_pool', () => {
    const payouts = calculateTournamentDisplayPayouts({
      entry_fee_cents: pesosToCents(3000),
      prize_1st_cents: 0,
      prize_2nd_cents: 0,
      prize_3rd_cents: 0,
      min_players: 6,
    }, 2)

    expect(payouts.playerCount).toBe(6)
    expect(payouts.prizeFundCents).toBe(pesosToCents(15300))
  })

  it('marks all paid presets as healthy under entry-pool model', () => {
    for (const preset of TOURNAMENT_PRESETS) {
      const financials = calculatePresetFinancials(preset)

      expect(financials.isTargetHealthy, preset.label).toBe(true)
    }
  })

  it('calcula ingreso neto de plataforma para el objetivo', () => {
    const financials = calculateEntryPoolFinancials({
      entryFeeCents: pesosToCents(3000),
      minPlayers: 6,
      targetPlayers: 30,
      maxPlayers: 100,
    })

    expect(financials.targetPlatformFeeGrossCents).toBe(pesosToCents(13500))
    expect(financials.targetPlatformFeeNetCents).toBeGreaterThan(pesosToCents(11000))
    expect(financials.platformNetMarginBps).toBeGreaterThanOrEqual(1200)
  })

  it('computes the required minimum players for an unsafe tournament', () => {
    const financials = calculateTournamentFinancials({
      entryFeeCents: pesosToCents(3000),
      prize1Cents: pesosToCents(15000),
      prize2Cents: pesosToCents(8000),
      prize3Cents: pesosToCents(4000),
      minPlayers: 11,
    })

    expect(financials.isBreakEven).toBe(false)
    expect(financials.requiredMinPlayers).toBe(12)
  })
})
