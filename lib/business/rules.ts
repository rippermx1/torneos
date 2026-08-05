/**
 * Reglas vigentes del piloto.
 *
 * Estos valores tienen una contraparte persistida en
 * `platform_business_rules` para que cada asiento y cierre pueda explicarse con
 * la politica que estaba vigente. Cambiarlos requiere una nueva version de
 * politica y no debe alterar premios de torneos ya publicados.
 */
export const PLATFORM_BUSINESS_RULES = {
  policyVersion: 3,
  vatBps: 1900,
  prizeBudgetBps: 5500,
  minPaidEntryFeeCents: 200_000,
  maxCapacityRatioBps: 12_500,
  minContributionMarginBps: 2500,
  monthlyFixedCostTargetCents: 25_000_000,
  maxTotalPrizeCents: 7_000_000,
  maxFirstPrizeCents: 4_900_000,
  rewardsEnabled: false,
  flowFeeNetBps: 319,
  flowRefundFeeNetCents: 20_200,
} as const

// Alias temporal para consumidores historicos. Nuevas reglas deben usar el
// nombre de plataforma, porque el piloto v2 ya no es el formato comercial.
export const PILOT_BUSINESS_RULES = PLATFORM_BUSINESS_RULES

export function rewardsAreEnabled(): boolean {
  return PLATFORM_BUSINESS_RULES.rewardsEnabled
}
