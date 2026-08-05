import { describe, expect, it } from 'vitest'
import {
  calculateIvaIncludedBreakdown,
  calculatePresetFinancials,
  calculateRequiredRevenueCents,
  calculateTournamentDisplayPayouts,
  calculateTournamentFinancials,
  getTournamentPreset,
  pesosToCents,
  TOURNAMENT_PRESETS,
  tournamentsNeededForMonthlyTarget,
} from '@/lib/tournament/finance'

describe('tournament finance', () => {
  it('requires revenue above the fixed prize after IVA and Flow cost', () => {
    const required = calculateRequiredRevenueCents(pesosToCents(27000))

    expect(required).toBeGreaterThan(pesosToCents(27000))
    expect(required).toBeGreaterThanOrEqual(pesosToCents(33300))
  })

  it('aplica IVA a la inscripción completa', () => {
    const sale = calculateIvaIncludedBreakdown(pesosToCents(2000))

    expect(sale.netCents + sale.ivaCents).toBe(pesosToCents(2000))
    expect(sale.ivaCents).toBe(31933)
  })

  it('calcula margen fijo al mínimo y al máximo', () => {
    const preset = getTournamentPreset('commercial_v1')!
    const financials = calculatePresetFinancials(preset)

    expect(financials.min.contributionCents).toBe(1550617)
    expect(financials.min.contributionMarginBps).toBe(2584)
    expect(financials.max.contributionCents).toBe(2763271)
    expect(financials.max.contributionMarginBps).toBe(3684)
    expect(financials.min.fixedPrizeCents).toBe(financials.max.fixedPrizeCents)
    expect(financials.isMinHealthy).toBe(true)
  })

  it('muestra exactamente el premio publicado', () => {
    const payouts = calculateTournamentDisplayPayouts({
      prize_1st_cents: pesosToCents(24750),
      prize_2nd_cents: pesosToCents(8250),
      prize_3rd_cents: 0,
    }, 15)

    expect(payouts.prizeFundCents).toBe(pesosToCents(33000))
    expect(payouts.prize1Cents).toBe(pesosToCents(24750))
    expect(payouts.prize3Cents).toBe(0)
  })

  it('marca sanos todos los presets pagados', () => {
    for (const preset of TOURNAMENT_PRESETS.filter((item) => item.entryFeePesos > 0)) {
      const financials = calculatePresetFinancials(preset)
      expect(financials.isMinHealthy, preset.label).toBe(true)
    }
  })

  it('gobierna formatos por clave y calcula el volumen para cubrir costos fijos', () => {
    const preset = getTournamentPreset('commercial_v1')!
    const financials = calculatePresetFinancials(preset)

    expect(preset.entryFeePesos).toBe(5000)
    expect(preset.minPlayers).toBe(12)
    expect(preset.maxPlayers).toBe(15)
    expect(getTournamentPreset('formato_inventado')).toBeNull()
    expect(tournamentsNeededForMonthlyTarget(financials.min.contributionCents)).toBe(17)
    expect(tournamentsNeededForMonthlyTarget(financials.max.contributionCents)).toBe(10)
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
