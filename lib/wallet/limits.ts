// ───────────────────────────────────────────────────────────────
// Límites operacionales de la billetera.
// Estos valores están hardcoded a propósito: cambiarlos requiere
// PR + revisión, no debe ser configurable en runtime.
// ───────────────────────────────────────────────────────────────

/** Mínimo de retiro por solicitud — coincide con /legal/reembolso. */
export const MIN_WITHDRAWAL_CENTS = 500000      // $5.000

/** Máximo por solicitud individual. */
export const MAX_WITHDRAWAL_CENTS = 50000000    // $500.000

/** Cap diario por usuario (suma de retiros en últimas 24h). */
export const DAILY_WITHDRAWAL_CAP_CENTS = 50000000  // $500.000

/** Cap mensual por usuario (suma de retiros en últimos 30 días). */
export const MONTHLY_WITHDRAWAL_CAP_CENTS = 200000000 // $2.000.000

/** Mínimo y máximo de recarga por operación. */
export const MIN_DEPOSIT_CENTS = 100000   // $1.000
export const MAX_DEPOSIT_CENTS = 50000000 // $500.000
