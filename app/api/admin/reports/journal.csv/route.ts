import { buildLedgerSnapshot, journalLinesToCsv } from '@/lib/accounting/ledger'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request): Promise<Response> {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response

  const periodParam = new URL(req.url).searchParams.get('period')
  const period = periodParam && /^\d{4}-\d{2}$/.test(periodParam) ? periodParam : undefined
  const ledger = await buildLedgerSnapshot(createAdminClient(), period)
  const suffix = period ?? new Date().toISOString().slice(0, 10)

  return new Response(journalLinesToCsv(ledger.journalLines), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="libro-diario-${suffix}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
