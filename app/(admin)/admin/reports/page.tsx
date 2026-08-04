import { buildModeloAAccountingReport, type ReconciliationCheck } from '@/lib/accounting/model-a-report'
import { buildLedgerSnapshot } from '@/lib/accounting/ledger'
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
  const admin = createAdminClient()
  const report = await buildModeloAAccountingReport(admin)
  const rows = report.rows
  const selectedPeriod = params.period ?? rows[0]?.period
  const selected = rows.find((row) => row.period === selectedPeriod)
  const ledger = await buildLedgerSnapshot(admin, selectedPeriod)

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Finanzas y conciliación</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-3xl">
            Comprueba saldos, cobros, premios, retiros y el resultado de la plataforma por período.
            Distingue premios adjudicados, pagos autorizados y transferencias bancarias efectivas.
            El F29 se calcula sobre el total de las inscripciones cobradas y separa las notas de
            crédito. Las estimaciones Flow deben conciliarse con las facturas y el RCV.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/admin/reports/accounting.csv"
            className="text-sm border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
          >
            Descargar contabilidad (.csv)
          </a>
          <a
            href="/api/admin/reports/finance.csv"
            className="text-sm border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
          >
            Descargar split interno (legado)
          </a>
          <a
            href="/api/admin/reports/payouts.csv"
            className="text-sm border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
          >
            Descargar ledger de pagos
          </a>
          <a
            href={`/api/admin/reports/journal.csv${selectedPeriod ? `?period=${selectedPeriod}` : ''}`}
            className="text-sm border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
          >
            Descargar libro diario
          </a>
        </div>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card
          label="Premios por pagar (subledger)"
          value={formatCLP(report.snapshot.prizeSubledgerLiabilityCents)}
          sub={`${report.snapshot.usersWithPrizeMovements} usuarios con movimientos`}
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

      <ReconciliationBanner reconciliation={report.reconciliation} />

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
              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  F29 · ventas afectas y débito fiscal
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card
                    label="Venta bruta afecta"
                    value={formatCLP(selected.f29GrossSalesCents)}
                    sub="Precio final IVA incluido"
                  />
                  <Card
                    label="Venta neta"
                    value={formatCLP(selected.f29NetSalesCents)}
                    sub="Bruto menos IVA"
                  />
                  <Card
                    label="IVA débito neto"
                    value={formatCLP(selected.f29NetIvaDebitCents)}
                    sub={`N/C IVA ${formatCLP(selected.f29CreditNoteIvaCents)}`}
                  />
                  <Card
                    label="Contribución devengada"
                    value={formatCLP(selected.accruedContributionCents)}
                    sub="Venta neta − premios − comisiones"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Antes de otros créditos del RCV: IVA por pagar{' '}
                  {formatCLP(selected.f29IvaPayableBeforeOtherCreditsCents)}. El IVA estimado de
                  Flow no se descuenta hasta contar con su factura.
                </p>
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border rounded-xl p-4 space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Conciliación Flow
                  </h2>
                  <MetricRow label="Cobrado bruto Flow" value={formatCLP(selected.flowChargedGrossCents)} />
                  <MetricRow label="Vouchers confirmados" value={selected.f29VoucherCount.toLocaleString('es-CL')} />
                  <MetricRow label="Monto inscripción" value={formatCLP(selected.flowEntryNetCents)} />
                  <MetricRow label="Fee usuario" value={formatCLP(selected.flowUserFeeCents)} />
                  <MetricRow label="Comisión Flow neta estimada" value={formatCLP(selected.estimatedFlowFeeNetCents)} />
                  <MetricRow label="IVA crédito Flow estimado" value={formatCLP(selected.estimatedFlowFeeIvaCreditCents)} />
                  <MetricRow label="Tarifas de reembolso netas estimadas" value={formatCLP(selected.estimatedRefundFeeNetCents)} />
                  <MetricRow label="Devoluciones sin nota de crédito" value={formatCLP(selected.undocumentedFlowRefundsCents)} tone={selected.undocumentedFlowRefundsCents > 0 ? 'red' : undefined} />
                  <MetricRow label="Pagos pendientes" value={selected.flowPendingCount.toLocaleString('es-CL')} />
                </div>

                <div className="border rounded-xl p-4 space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Torneos y premios
                  </h2>
                  <MetricRow label="Inscripciones" value={selected.registrationsCount.toLocaleString('es-CL')} />
                  <MetricRow label="Usuarios únicos" value={selected.uniqueUsers.toLocaleString('es-CL')} />
                  <MetricRow label="Presupuesto interno de premios" value={formatCLP(selected.prizeFundCents)} />
                  <MetricRow label="Premios acreditados" value={formatCLP(selected.prizeCreditsCents)} />
                  <MetricRow label="Ventas netas después de devoluciones" value={formatCLP(selected.netSalesAfterRefundsCents)} />
                  <MetricRow label="Contribución devengada estimada" value={formatCLP(selected.accruedContributionCents)} tone={selected.accruedContributionCents >= 0 ? 'green' : 'red'} />
                </div>
              </section>

              <section className="border rounded-xl p-4 space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Premios y pagos
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <MetricBlock label="Pasivo subledger cierre" value={formatCLP(selected.closingWalletLiabilityCents)} />
                  <MetricBlock label="Retiros pendientes cierre" value={formatCLP(selected.closingPendingWithdrawalsCents)} />
                  <MetricBlock label="Pagos autorizados" value={formatCLP(selected.withdrawalApprovedCents)} />
                  <MetricBlock label="Transferencias pagadas" value={formatCLP(selected.withdrawalPaidCents)} />
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
                    <Th align="right">Venta bruta</Th>
                    <Th align="right">Premios devengados</Th>
                    <Th align="right">Transferido</Th>
                    <Th align="right">N/C emitidas</Th>
                    <Th align="right">IVA débito neto</Th>
                    <Th align="right">Pasivo premios</Th>
                    <Th align="right">Contribución</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.period} className="border-t">
                      <Td>{row.period}</Td>
                      <Td align="right">{formatCLP(row.f29GrossSalesCents)}</Td>
                      <Td align="right">{formatCLP(row.prizeCreditsCents)}</Td>
                      <Td align="right">{formatCLP(row.withdrawalPaidCents)}</Td>
                      <Td align="right">{formatCLP(row.f29CreditNoteGrossCents)}</Td>
                      <Td align="right">{formatCLP(row.f29NetIvaDebitCents)}</Td>
                      <Td align="right">{formatCLP(row.closingWalletLiabilityCents)}</Td>
                      <Td align="right" tone={row.accruedContributionCents >= 0 ? 'green' : 'red'}>
                        {formatCLP(row.accruedContributionCents)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Balance de comprobación {selectedPeriod ? `· ${selectedPeriod}` : ''}
          </h2>
          <span className={`text-xs ${ledger.balanced ? 'text-green-700' : 'text-red-700'}`}>
            {ledger.balanced ? 'Debe = Haber' : 'Libro desbalanceado'}
          </span>
        </div>
        {ledger.trialBalance.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-xl p-4">Sin asientos para este período.</p>
        ) : (
          <div className="border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <Th>Cuenta</Th>
                  <Th>Nombre</Th>
                  <Th>Estado</Th>
                  <Th align="right">Debe</Th>
                  <Th align="right">Haber</Th>
                  <Th align="right">Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {ledger.trialBalance.map((row) => (
                  <tr key={`${row.period}-${row.account_code}-${row.is_estimate}`} className="border-t">
                    <Td>{row.account_code}</Td>
                    <Td>{row.account_name}</Td>
                    <Td>{row.is_estimate ? 'Estimado' : 'Confirmado'}</Td>
                    <Td align="right">{formatCLP(row.debit_cents)}</Td>
                    <Td align="right">{formatCLP(row.credit_cents)}</Td>
                    <Td align="right">{formatCLP(row.balance_cents)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="border rounded-xl p-4 text-xs text-muted-foreground space-y-1">
        {report.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
    </div>
  )
}

function ReconciliationBanner({ reconciliation }: { reconciliation: ReconciliationCheck }) {
  if (reconciliation.ok) {
    return (
      <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
        Conciliación: invariantes contables OK.
      </div>
    )
  }

  const flags: Array<{ label: string; count: number; samples: string[] }> = [
    {
      label: 'Flow attempts con charged ≠ net + user_fee',
      count: reconciliation.flowAttemptInternalMismatch.count,
      samples: reconciliation.flowAttemptInternalMismatch.sampleIds,
    },
    {
      label: 'Registrations con fee_gross ≠ net + iva',
      count: reconciliation.registrationFeeMismatch.count,
      samples: reconciliation.registrationFeeMismatch.sampleIds,
    },
    {
      label: 'Pagos Flow sin inscripción asociada',
      count: reconciliation.paidAttemptWithoutRegistration.count,
      samples: reconciliation.paidAttemptWithoutRegistration.sampleIds,
    },
    {
      label: 'Usuarios con drift en subledger de premios',
      count: reconciliation.walletLedgerDrift.count,
      samples: reconciliation.walletLedgerDrift.sampleUserIds,
    },
    {
      label: 'Pagos marcados como pagados sin traza completa',
      count: reconciliation.paidPayoutMissingTrace.count,
      samples: reconciliation.paidPayoutMissingTrace.sampleIds,
    },
    {
      label: 'Reembolsos Flow completados sin nota de crédito',
      count: reconciliation.completedRefundMissingCreditNote.count,
      samples: reconciliation.completedRefundMissingCreditNote.sampleIds,
    },
  ].filter((flag) => flag.count > 0)

  return (
    <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 space-y-2">
      <p className="font-semibold">Conciliación: invariantes contables con problemas.</p>
      <ul className="list-disc pl-5 space-y-1">
        {flags.map((flag) => (
          <li key={flag.label}>
            <span className="font-medium">{flag.label}: </span>
            {flag.count}
            {flag.samples.length > 0 && (
              <span className="text-xs text-red-800/80"> · IDs muestra: {flag.samples.join(', ')}</span>
            )}
          </li>
        ))}
      </ul>
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
