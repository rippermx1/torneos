// ───────────────────────────────────────────────────────────────
// Modelo financiero de recarga vía Flow.
//
// Política acordada (Modelo A "split"):
// - El usuario elige cuánto quiere acreditarse en su billetera (net).
// - Cobramos al usuario un fee chico que cubre ~mitad del costo Flow
//   y el IVA sobre ese fee. El resto del costo Flow + IVA sobre el
//   margen de plataforma se absorbe en el entry_fee de los torneos.
// - Lo que se acredita en la wallet es exactamente el net que el
//   usuario pidió. No hay sorpresas en el saldo.
// - El fee es VISIBLE en el checkout antes del cobro.
//
// Tasas:
// - USER_FEE_RATE: porcentaje cobrado al usuario sobre el net.
// - IVA: 19% sobre el fee de plataforma (servicio informático).
// - El monto que se cobra a Flow es net + fee, redondeado a peso entero.
// ───────────────────────────────────────────────────────────────

/** Fee al usuario sobre el monto a recargar (1.5% — mitad del costo Flow ~3%). */
export const USER_FEE_RATE = 0.015

/** Fee mínimo en centavos para no perder dinero en montos pequeños ($150 CLP). */
export const USER_FEE_MIN_CENTS = 15000

/** Fee máximo en centavos para no castigar recargas grandes ($5.000 CLP). */
export const USER_FEE_MAX_CENTS = 500000

export interface DepositBreakdown {
  /** Lo que el usuario pidió y verá en su billetera. */
  netCents: number
  /** Lo que se cobra a Flow (net + user_fee, redondeado a peso entero). */
  chargedCents: number
  /** Diferencia: fee al usuario que cubre parcialmente el costo Flow. */
  userFeeCents: number
  /** Monto en pesos enteros para enviar a Flow API. */
  chargedPesos: number
}

/**
 * Calcula el desglose de un depósito a partir del monto neto solicitado.
 * Redondea el cobro total al peso entero superior para evitar fracciones.
 *
 * @param netCents monto que el usuario quiere acreditar en su billetera
 */
export function computeDepositBreakdown(netCents: number): DepositBreakdown {
  if (!Number.isInteger(netCents) || netCents <= 0) {
    throw new Error(`netCents inválido: ${netCents}`)
  }

  const rawFee = Math.round(netCents * USER_FEE_RATE)
  const userFeeCents = Math.min(
    USER_FEE_MAX_CENTS,
    Math.max(USER_FEE_MIN_CENTS, rawFee)
  )

  // Flow cobra en pesos enteros: redondeamos el total al peso siguiente
  // y ajustamos el fee para mantener net intacto.
  const totalRawCents = netCents + userFeeCents
  const chargedPesos = Math.ceil(totalRawCents / 100)
  const chargedCents = chargedPesos * 100
  const adjustedFee = chargedCents - netCents

  return {
    netCents,
    chargedCents,
    userFeeCents: adjustedFee,
    chargedPesos,
  }
}

/** Min/max de recarga en centavos (mismos rangos que MP para consistencia). */
export const MIN_DEPOSIT_NET_CENTS = 100000   // $1.000 CLP
export const MAX_DEPOSIT_NET_CENTS = 50000000 // $500.000 CLP
