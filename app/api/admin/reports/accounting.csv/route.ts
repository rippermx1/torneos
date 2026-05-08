import { accountingReportToCsv, buildModeloAAccountingReport } from '@/lib/accounting/model-a-report'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(): Promise<Response> {
  const auth = await requireAnyRoleForApi(['admin', 'owner'])
  if (!auth.ok) return auth.response

  const report = await buildModeloAAccountingReport(createAdminClient())
  const today = new Date().toISOString().slice(0, 10)

  return new Response(accountingReportToCsv(report), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="accounting-modelo-a-${today}.csv"`,
    },
  })
}
