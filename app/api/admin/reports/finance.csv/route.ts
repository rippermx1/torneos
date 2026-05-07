import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'

interface MonthlyRow {
  period: string
  registrations_count: number
  unique_users: number
  tournaments_with_revenue: number
  gross_revenue_cents: number
  prize_fund_cents: number
  platform_fee_gross_cents: number
  platform_fee_net_cents: number
  platform_fee_iva_cents: number
}

export async function GET(): Promise<Response> {
  const auth = await requireAnyRoleForApi(['admin', 'owner'])
  if (!auth.ok) return auth.response

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('monthly_platform_finance')
    .select('*')
    .order('period', { ascending: true })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as MonthlyRow[]
  const headers = [
    'periodo',
    'inscripciones',
    'usuarios_unicos',
    'torneos',
    'recaudado_bruto_clp',
    'fondo_premios_clp',
    'fee_bruto_clp',
    'fee_neto_clp',
    'iva_debito_clp',
  ]

  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.period,
        r.registrations_count,
        r.unique_users,
        r.tournaments_with_revenue,
        Math.round(r.gross_revenue_cents / 100),
        Math.round(r.prize_fund_cents / 100),
        Math.round(r.platform_fee_gross_cents / 100),
        Math.round(r.platform_fee_net_cents / 100),
        Math.round(r.platform_fee_iva_cents / 100),
      ].join(','),
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="finance-${today}.csv"`,
    },
  })
}
