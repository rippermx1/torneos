// ───────────────────────────────────────────────────────────────
// Modelo financiero de cobro via Flow.
//
// Politica operativa:
// - El net corresponde al valor económico a liquidar (inscripción).
// - Cobramos al usuario un fee de procesamiento que cubre el costo
//   esperado de Flow para tarjeta con abono al dia habil siguiente.
// - El checkout muestra net, fee de procesamiento y total cobrado.
// - El fee es VISIBLE en el checkout antes del cobro.
//
// Tasas:
// - Flow tarjeta next-day: 3.19% + IVA sobre su comision.
// - Fee usuario: gross-up para que, luego del IVA incluido en nuestro
//   fee de procesamiento, el neto cubra la comision neta Flow.
// - El monto que se cobra en Flow es net + fee, redondeado a peso entero.
// ───────────────────────────────────────────────────────────────

const BPS = 10000
const IVA_RATE = 0.19
const PLATFORM_FEE_NET_SHARE = 1 / (1 + IVA_RATE)

/** Costo neto Flow tarjeta con abono al día hábil siguiente: 3.19%. */
export const FLOW_CARD_NEXT_DAY_FEE_RATE = 0.0319

/** Fee bruto al usuario requerido para cubrir Flow sin pérdida operacional. */
export const USER_FEE_RATE =
  FLOW_CARD_NEXT_DAY_FEE_RATE / (PLATFORM_FEE_NET_SHARE - FLOW_CARD_NEXT_DAY_FEE_RATE)

export const USER_FEE_RATE_BPS = Math.ceil(USER_FEE_RATE * BPS)

/** Fee mínimo en centavos para no perder dinero en montos pequeños ($150 CLP). */
export const USER_FEE_MIN_CENTS = 15000

export interface DepositBreakdown {
  /** Valor neto a liquidar para el negocio, por ejemplo la inscripción. */
  netCents: number
  /** Lo que se cobra a Flow (net + user_fee, redondeado a peso entero). */
  chargedCents: number
  /** Diferencia: fee al usuario que cubre pasarela y el IVA incluido del servicio. */
  userFeeCents: number
  /** Monto en pesos enteros para enviar a Flow API. */
  chargedPesos: number
}

/**
 * Calcula el desglose de un cobro a partir del monto neto solicitado.
 * Redondea el cobro total al peso entero superior para evitar fracciones.
 *
 * @param netCents monto neto que se debe liquidar
 */
export function computeDepositBreakdown(netCents: number): DepositBreakdown {
  if (!Number.isInteger(netCents) || netCents <= 0) {
    throw new Error(`netCents inválido: ${netCents}`)
  }

  const rawFee = Math.ceil(netCents * USER_FEE_RATE)
  const userFeeCents = Math.max(USER_FEE_MIN_CENTS, rawFee)

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

/** Min/max legados del net de cobro en centavos. */
export const MIN_DEPOSIT_NET_CENTS = 100000   // $1.000 CLP
export const MAX_DEPOSIT_NET_CENTS = 50000000 // $500.000 CLP
