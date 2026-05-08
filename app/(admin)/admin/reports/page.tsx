import { buildModeloAAccountingReport } from '@/lib/accounting/model-a-report'
import { createAdminClient } from '@/lib/supabase/server'
import { formatCLP } from '@/lib/utils'
import Link from 'next/link'

export const revalidate = 0

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const params = await searchParams
  const report = await buildModeloAAccountingReport(createAdminClient())
  const rows = report.rows
  const selectedPeriod = params.period ?? rows[0]?.period
  const selected = rows.find((row) => row.period === selectedPeriod)

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contabilidad Modelo A</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-3xl">
            Reporte mínimo para operación con voucher Flow como boleta electrónica: ventas
            afectas para F29, IVA débito, estimación de comisión Flow, premios, retiros y
            obligaciones de wallet.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/admin/reports/accounting.csv"
            className="text-sm border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
          >
            Exportar contabilidad
          </a>
          <a
            href="/api/admin/reports/finance.csv"
            className="text-sm border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
          >
            CSV fee plataforma
          </a>
        </div>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card
          label="Saldo wallet actual"
          value={formatCLP(report.snapshot.walletLiabilityCents)}
          sub={`${report.snapshot.usersWithWalletBalance} usuarios con saldo`}
        />
        <Card
          label="Retiros pendientes"
          value={formatCLP(report.snapshot.pendingWithdrawalsCents)}
          sub={`${report.snapshot.pendingWithdrawalsCount} solicitudes`}
        />
        <Card
          label="Premios comprometidos"
          value={formatCLP(report.snapshot.prizeLiabilityCommittedCents)}
          sub={`${report.snapshot.prizeLiabilityActiveCount} torneos live/finalizing`}
        />
        <Card
          label="Premios contingentes"
          value={formatCLP(report.snapshot.prizeLiabilityContingentCents)}
          sub={`${report.snapshot.prizeLiabilityPendingCount} torneos scheduled/open`}
        />
      </section>

      {rows.length === 0 ? (
        <div className="border rounded-xl p-5 space-y-2">
          <p className="font-medium">Aún no hay movimientos contables.</p>
          <p className="text-sm text-muted-foreground">
            Cuando existan pagos Flow, inscripciones, premios o retiros, este panel mostrará el
            resumen mensual y el CSV contendrá las columnas para conciliación.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {rows.map((row) => (
              <Link
                key={row.period}
                href={`/admin/reports?period=${row.period}`}
                className={`text-sm px-3 py-1.5 rounded-lg border ${
                  selectedPeriod === row.period
                    ? 'bg-foreground text-background'
                    : 'hover:bg-muted'
                }`}
              >
                {row.period}
              </Link>
            ))}
          </div>

          {selected && (
            <div className="space-y-4">
              <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card
                  label="Venta afecta F29"
                  value={formatCLP(selected.f29GrossSalesCents)}
                  sub={`${selected.flowPaidCount} pagos Flow pagados`}
                />
                <Card
                  label="Base neta F29"
                  value={formatCLP(selected.f29NetSalesCents)}
                  sub="Venta bruta / 1,19"
                />
                <Card
                  label="IVA débito F29"
                  value={formatCLP(selected.f29IvaDebitCents)}
                  sub="Diferencia bruto - neto"
                />
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border rounded-xl p-4 space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Conciliación Flow
                  </h2>
                  <MetricRow label="Cobrado bruto Flow" value={formatCLP(selected.flowChargedGrossCents)} />
                  <MetricRow label="Monto inscripción" value={formatCLP(selected.flowEntryNetCents)} />
                  <MetricRow label="Fee usuario" value={formatCLP(selected.flowUserFeeCents)} />
                  <MetricRow label="Comisión Flow neta estimada" value={formatCLP(selected.estimatedFlowFeeNetCents)} />
                  <MetricRow label="IVA crédito Flow estimado" value={formatCLP(selected.estimatedFlowFeeIvaCreditCents)} />
                  <MetricRow label="Pagos pendientes" value={selected.flowPendingCount.toLocaleString('es-CL')} />
                </div>

                <div className="border rounded-xl p-4 space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Torneos y premios
                  </h2>
                  <MetricRow label="Inscripciones" value={selected.registrationsCount.toLocaleString('es-CL')} />
                  <MetricRow label="Usuarios únicos" value={selected.uniqueUsers.toLocaleString('es-CL')} />
                  <MetricRow label="Reserva premios ref." value={formatCLP(selected.prizeFundCents)} />
                  <MetricRow label="Fee plataforma bruto" value={formatCLP(selected.platformFeeGrossCents)} />
                  <MetricRow label="Premios acreditados" value={formatCLP(selected.prizeCreditsCents)} />
                  <MetricRow label="Resultado devengado estimado" value={formatCLP(selected.accruedOperatingResultCents)} tone={selected.accruedOperatingResultCents >= 0 ? 'green' : 'red'} />
                </div>
              </section>

              <section className="border rounded-xl p-4 space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Wallet y retiros
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <MetricBlock label="Saldo wallet cierre" value={formatCLP(selected.closingWalletLiabilityCents)} />
                  <MetricBlock label="Retiros pendientes cierre" value={formatCLP(selected.closingPendingWithdrawalsCents)} />
                  <MetricBlock label="Retiros aprobados" value={formatCLP(selected.withdrawalApprovedCents)} />
                </div>
              </section>
            </div>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Histórico mensual
            </h2>
            <div className="border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <Th>Periodo</Th>
                    <Th align="right">Venta F29</Th>
                    <Th align="right">Neto</Th>
                    <Th align="right">IVA</Th>
                    <Th align="right">Premios</Th>
                    <Th align="right">Wallet cierre</Th>
                    <Th align="right">Resultado est.</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.period} className="border-t">
                      <Td>{row.period}</Td>
                      <Td align="right">{formatCLP(row.f29GrossSalesCents)}</Td>
                      <Td align="right">{formatCLP(row.f29NetSalesCents)}</Td>
                      <Td align="right">{formatCLP(row.f29IvaDebitCents)}</Td>
                      <Td align="right">{formatCLP(row.prizeCreditsCents)}</Td>
                      <Td align="right">{formatCLP(row.closingWalletLiabilityCents)}</Td>
                      <Td align="right" tone={row.accruedOperatingResultCents >= 0 ? 'green' : 'red'}>
                        {formatCLP(row.accruedOperatingResultCents)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <div className="border rounded-xl p-4 text-xs text-muted-foreground space-y-1">
        {report.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
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

function MetricRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'green' | 'red'
}) {
  const toneClass = tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-700' : ''

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium text-right ${toneClass}`}>{value}</span>
    </div>
  )
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return <th className={`px-4 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>
}

function Td({
  children,
  align = 'left',
  tone,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  tone?: 'green' | 'red'
}) {
  const toneClass = tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-700' : ''
  return <td className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'} ${toneClass}`}>{children}</td>
}
