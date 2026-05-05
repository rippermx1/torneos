import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'

const { loadEnvConfig } = nextEnv
const __filename = fileURLToPath(import.meta.url)
const rootDir = path.resolve(path.dirname(__filename), '..')
loadEnvConfig(rootDir)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const outputDir = process.env.BUSINESS_REPORT_OUTPUT_DIR ?? path.join(rootDir, 'artifacts')

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})

const BPS = 10000
const IVA_BPS = 1900
const FLOW_NEXT_DAY_FEE_BPS = 319
const IVA_MULTIPLIER_BPS = BPS + IVA_BPS
const FLOW_EFFECTIVE_COST_BPS = Math.ceil((FLOW_NEXT_DAY_FEE_BPS * IVA_MULTIPLIER_BPS) / BPS)
const FLOW_NET_BPS = BPS - FLOW_EFFECTIVE_COST_BPS
const DEFAULT_PRIZE_POOL_BPS = 8500

function requiredRevenueCents(prizeCents) {
  if (prizeCents <= 0) return 0
  return Math.ceil((prizeCents * IVA_MULTIPLIER_BPS) / FLOW_NET_BPS)
}

function ivaIncludedBreakdown(grossCents) {
  const ivaCents = Math.round((grossCents * IVA_BPS) / IVA_MULTIPLIER_BPS)
  return {
    netCents: grossCents - ivaCents,
    ivaCents,
  }
}

function formatCLP(cents) {
  return `$${Math.round(cents / 100).toLocaleString('es-CL')}`
}

function sum(rows, selector) {
  return rows.reduce((total, row) => total + selector(row), 0)
}

async function main() {
  const [
    tournamentsResult,
    walletResult,
    flowAttemptsResult,
    withdrawalsResult,
  ] = await Promise.all([
    supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('wallet_transactions')
      .select('user_id, type, amount_cents, balance_after_cents, reference_type, reference_id, created_at')
      .order('created_at', { ascending: true })
      .limit(10000),
    supabase
      .from('flow_payment_attempts')
      .select('status, net_amount_cents, charged_amount_cents, user_fee_cents, created_at')
      .order('created_at', { ascending: false })
      .limit(10000),
    supabase
      .from('withdrawal_requests')
      .select('status, amount_cents, created_at')
      .order('created_at', { ascending: false })
      .limit(10000),
  ])

  for (const result of [tournamentsResult, walletResult, flowAttemptsResult, withdrawalsResult]) {
    if (result.error) throw result.error
  }

  const tournaments = tournamentsResult.data ?? []
  const walletTransactions = walletResult.data ?? []
  const flowAttempts = flowAttemptsResult.data ?? []
  const withdrawals = withdrawalsResult.data ?? []
  const latestBalances = new Map()

  for (const tx of walletTransactions) {
    latestBalances.set(tx.user_id, tx.balance_after_cents)
  }

  const walletLiabilityCents = [...latestBalances.values()].reduce((total, balance) => total + balance, 0)
  const activeStatuses = new Set(['scheduled', 'open', 'live', 'finalizing'])
  const activeTournaments = tournaments.filter((tournament) => activeStatuses.has(tournament.status))

  const activeTournamentRisks = activeTournaments
    .filter((tournament) => tournament.entry_fee_cents > 0)
    .map((tournament) => {
      if (tournament.prize_model === 'entry_pool') {
        const prizePoolBps = tournament.prize_pool_bps ?? DEFAULT_PRIZE_POOL_BPS
        const minRevenueCents = tournament.entry_fee_cents * tournament.min_players
        const prizeCents = Math.round((minRevenueCents * prizePoolBps) / BPS)
        const platformFeeGrossCents = minRevenueCents - prizeCents
        const platformTax = ivaIncludedBreakdown(platformFeeGrossCents)
        const minMarginBps = minRevenueCents > 0
          ? Math.round((platformTax.netCents * BPS) / minRevenueCents)
          : 0

        return {
          id: tournament.id,
          name: tournament.name,
          status: tournament.status,
          prizeModel: 'entry_pool',
          minRevenueCents,
          prizeCents,
          platformFeeGrossCents,
          platformFeeNetCents: platformTax.netCents,
          platformFeeIvaCents: platformTax.ivaCents,
          minProfitCents: platformTax.netCents,
          minMarginBps,
          ok: platformTax.netCents >= 0,
        }
      }

      const prizeCents =
        tournament.prize_1st_cents + tournament.prize_2nd_cents + tournament.prize_3rd_cents
      const minRevenueCents = tournament.entry_fee_cents * tournament.min_players
      const requiredCents = requiredRevenueCents(prizeCents)
      const minProfitCents = minRevenueCents - requiredCents
      const minMarginBps = minRevenueCents > 0
        ? Math.round((minProfitCents * BPS) / minRevenueCents)
        : 0

      return {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        prizeModel: tournament.prize_model ?? 'fixed',
        minRevenueCents,
        prizeCents,
        requiredCents,
        minProfitCents,
        minMarginBps,
        ok: minProfitCents >= 0,
      }
    })

  const paidFlowAttempts = flowAttempts.filter((attempt) => attempt.status === 'paid')
  const pendingWithdrawals = withdrawals.filter((withdrawal) => withdrawal.status === 'pending')

  const byType = Object.fromEntries(
    [...new Set(walletTransactions.map((tx) => tx.type))]
      .sort()
      .map((type) => [
        type,
        {
          count: walletTransactions.filter((tx) => tx.type === type).length,
          amountCents: sum(walletTransactions.filter((tx) => tx.type === type), (tx) => tx.amount_cents),
        },
      ])
  )

  const report = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      ivaRate: '19%',
      flowNextDayFee: '3.19% + IVA',
      flowNetBps: FLOW_NET_BPS,
      entryPoolModel: '85% pozo de premios / 15% fee plataforma IVA incluido',
    },
    wallet: {
      usersWithBalance: latestBalances.size,
      liabilityCents: walletLiabilityCents,
      liability: formatCLP(walletLiabilityCents),
      transactionsByType: byType,
    },
    flow: {
      attemptsByStatus: Object.fromEntries(
        [...new Set(flowAttempts.map((attempt) => attempt.status))]
          .sort()
          .map((status) => [status, flowAttempts.filter((attempt) => attempt.status === status).length])
      ),
      paidNetCents: sum(paidFlowAttempts, (attempt) => attempt.net_amount_cents),
      paidChargedCents: sum(paidFlowAttempts, (attempt) => attempt.charged_amount_cents),
      userFeeCents: sum(paidFlowAttempts, (attempt) => attempt.user_fee_cents),
    },
    withdrawals: {
      pendingCount: pendingWithdrawals.length,
      pendingAmountCents: sum(pendingWithdrawals, (withdrawal) => withdrawal.amount_cents),
      pendingAmount: formatCLP(sum(pendingWithdrawals, (withdrawal) => withdrawal.amount_cents)),
    },
    tournaments: {
      activeCount: activeTournaments.length,
      activePaidCount: activeTournamentRisks.length,
      activeLossRiskCount: activeTournamentRisks.filter((risk) => !risk.ok).length,
      activeMinProfitCents: sum(activeTournamentRisks, (risk) => risk.minProfitCents),
      activeMinProfit: formatCLP(sum(activeTournamentRisks, (risk) => risk.minProfitCents)),
      risks: activeTournamentRisks,
    },
    warnings: [],
    criticalIssues: [],
  }

  if (report.tournaments.activeLossRiskCount > 0) {
    report.criticalIssues.push('Hay torneos pagados activos que no cubren costo contable al minimo.')
  }
  if (report.withdrawals.pendingAmountCents > report.wallet.liabilityCents) {
    report.criticalIssues.push('Los retiros pendientes superan el saldo contable de billeteras.')
  }
  if ((report.flow.attemptsByStatus.pending ?? 0) > 0) {
    report.warnings.push('Hay pagos Flow pendientes; deben resolverse por webhook, reconciliacion o expiracion.')
  }

  await fs.mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `business-report-${Date.now()}.json`)
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2))

  console.log(`Reporte escrito en ${outputPath}`)
  console.log(JSON.stringify({
    walletLiability: report.wallet.liability,
    activeTournaments: report.tournaments.activeCount,
    activeLossRiskCount: report.tournaments.activeLossRiskCount,
    activeMinProfit: report.tournaments.activeMinProfit,
    pendingWithdrawals: report.withdrawals.pendingAmount,
    warnings: report.warnings,
    criticalIssues: report.criticalIssues,
  }, null, 2))

  if (report.criticalIssues.length > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
