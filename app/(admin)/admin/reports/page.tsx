import { createAdminClient } from '@/lib/supabase/server'
import { formatCLP } from '@/lib/utils'
import Link from 'next/link'

export const revalidate = 0

interface MonthlyRow {
  period: string
  registrations_count: number
  unique_users: number
  tournaments_with_revenue: number
  gross_revenue_cents: number
  prize_pool_cents: number
  platform_fee_gross_cents: number
  platform_fee_net_cents: number
  platform_fee_iva_cents: number
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const params = await searchParams
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('monthly_platform_finance')
    .select('*')
    .order('period', { ascending: false })

  const rows = (data ?? []) as MonthlyRow[]
  const selectedPeriod = params.period ?? rows[0]?.period
  const selected = rows.find((r) => r.period === selectedPeriod)

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reportes financieros</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Comisión de plataforma por mes (modelo entry_pool). Para declaración
            mensual del SII (F29): IVA débito = 19% del fee bruto.
          </p>
        </div>
        {rows.length > 0 && (
          <a
            href="/api/admin/reports/finance.csv"
            className="text-sm border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
          >
            ↓ Exportar CSV
          </a>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aún no hay inscripciones con modelo entry_pool registradas.
        </p>
      ) : (
        <>
          {/* Selector de mes */}
          <div className="flex flex-wrap gap-2">
            {rows.map((r) => (
              <Link
                key={r.period}
                href={`/admin/reports?period=${r.period}`}
                className={`text-sm px-3 py-1.5 rounded-lg border ${
                  selectedPeriod === r.period
                    ? 'bg-foreground text-background'
                    : 'hover:bg-muted'
                }`}
              >
                {r.period}
              </Link>
            ))}
          </div>

          {/* Tarjetas del mes seleccionado */}
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card label="Inscripciones" value={selected.registrations_count.toLocaleString('es-CL')} sub={`${selected.unique_users} usuarios únicos · ${selected.tournaments_with_revenue} torneos`} />
                <Card label="Recaudado bruto" value={formatCLP(selected.gross_revenue_cents)} sub="Total cuotas cobradas" />
                <Card label="Pozo de premios" value={formatCLP(selected.prize_pool_cents)} sub="Aporte a premios (no es ingreso)" />
              </div>

              <div className="border rounded-xl p-4 space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Comisión de plataforma · base SII F29
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Fee bruto (IVA incl.)</p>
                    <p className="text-2xl font-bold">{formatCLP(selected.platform_fee_gross_cents)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Base imponible (neto)</p>
                    <p className="text-2xl font-bold text-green-700">{formatCLP(selected.platform_fee_net_cents)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">IVA débito (19%)</p>
                    <p className="text-2xl font-bold text-amber-700">{formatCLP(selected.platform_fee_iva_cents)}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground border-t pt-2">
                  Verificación: neto + IVA = {formatCLP(selected.platform_fee_net_cents + selected.platform_fee_iva_cents)}
                  {selected.platform_fee_net_cents + selected.platform_fee_iva_cents === selected.platform_fee_gross_cents
                    ? ' ✓'
                    : ' ✗ (revisar diferencia de redondeo)'}
                </p>
              </div>
            </div>
          )}

          {/* Histórico */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Histórico
            </h2>
            <div className="border rounded-xl overflow-hidden">
              <div className="grid grid-cols-[80px_repeat(5,1fr)] gap-3 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wide bg-muted/40">
                <span>Periodo</span>
                <span className="text-right">Inscripc.</span>
                <span className="text-right">Bruto</span>
                <span className="text-right">Neto</span>
                <span className="text-right">IVA</span>
                <span className="text-right">Pozo</span>
              </div>
              {rows.map((r) => (
                <div
                  key={r.period}
                  className="grid grid-cols-[80px_repeat(5,1fr)] gap-3 px-4 py-3 items-center text-sm border-t"
                >
                  <span className="font-mono">{r.period}</span>
                  <span className="text-right">{r.registrations_count.toLocaleString('es-CL')}</span>
                  <span className="text-right">{formatCLP(r.gross_revenue_cents)}</span>
                  <span className="text-right text-green-700 font-medium">{formatCLP(r.platform_fee_net_cents)}</span>
                  <span className="text-right text-amber-700">{formatCLP(r.platform_fee_iva_cents)}</span>
                  <span className="text-right text-muted-foreground">{formatCLP(r.prize_pool_cents)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded-xl p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}
