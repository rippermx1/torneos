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

  // Política piloto: 65% máximo para premios. El IVA se extrae de la venta
  // completa; el 35% restante es sólo una métrica de contribución interna.
  it('presupuesta 65% para premios y aplica IVA a la inscripción completa', () => {
    const split = splitEntryFee(pesosToCents(1000))

    expect(split.prizeFundContributionCents).toBe(pesosToCents(650))
    expect(split.platformFeeGrossCents).toBe(pesosToCents(350))
    expect(split.platformFeeIvaCents).toBe(calculateIvaIncludedBreakdown(pesosToCents(1000)).ivaCents)
    expect(split.platformFeeNetCents).toBe(split.platformFeeGrossCents - split.platformFeeIvaCents)
  })

  it('calcula reserva de premios (fondo 65%) con distribución 70/20/10', () => {
    const payouts = calculatePrizeFundPayouts({
      entryFeeCents: pesosToCents(1000),
      playerCount: 10,
    })

    expect(payouts.prizeFundCents).toBe(pesosToCents(6500))
    expect(payouts.prize1Cents).toBe(pesosToCents(4550))
    expect(payouts.prize2Cents).toBe(pesosToCents(1300))
    expect(payouts.prize3Cents).toBe(pesosToCents(650))
  })

  it('muestra el premio fijo publicado en torneos pagados', () => {
    const payouts = calculateTournamentDisplayPayouts({
      entry_fee_cents: pesosToCents(3000),
      prize_1st_cents: pesosToCents(9000),
      prize_2nd_cents: pesosToCents(3000),
      prize_3rd_cents: pesosToCents(1000),
      min_players: 6,
    }, 2)

    expect(payouts.playerCount).toBe(2)
    expect(payouts.prizeFundCents).toBe(pesosToCents(13000))
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

    expect(financials.targetPlatformFeeGrossCents).toBe(pesosToCents(31500))
    expect(financials.targetPlatformFeeNetCents).toBe(1425925)
    expect(financials.platformNetMarginBps).toBeGreaterThanOrEqual(1500)
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
