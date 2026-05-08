import type { SupabaseClient } from '@supabase/supabase-js'
import { parseDateTimeLocalToIso } from '@/lib/utils'
import { calculateIvaIncludedBreakdown } from '@/lib/tournament/finance'
import type {
  Database,
  FlowPaymentAttempt,
  Registration,
  WalletTransaction,
  WithdrawalRequest,
} from '@/types/database'

const CHILE_TIME_ZONE = 'America/Santiago'
const FLOW_CARD_NEXT_DAY_FEE_BPS = 319
const IVA_BPS = 1900
const BPS = 10000

type AdminSupabase = SupabaseClient<Database>

interface PrizeLiabilityRow {
  committed_cents: number
  contingent_cents: number
  collected_cents: number
  prize_fund_collected_cents: number
  platform_fee_gross_cents: number
  platform_fee_net_cents: number
  platform_fee_iva_cents: number
  active_count: number
  pending_count: number
}

export interface AccountingPeriodRow {
  period: string
  flowPaidCount: number
  flowPendingCount: number
  flowRejectedCount: number
  flowCancelledExpiredCount: number
  flowChargedGrossCents: number
  flowEntryNetCents: number
  flowUserFeeCents: number
  f29GrossSalesCents: number
  f29NetSalesCents: number
  f29IvaDebitCents: number
  estimatedFlowFeeNetCents: number
  estimatedFlowFeeIvaCreditCents: number
  estimatedFlowFeeGrossCents: number
  registrationsCount: number
  uniqueUsers: number
  tournamentsWithRevenue: number
  prizeFundCents: number
  platformFeeGrossCents: number
  platformFeeNetCents: number
  platformFeeIvaCents: number
  prizeCreditsCents: number
  refundsCents: number
  adjustmentsCents: number
  withdrawalTransactionsCents: number
  withdrawalRequestedCents: number
  withdrawalApprovedCents: number
  withdrawalRejectedCents: number
  closingWalletLiabilityCents: number
  closingPendingWithdrawalsCents: number
  accruedOperatingResultCents: number
}

export interface AccountingSnapshot {
  generatedAt: string
  walletLiabilityCents: number
  usersWithWalletBalance: number
  pendingWithdrawalsCount: number
  pendingWithdrawalsCents: number
  prizeLiabilityCommittedCents: number
  prizeLiabilityContingentCents: number
  prizeLiabilityCollectedCents: number
  prizeLiabilityActiveCount: number
  prizeLiabilityPendingCount: number
}

export interface AccountingReport {
  generatedAt: string
  model: 'Modelo A'
  notes: string[]
  rows: AccountingPeriodRow[]
  snapshot: AccountingSnapshot
}

function emptyPeriod(period: string): AccountingPeriodRow {
  return {
    period,
    flowPaidCount: 0,
    flowPendingCount: 0,
    flowRejectedCount: 0,
    flowCancelledExpiredCount: 0,
    flowChargedGrossCents: 0,
    flowEntryNetCents: 0,
    flowUserFeeCents: 0,
    f29GrossSalesCents: 0,
    f29NetSalesCents: 0,
    f29IvaDebitCents: 0,
    estimatedFlowFeeNetCents: 0,
    estimatedFlowFeeIvaCreditCents: 0,
    estimatedFlowFeeGrossCents: 0,
    registrationsCount: 0,
    uniqueUsers: 0,
    tournamentsWithRevenue: 0,
    prizeFundCents: 0,
    platformFeeGrossCents: 0,
    platformFeeNetCents: 0,
    platformFeeIvaCents: 0,
    prizeCreditsCents: 0,
    refundsCents: 0,
    adjustmentsCents: 0,
    withdrawalTransactionsCents: 0,
    withdrawalRequestedCents: 0,
    withdrawalApprovedCents: 0,
    withdrawalRejectedCents: 0,
    closingWalletLiabilityCents: 0,
    closingPendingWithdrawalsCents: 0,
    accruedOperatingResultCents: 0,
  }
}

function periodKey(date: string | null | undefined): string {
  if (!date) return 'sin_fecha'

  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: CHILE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(date))

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return year && month ? `${year}-${month}` : 'sin_fecha'
}

function periodEndMs(period: string): number {
  if (!/^\d{4}-\d{2}$/.test(period)) return Number.POSITIVE_INFINITY

  const [year, month] = period.split('-').map(Number)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const nextMonthStart = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00`

  return Date.parse(parseDateTimeLocalToIso(nextMonthStart, CHILE_TIME_ZONE))
}

function getOrCreatePeriod(map: Map<string, AccountingPeriodRow>, period: string) {
  const existing = map.get(period)
  if (existing) return existing

  const created = emptyPeriod(period)
  map.set(period, created)
  return created
}

async function fetchAll<T>(
  supabase: AdminSupabase,
  table: keyof Database['public']['Tables'],
  select: string
): Promise<T[]> {
  const rows: T[] = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`${String(table)}: ${error.message}`)

    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < pageSize) break
  }

  return rows
}

function addFlowAttempt(row: AccountingPeriodRow, attempt: FlowPaymentAttempt) {
  switch (attempt.status) {
    case 'paid':
      row.flowPaidCount += 1
      row.flowChargedGrossCents += attempt.charged_amount_cents
      row.flowEntryNetCents += attempt.net_amount_cents
      row.flowUserFeeCents += attempt.user_fee_cents
      row.f29GrossSalesCents += attempt.charged_amount_cents
      break
    case 'pending':
      row.flowPendingCount += 1
      break
    case 'rejected':
      row.flowRejectedCount += 1
      break
    case 'cancelled':
    case 'expired':
      row.flowCancelledExpiredCount += 1
      break
  }
}

function addRegistration(
  row: AccountingPeriodRow,
  registration: Registration,
  periodUsers: Map<string, Set<string>>,
  periodTournaments: Map<string, Set<string>>
) {
  row.registrationsCount += 1
  row.prizeFundCents += registration.prize_fund_contribution_cents ?? 0
  row.platformFeeGrossCents += registration.platform_fee_gross_cents ?? 0
  row.platformFeeNetCents += registration.platform_fee_net_cents ?? 0
  row.platformFeeIvaCents += registration.platform_fee_iva_cents ?? 0

  if (!periodUsers.has(row.period)) periodUsers.set(row.period, new Set())
  periodUsers.get(row.period)?.add(registration.user_id)

  if ((registration.entry_fee_cents ?? 0) > 0) {
    if (!periodTournaments.has(row.period)) periodTournaments.set(row.period, new Set())
    periodTournaments.get(row.period)?.add(registration.tournament_id)
  }
}

function addWalletTransaction(row: AccountingPeriodRow, tx: WalletTransaction) {
  if (tx.type === 'prize_credit') row.prizeCreditsCents += tx.amount_cents
  if (tx.type === 'refund') row.refundsCents += tx.amount_cents
  if (tx.type === 'adjustment') row.adjustmentsCents += tx.amount_cents
  if (tx.type === 'withdrawal') row.withdrawalTransactionsCents += tx.amount_cents
}

function addWithdrawal(row: AccountingPeriodRow, withdrawal: WithdrawalRequest) {
  row.withdrawalRequestedCents += withdrawal.amount_cents

  if (withdrawal.status === 'approved') {
    row.withdrawalApprovedCents += withdrawal.amount_cents
  } else if (withdrawal.status === 'rejected') {
    row.withdrawalRejectedCents += withdrawal.amount_cents
  }
}

function finalizePeriod(
  row: AccountingPeriodRow,
  allWalletTransactions: WalletTransaction[],
  allWithdrawals: WithdrawalRequest[]
) {
  const salesBreakdown = calculateIvaIncludedBreakdown(row.f29GrossSalesCents)
  row.f29NetSalesCents = salesBreakdown.netCents
  row.f29IvaDebitCents = salesBreakdown.ivaCents

  row.estimatedFlowFeeNetCents = Math.round(
    (row.flowChargedGrossCents * FLOW_CARD_NEXT_DAY_FEE_BPS) / BPS
  )
  row.estimatedFlowFeeIvaCreditCents = Math.round(
    (row.estimatedFlowFeeNetCents * IVA_BPS) / BPS
  )
  row.estimatedFlowFeeGrossCents =
    row.estimatedFlowFeeNetCents + row.estimatedFlowFeeIvaCreditCents

  const endMs = periodEndMs(row.period)
  const latestBalanceByUser = new Map<string, WalletTransaction>()

  for (const tx of allWalletTransactions) {
    const createdMs = new Date(tx.created_at).getTime()
    if (createdMs >= endMs) continue

    const current = latestBalanceByUser.get(tx.user_id)
    if (!current || createdMs > new Date(current.created_at).getTime()) {
      latestBalanceByUser.set(tx.user_id, tx)
    }
  }

  row.closingWalletLiabilityCents = [...latestBalanceByUser.values()].reduce(
    (total, tx) => total + tx.balance_after_cents,
    0
  )

  row.closingPendingWithdrawalsCents = allWithdrawals
    .filter((withdrawal) => {
      const createdMs = new Date(withdrawal.created_at).getTime()
      if (createdMs >= endMs) return false
      if (withdrawal.status === 'pending') return true
      if (!withdrawal.reviewed_at) return false
      return new Date(withdrawal.reviewed_at).getTime() >= endMs
    })
    .reduce((total, withdrawal) => total + withdrawal.amount_cents, 0)

  row.accruedOperatingResultCents =
    row.f29NetSalesCents - row.prizeCreditsCents - row.estimatedFlowFeeNetCents
}

export async function buildModeloAAccountingReport(
  supabase: AdminSupabase
): Promise<AccountingReport> {
  const [
    flowAttempts,
    registrations,
    walletTransactions,
    withdrawals,
    prizeLiabilityResult,
  ] = await Promise.all([
    fetchAll<FlowPaymentAttempt>(
      supabase,
      'flow_payment_attempts',
      'id, user_id, commerce_order, flow_token, flow_order, net_amount_cents, charged_amount_cents, user_fee_cents, status, flow_status_code, payment_method, payer_email, raw_response, intent, tournament_id, created_at, settled_at'
    ),
    fetchAll<Registration>(
      supabase,
      'registrations',
      'id, tournament_id, user_id, entry_fee_cents, prize_fund_contribution_cents, platform_fee_gross_cents, platform_fee_net_cents, platform_fee_iva_cents, prize_model, accounting_metadata, registered_at'
    ),
    fetchAll<WalletTransaction>(
      supabase,
      'wallet_transactions',
      'id, user_id, type, amount_cents, balance_after_cents, reference_type, reference_id, metadata, created_at'
    ),
    fetchAll<WithdrawalRequest>(
      supabase,
      'withdrawal_requests',
      'id, user_id, amount_cents, status, bank_name, bank_account, account_rut, account_holder, admin_notes, reviewed_by, reviewed_at, created_at'
    ),
    supabase.from('prize_liability').select('*').maybeSingle(),
  ])

  if (prizeLiabilityResult.error) {
    throw new Error(`prize_liability: ${prizeLiabilityResult.error.message}`)
  }

  const periods = new Map<string, AccountingPeriodRow>()
  const periodUsers = new Map<string, Set<string>>()
  const periodTournaments = new Map<string, Set<string>>()

  for (const attempt of flowAttempts) {
    const period = periodKey(attempt.settled_at ?? attempt.created_at)
    addFlowAttempt(getOrCreatePeriod(periods, period), attempt)
  }

  for (const registration of registrations) {
    const period = periodKey(registration.registered_at)
    addRegistration(getOrCreatePeriod(periods, period), registration, periodUsers, periodTournaments)
  }

  for (const tx of walletTransactions) {
    const period = periodKey(tx.created_at)
    addWalletTransaction(getOrCreatePeriod(periods, period), tx)
  }

  for (const withdrawal of withdrawals) {
    const period = periodKey(withdrawal.created_at)
    addWithdrawal(getOrCreatePeriod(periods, period), withdrawal)
  }

  for (const [period, row] of periods) {
    row.uniqueUsers = periodUsers.get(period)?.size ?? 0
    row.tournamentsWithRevenue = periodTournaments.get(period)?.size ?? 0
    finalizePeriod(row, walletTransactions, withdrawals)
  }

  const latestBalanceByUser = new Map<string, WalletTransaction>()
  for (const tx of walletTransactions) {
    const current = latestBalanceByUser.get(tx.user_id)
    if (!current || new Date(tx.created_at) > new Date(current.created_at)) {
      latestBalanceByUser.set(tx.user_id, tx)
    }
  }

  const prizeLiability = (prizeLiabilityResult.data ?? {}) as Partial<PrizeLiabilityRow>
  const pendingWithdrawals = withdrawals.filter((withdrawal) => withdrawal.status === 'pending')
  const generatedAt = new Date().toISOString()

  return {
    generatedAt,
    model: 'Modelo A',
    notes: [
      'Modelo A: el voucher Flow/comprobante de pago electronico es la base del registro de ventas cuando el modelo de emision esta declarado ante SII.',
      'F29: usar f29_venta_afecta_bruta_clp, f29_base_neta_clp e f29_iva_debito_clp; el IVA credito Flow es estimado y debe cuadrarse contra factura del proveedor.',
      'F22/gestion: premios_acreditados_clp y retiros son separados; los premios del torneo son fijos y publicados antes del pago.',
      'Validar criterio tributario final con contador antes de declarar renta anual.',
    ],
    rows: [...periods.values()].sort((left, right) => right.period.localeCompare(left.period)),
    snapshot: {
      generatedAt,
      walletLiabilityCents: [...latestBalanceByUser.values()].reduce(
        (total, tx) => total + tx.balance_after_cents,
        0
      ),
      usersWithWalletBalance: latestBalanceByUser.size,
      pendingWithdrawalsCount: pendingWithdrawals.length,
      pendingWithdrawalsCents: pendingWithdrawals.reduce(
        (total, withdrawal) => total + withdrawal.amount_cents,
        0
      ),
      prizeLiabilityCommittedCents: prizeLiability.committed_cents ?? 0,
      prizeLiabilityContingentCents: prizeLiability.contingent_cents ?? 0,
      prizeLiabilityCollectedCents: prizeLiability.collected_cents ?? 0,
      prizeLiabilityActiveCount: prizeLiability.active_count ?? 0,
      prizeLiabilityPendingCount: prizeLiability.pending_count ?? 0,
    },
  }
}

export function centsToPesos(cents: number) {
  return Math.round(cents / 100)
}

export function accountingReportToCsv(report: AccountingReport): string {
  const headers = [
    'periodo',
    'flow_pagos_pagados',
    'flow_pagos_pendientes',
    'flow_pagos_rechazados',
    'flow_pagos_anulados_expirados',
    'flow_cobrado_bruto_clp',
    'flow_monto_inscripcion_clp',
    'flow_fee_usuario_clp',
    'f29_venta_afecta_bruta_clp',
    'f29_base_neta_clp',
    'f29_iva_debito_clp',
    'flow_comision_neta_estimada_clp',
    'flow_iva_credito_estimado_clp',
    'flow_comision_total_estimada_clp',
    'inscripciones',
    'usuarios_unicos',
    'torneos_con_ingreso',
    'reserva_premios_ref_clp',
    'fee_plataforma_bruto_clp',
    'fee_plataforma_neto_clp',
    'fee_plataforma_iva_clp',
    'premios_acreditados_clp',
    'reembolsos_wallet_clp',
    'ajustes_wallet_clp',
    'retiros_wallet_clp',
    'retiros_solicitados_clp',
    'retiros_aprobados_clp',
    'retiros_rechazados_clp',
    'saldo_wallet_cierre_clp',
    'retiros_pendientes_cierre_clp',
    'resultado_operativo_devengado_est_clp',
  ]

  const lines = [headers.join(',')]

  for (const row of report.rows) {
    lines.push(
      [
        row.period,
        row.flowPaidCount,
        row.flowPendingCount,
        row.flowRejectedCount,
        row.flowCancelledExpiredCount,
        centsToPesos(row.flowChargedGrossCents),
        centsToPesos(row.flowEntryNetCents),
        centsToPesos(row.flowUserFeeCents),
        centsToPesos(row.f29GrossSalesCents),
        centsToPesos(row.f29NetSalesCents),
        centsToPesos(row.f29IvaDebitCents),
        centsToPesos(row.estimatedFlowFeeNetCents),
        centsToPesos(row.estimatedFlowFeeIvaCreditCents),
        centsToPesos(row.estimatedFlowFeeGrossCents),
        row.registrationsCount,
        row.uniqueUsers,
        row.tournamentsWithRevenue,
        centsToPesos(row.prizeFundCents),
        centsToPesos(row.platformFeeGrossCents),
        centsToPesos(row.platformFeeNetCents),
        centsToPesos(row.platformFeeIvaCents),
        centsToPesos(row.prizeCreditsCents),
        centsToPesos(row.refundsCents),
        centsToPesos(row.adjustmentsCents),
        centsToPesos(row.withdrawalTransactionsCents),
        centsToPesos(row.withdrawalRequestedCents),
        centsToPesos(row.withdrawalApprovedCents),
        centsToPesos(row.withdrawalRejectedCents),
        centsToPesos(row.closingWalletLiabilityCents),
        centsToPesos(row.closingPendingWithdrawalsCents),
        centsToPesos(row.accruedOperatingResultCents),
      ].join(',')
    )
  }

  return lines.join('\n')
}
