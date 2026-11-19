import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { createAdminClient } from '@/lib/supabase/server'
import { readAccountingPackage, validAccountingPeriod } from '@/lib/accounting/operations'
export async function GET(req: Request) {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const period = new URL(req.url).searchParams.get('period') ?? ''
  if (!validAccountingPeriod(period)) return Response.json({ error: 'Período inválido' }, { status: 400 })
  const pack = await readAccountingPackage(createAdminClient(), period)
  const csv = ['periodo,cuenta,nombre,naturaleza,inicial_clp,debe_clp,haber_clp,final_clp', ...pack.balances.map((b) => [period,b.code,`"${b.name.replaceAll('"','""')}"`,b.normal_balance,b.opening_cents/100,b.debit_cents/100,b.credit_cents/100,b.closing_cents/100].join(','))].join('\n')
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Disposition': `attachment; filename="saldos-${period}.csv"` } })
}
