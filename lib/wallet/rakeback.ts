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

const DAY_MS = 24 * 60 * 60 * 1000

export interface CreditTx {
  amountCents: number
  createdAt: string
  /** Vencimiento del grant (solo aplica a montos positivos). */
  expiresAt?: string | null
}

/**
 * Monto de crédito VENCIDO a expirar ahora, calculado FIFO: los débitos (consumos
 * y expiraciones previas) se aplican a los grants más antiguos; lo que queda sin
 * consumir en grants ya vencidos es lo que expira. Función pura e idempotente
 * (una expiración previa registrada consume su propio grant y no se vuelve a contar).
 */
export function computeExpiredCredit(txs: CreditTx[], now: Date = new Date()): number {
  const sorted = [...txs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
  const grants: { remaining: number; expiresAt: number }[] = []

  for (const tx of sorted) {
    if (tx.amountCents > 0) {
      const expiresAt = tx.expiresAt
        ? new Date(tx.expiresAt).getTime()
        : new Date(tx.createdAt).getTime() + RAKEBACK_EXPIRY_DAYS * DAY_MS
      grants.push({ remaining: tx.amountCents, expiresAt })
    } else if (tx.amountCents < 0) {
      let debit = -tx.amountCents
      while (debit > 0 && grants.length > 0) {
        const head = grants[0]!
        const take = Math.min(head.remaining, debit)
        head.remaining -= take
        debit -= take
        if (head.remaining === 0) grants.shift()
      }
    }
  }

  const nowMs = now.getTime()
  let expired = 0
  for (const grant of grants) {
    if (grant.expiresAt <= nowMs) expired += grant.remaining
  }
  return expired
}
