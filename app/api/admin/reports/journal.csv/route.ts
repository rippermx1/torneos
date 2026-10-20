import { buildLedgerSnapshot, journalLinesToCsv } from '@/lib/accounting/ledger'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { createAdminClient } from '@/lib/supabase/server'
import { validAccountingPeriod } from '@/lib/accounting/operations'

export async function GET(req: Request): Promise<Response> {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response

  const periodParam = new URL(req.url).searchParams.get('period')
  if (periodParam && !validAccountingPeriod(periodParam)) return Response.json({ error: 'Período inválido' }, { status: 400 })
  const period = periodParam || undefined
  const ledger = await buildLedgerSnapshot(createAdminClient(), period)
  const suffix = period ?? new Date().toISOString().slice(0, 10)

  return new Response(journalLinesToCsv(ledger.journalLines), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="libro-diario-${suffix}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Accounting-Line-Count': String(ledger.journalLines.length),
      'X-Accounting-Debits-Cents': String(ledger.confirmedDebitsCents + ledger.estimatedDebitsCents),
      'X-Accounting-Credits-Cents': String(ledger.confirmedCreditsCents + ledger.estimatedCreditsCents),
    },
  })
}
