/**
 * Reglas vigentes del piloto.
 *
 * Estos valores tienen una contraparte persistida en
 * `platform_business_rules` para que cada asiento y cierre pueda explicarse con
 * la politica que estaba vigente. Cambiarlos requiere una nueva version de
 * politica y no debe alterar premios de torneos ya publicados.
 */
export const PILOT_BUSINESS_RULES = {
  policyVersion: 1,
  vatBps: 1900,
  prizeBudgetBps: 6500,
  maxTotalPrizeCents: 7_000_000,
  maxFirstPrizeCents: 4_900_000,
  rewardsEnabled: false,
  flowFeeNetBps: 319,
  flowRefundFeeNetCents: 20_200,
} as const

export function rewardsAreEnabled(): boolean {
  return PILOT_BUSINESS_RULES.rewardsEnabled
}
