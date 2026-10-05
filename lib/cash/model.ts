export type CashKind = 'funding' | 'flow_settlement' | 'tax_payment' | 'operating_expense' | 'chargeback'
export interface CashStatus {
  observed_at: string; exposure_cents: number; required_reserve_cents: number
  wallet_cents: number; uncredited_prizes_cents: number; reserved_withdrawals_cents: number
  promised_prizes_cents: number; refunds_cents: number; unsettled_payments_cents: number; tax_reserve_cents: number
  bank_book_cents: number; flow_book_cents: number; negative_wallets: number; integrity_failures: number
  available_bank_cents: number | null; shortfall_cents: number | null; reconciliation_id: string | null
  reconciliation_at: string | null; additional_reserve_cents: number | null; max_exposure_cents: number | null
  paused: boolean; admissions_allowed: boolean; blocking_reasons: string[]; open_differences: number
}
export interface CashMovement { id: string; kind: CashKind; amount_cents: number; bank_reference: string; occurred_at: string; proof_path: string; created_by: string; created_at: string; note: string; approved_by: string | null; approved_at: string | null; rejected_at: string | null; rejected_by: string | null; rejection_note: string | null; journal_id: number | null }
export interface CashReconciliation { id: string; observed_at: string; created_at: string; created_by: string; bank_total_cents: number; bank_held_cents: number; flow_total_cents: number; flow_held_cents: number; bank_proof_path: string; flow_proof_path: string; snapshot: Record<string, unknown>; note: string; status: 'pending' | 'approved' | 'rejected'; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null }
export interface CashDifference { id: string; reconciliation_id: string; source: 'bank' | 'flow'; difference_cents: number; assigned_to: string; due_at: string; reason: string; resolved_by: string | null; resolved_at: string | null; replacement_id: string | null; resolution_note: string | null }
export interface CashEvent { id: string; target_id: string; action: string; actor_id: string; note: string; details: Record<string, unknown>; created_at: string }

export class CashInputError extends Error {}

export function parseCashCLP(value: FormDataEntryValue | null): number {
  if (typeof value !== 'string' || !/^\d{1,13}$/.test(value) || Number(value) > 9_000_000_000_000) throw new CashInputError('Monto CLP inválido: usa pesos enteros sin separadores')
  return Number(value) * 100
}
export function assertCashStatus(value: unknown): asserts value is CashStatus {
  if (!value || typeof value !== 'object') throw new Error('Caja sin datos')
  const data = value as Record<string, unknown>
  const nullable = ['available_bank_cents', 'shortfall_cents', 'additional_reserve_cents', 'max_exposure_cents']
  const amounts = ['exposure_cents', 'required_reserve_cents', 'wallet_cents', 'uncredited_prizes_cents', 'reserved_withdrawals_cents', 'promised_prizes_cents', 'refunds_cents', 'unsettled_payments_cents', 'tax_reserve_cents', 'bank_book_cents', 'flow_book_cents', 'negative_wallets', 'integrity_failures', 'open_differences', ...nullable]
  if (amounts.some(key => !(nullable.includes(key) && data[key] === null) && !Number.isSafeInteger(data[key])) ||
    typeof data.admissions_allowed !== 'boolean' || typeof data.paused !== 'boolean' ||
    typeof data.observed_at !== 'string' || !Number.isFinite(Date.parse(data.observed_at)) ||
    !Array.isArray(data.blocking_reasons) || data.blocking_reasons.some(reason => typeof reason !== 'string') ||
    data.admissions_allowed !== (data.blocking_reasons.length === 0)) throw new Error('Comprobación de caja incompleta')
  const cash = value as CashStatus
  const exposure = [cash.wallet_cents, cash.uncredited_prizes_cents, cash.reserved_withdrawals_cents, cash.promised_prizes_cents, cash.refunds_cents, cash.unsettled_payments_cents]
  if (exposure.some(amount => amount < 0) || cash.tax_reserve_cents < 0 ||
    exposure.reduce((sum, amount) => sum + amount, 0) !== cash.exposure_cents ||
    cash.required_reserve_cents !== cash.exposure_cents + cash.tax_reserve_cents + (cash.additional_reserve_cents ?? 0) ||
    (cash.admissions_allowed && (cash.paused || cash.available_bank_cents === null || cash.max_exposure_cents === null || cash.additional_reserve_cents === null ||
      cash.available_bank_cents < cash.required_reserve_cents || cash.exposure_cents > cash.max_exposure_cents ||
      cash.open_differences !== 0 || cash.integrity_failures !== 0 || cash.negative_wallets !== 0 || !cash.reconciliation_id || !cash.reconciliation_at))) throw new Error('Reserva de caja inconsistente')
}
