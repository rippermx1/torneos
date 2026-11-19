import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readAccountingPackage } from './operations'

type AdminSupabase = SupabaseClient<Database>
export type TrialBalanceRow = Database['public']['Views']['accounting_trial_balance']['Row']
export type JournalLine = Database['public']['Views']['accounting_journal_lines']['Row']

export interface LedgerSnapshot {
  trialBalance: TrialBalanceRow[]
  journalLines: JournalLine[]
  confirmedDebitsCents: number
  confirmedCreditsCents: number
  estimatedDebitsCents: number
  estimatedCreditsCents: number
  balanced: boolean
}

export function calculateLedgerTotals(trial: TrialBalanceRow[]) {
  return trial.reduce(
    (result, row) => {
      if (row.is_estimate) {
        result.estimatedDebitsCents += row.debit_cents
        result.estimatedCreditsCents += row.credit_cents
      } else {
        result.confirmedDebitsCents += row.debit_cents
        result.confirmedCreditsCents += row.credit_cents
      }
      return result
    },
    {
      confirmedDebitsCents: 0,
      confirmedCreditsCents: 0,
      estimatedDebitsCents: 0,
      estimatedCreditsCents: 0,
    }
  )
}

export async function buildLedgerSnapshot(
  supabase: AdminSupabase,
  period?: string
): Promise<LedgerSnapshot> {
  const pack = await readAccountingPackage(supabase, period)
  const lines = pack.lines
  const accounts = new Map(pack.accounts.map((a) => [a.code, a]))
  const groups = new Map<string, TrialBalanceRow>()
  for (const line of lines) {
    const key = `${line.period}:${line.is_estimate}:${line.account_code}`
    const account = accounts.get(line.account_code)!
    const row = groups.get(key) ?? {
      period: line.period, is_estimate: line.is_estimate, account_code: line.account_code,
      account_name: line.account_name, category: account.category, normal_balance: account.normal_balance,
      debit_cents: 0, credit_cents: 0, balance_cents: 0,
    } as TrialBalanceRow
    row.debit_cents += line.debit_cents
    row.credit_cents += line.credit_cents
    row.balance_cents = account.normal_balance === 'debit' ? row.debit_cents - row.credit_cents : row.credit_cents - row.debit_cents
    groups.set(key, row)
  }
  const trial = [...groups.values()].sort((a, b) => a.account_code.localeCompare(b.account_code))
  const totals = calculateLedgerTotals(trial)

  return {
    trialBalance: trial,
    journalLines: lines,
    ...totals,
    balanced:
      totals.confirmedDebitsCents === totals.confirmedCreditsCents &&
      totals.estimatedDebitsCents === totals.estimatedCreditsCents,
  }
}

function csvCell(value: string | number | boolean | null): string {
  const raw = value == null ? '' : String(value)
  const text = typeof value === 'string' && /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function journalLinesToCsv(lines: JournalLine[]): string {
  const headers = [
    'fecha',
    'periodo',
    'asiento',
    'evento',
    'descripcion',
    'estimado',
    'cuenta',
    'nombre_cuenta',
    'debe_clp',
    'haber_clp',
    'torneo_id',
    'usuario_id',
    'origen',
    'origen_id',
  ]

  return [
    headers.join(','),
    ...lines.map((line) =>
      [
        line.occurred_at,
        line.period,
        line.journal_entry_id,
        line.event_type,
        line.description,
        line.is_estimate,
        line.account_code,
        line.account_name,
        line.debit_cents / 100,
        line.credit_cents / 100,
        line.tournament_id,
        line.user_id,
        line.source_table,
        line.source_id,
      ]
        .map(csvCell)
        .join(',')
    ),
  ].join('\n')
}
