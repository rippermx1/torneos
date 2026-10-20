import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { JournalLine } from './ledger'

export interface AccountBalance {
  code: string; name: string; category: string; normal_balance: string
  opening_cents: number; debit_cents: number; credit_cents: number; closing_cents: number
}
export interface AccountingDocument {
  id: string; period: string; kind: string; reference: string; counterparty: string
  evidence: string; tax_verified: boolean; journal_entry_id: number; created_by: string
}
export interface BankMovement {
  id: string; period: string; reference: string; occurred_at: string; amount_cents: number
  evidence: string; journal_entry_id: number | null; journal_entry_ids: number[]
}
export interface AccountingClose {
  id: string; period: string; version: number; created_at: string; created_by: string
  digest: string; reopened_at: string | null; reason: string
}
export interface AccountingPackage {
  period: string | null; generated_at: string; lines: JournalLine[]; balances: AccountBalance[]
  documents: AccountingDocument[]; bank: BankMovement[]; closes: AccountingClose[]
  accounts: { code: string; name: string; category: string; normal_balance: string }[]
  audit: { id: number; action: string; actor: string; created_at: string; payload: Record<string, unknown>; result: Record<string, unknown> }[]
  controls: { unmatched_bank: number; unmatched_journal: number; pending_credit_notes: number; estimates_cents: number }
  result_cents: number; bank_opening_cents: number; bank_closing_cents: number; flow_closing_cents: number
}

// RPC returns one JSON value, so PostgREST's maximum row count cannot truncate a journal.
export async function readAccountingPackage(client: SupabaseClient<Database>, period?: string) {
  const { data, error } = await client.rpc('accounting_workspace', { p_period: period ?? null })
  if (error) throw new Error(`Contabilidad: ${error.message}`)
  return data as unknown as AccountingPackage
}

export function validAccountingPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

export function formatAccountingClp(cents: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100)
}

/** Exact decimal CLP conversion; never silently round a user-entered amount. */
export function clpToCents(value: string): number {
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(value.trim())) throw new Error('Monto CLP inválido (máximo dos decimales).')
  const [whole, fraction = ''] = value.trim().replace(',', '.').replace('-', '').split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents > 1_000_000_000_000) throw new Error('Monto fuera de rango.')
  return value.trim().startsWith('-') ? -cents : cents
}

export interface Posting { account_code: string; debit_cents: number; credit_cents: number }
export type DocumentKind = 'expense' | 'contribution' | 'settlement' | 'commission' | 'supplier_payment' | 'adjustment' | 'other_revenue'

export function documentPostings(kind: DocumentKind, net: number, iva: number, account: string, counterpart: string): Posting[] {
  if (!Number.isSafeInteger(net) || net <= 0 || !Number.isSafeInteger(iva) || iva < 0) throw new Error('Montos inválidos.')
  const gross = net + iva
  const debit = (code: string, amount: number): Posting => ({ account_code: code, debit_cents: amount, credit_cents: 0 })
  const credit = (code: string, amount: number): Posting => ({ account_code: code, debit_cents: 0, credit_cents: amount })
  switch (kind) {
    case 'expense': case 'commission':
      return [debit(account, net), ...(iva ? [debit('110300', iva)] : []), credit(kind === 'commission' ? '110200' : counterpart, gross)]
    case 'contribution': if (iva) throw new Error('Un aporte no lleva IVA.'); return [debit('110100', net), credit('310200', net)]
    case 'settlement': if (iva) throw new Error('El abono no lleva IVA; registre la factura Flow por separado.'); return [debit('110100', net), credit('110200', net)]
    case 'supplier_payment': if (iva) throw new Error('El pago no vuelve a reconocer IVA.'); return [debit('210400', net), credit('110100', net)]
    case 'other_revenue': return [debit(counterpart, gross), credit('410300', net), ...(iva ? [credit('210100', iva)] : [])]
    case 'adjustment': if (iva) throw new Error('Ingrese la corrección con cuentas explícitas y respaldo.'); return [debit(account, net), credit(counterpart, net)]
  }
}
