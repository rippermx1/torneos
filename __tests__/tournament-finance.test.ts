import { describe, expect, it } from 'vitest'
import {
  calculateRequiredRevenueCents,
  calculateTournamentFinancials,
  TOURNAMENT_PRESETS,
  pesosToCents,
} from '@/lib/tournament/finance'

describe('tournament finance', () => {
  it('requires revenue above prize pool adjusted for IVA and Flow cost', () => {
    const required = calculateRequiredRevenueCents(pesosToCents(27000))

    expect(required).toBeGreaterThan(pesosToCents(27000))
    expect(required).toBeGreaterThanOrEqual(pesosToCents(33300))
  })

  it('marks all paid presets as break-even at minimum players', () => {
    for (const preset of TOURNAMENT_PRESETS) {
      const financials = calculateTournamentFinancials({
        entryFeeCents: pesosToCents(preset.entryFeePesos),
        prize1Cents: pesosToCents(preset.prize1Pesos),
        prize2Cents: pesosToCents(preset.prize2Pesos),
        prize3Cents: pesosToCents(preset.prize3Pesos),
        minPlayers: preset.minPlayers,
        targetPlayers: preset.targetPlayers,
      })

      expect(financials.isBreakEven, preset.label).toBe(true)
    }
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
