// Rakeback: crédito de torneo (no retirable) que se otorga por cada inscripción
// pagada, para subir frecuencia y retención. Ver docs/roadmap-retencion-rentabilidad.md.

/** Porcentaje de la inscripción devuelto como crédito (7%). */
export const DEFAULT_RAKEBACK_BPS = 700

/** Vencimiento del crédito en días desde su otorgamiento. */
export const RAKEBACK_EXPIRY_DAYS = 30

/**
 * Crédito de rakeback en centavos para una inscripción pagada. Los freerolls
 * (entry 0) y montos no positivos no generan crédito.
 */
export function computeRakebackCents(entryCents: number, bps: number = DEFAULT_RAKEBACK_BPS): number {
  if (!Number.isInteger(entryCents) || entryCents <= 0) return 0
  if (!Number.isInteger(bps) || bps < 0) throw new Error(`bps inválido: ${bps}`)
  return Math.round((entryCents * bps) / 10000)
}

/** Fecha ISO de vencimiento del crédito otorgado ahora. */
export function rakebackExpiryIso(now: Date = new Date(), days: number = RAKEBACK_EXPIRY_DAYS): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}
