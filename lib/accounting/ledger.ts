import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

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
  let trialQuery = supabase
    .from('accounting_trial_balance')
    .select('*')
    .order('account_code', { ascending: true })
  let linesQuery = supabase
    .from('accounting_journal_lines')
    .select('*')
    .order('occurred_at', { ascending: false })
    .order('journal_entry_id', { ascending: false })
    .order('posting_id', { ascending: true })
    .limit(300)

  if (period) {
    trialQuery = trialQuery.eq('period', period)
    linesQuery = linesQuery.eq('period', period)
  }

  const [{ data: trialBalance, error: trialError }, { data: journalLines, error: linesError }] =
    await Promise.all([trialQuery, linesQuery])

  if (trialError) throw new Error(`accounting_trial_balance: ${trialError.message}`)
  if (linesError) throw new Error(`accounting_journal_lines: ${linesError.message}`)

  const trial = (trialBalance ?? []) as TrialBalanceRow[]
  const lines = (journalLines ?? []) as JournalLine[]
  // El libro diario visible se limita a 300 lineas. El balance, en cambio,
  // debe considerar el periodo completo, por eso se calcula desde el balance
  // de comprobacion agregado en la base de datos.
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
  const text = value == null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
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
