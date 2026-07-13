import { assessCronHeartbeats, type CronJobHealth } from '@/lib/ops/health'
import { createAdminClient } from '@/lib/supabase/server'
import type { CronHeartbeat } from '@/types/database'

export type AdminHealthLevel = 'healthy' | 'attention' | 'critical'
export type AdminIssueLevel = Exclude<AdminHealthLevel, 'healthy'>

export interface AdminHealthIssue {
  level: AdminIssueLevel
  title: string
  detail: string
  href: string
}

export interface AdminQueueSummary {
  key: string
  label: string
  count: number | null
  oldestAt: string | null
  href: string
}

export interface PrizeLiabilitySummary {
  committedCents: number
  contingentCents: number
  collectedCents: number
  platformFeeNetCents: number
  activeCount: number
  pendingCount: number
  coverage: number
}

export interface AdminHealthDashboard {
  generatedAt: string
  level: AdminHealthLevel
  issues: AdminHealthIssue[]
  cronJobs: CronJobHealth[]
  metrics: {
    accounts: number | null
    registrationsLast7Days: number | null
    activeTournaments: number | null
  }
  queues: AdminQueueSummary[]
  liability: PrizeLiabilitySummary | null
}

interface QueryFailure {
  message: string
}

interface CountResult {
  count: number | null
  error: QueryFailure | null
}

interface QueueResult extends CountResult {
  data: Array<{ created_at: string }> | null
}

function readCount(
  result: CountResult,
  source: string,
  failures: string[]
): number | null {
  if (result.error || result.count === null) {
    failures.push(source)
    console.error(`No se pudo leer ${source} para el resumen administrativo:`, result.error?.message ?? 'conteo ausente')
    return null
  }

  return result.count
}

function readQueue(
  key: string,
  label: string,
  href: string,
  result: QueueResult,
  failures: string[]
): AdminQueueSummary {
  const count = readCount(result, label, failures)

  return {
    key,
    label,
    href,
    count,
    oldestAt: count && count > 0 ? result.data?.[0]?.created_at ?? null : null,
  }
}

function ageMinutes(isoDate: string | null, nowMs: number): number | null {
  if (!isoDate) return null
  const timestamp = new Date(isoDate).getTime()
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.round((nowMs - timestamp) / 60_000))
}

export async function loadAdminHealthDashboard(): Promise<AdminHealthDashboard> {
  const admin = createAdminClient()
  const generatedAt = new Date()
  const sevenDaysAgo = new Date(generatedAt.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    accountsResult,
    registrationsResult,
    tournamentsResult,
    paymentsResult,
    pendingRefundsResult,
    failedRefundsResult,
    withdrawalsResult,
    kycResult,
    disputesResult,
    dteResult,
    liabilityResult,
    heartbeatsResult,
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('registrations').select('*', { count: 'exact', head: true }).gte('registered_at', sevenDaysAgo),
    admin
      .from('tournaments')
      .select('*', { count: 'exact', head: true })
      .in('status', ['scheduled', 'open', 'live', 'finalizing'])
      .eq('is_test', false),
    admin
      .from('flow_payment_attempts')
      .select('created_at', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1),
    admin
      .from('flow_refund_attempts')
      .select('created_at', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1),
    admin
      .from('flow_refund_attempts')
      .select('created_at', { count: 'exact' })
      .eq('status', 'rejected')
      .order('created_at', { ascending: true })
      .limit(1),
    admin
      .from('withdrawal_requests')
      .select('created_at', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1),
    admin
      .from('kyc_submissions')
      .select('created_at', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1),
    admin
      .from('disputes')
      .select('created_at', { count: 'exact' })
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .limit(1),
    admin
      .from('dte_documents')
      .select('created_at', { count: 'exact' })
      .eq('status', 'failed')
      .order('created_at', { ascending: true })
      .limit(1),
    admin.from('prize_liability').select('*').maybeSingle(),
    admin.from('cron_heartbeats').select('job_name, last_run_at, last_status, detail'),
  ])

  const failures: string[] = []
  const metrics = {
    accounts: readCount(accountsResult, 'cuentas', failures),
    registrationsLast7Days: readCount(registrationsResult, 'inscripciones recientes', failures),
    activeTournaments: readCount(tournamentsResult, 'torneos activos', failures),
  }
  const queues = [
    readQueue('payments', 'Pagos pendientes', '/admin/payments?status=pending', paymentsResult, failures),
    readQueue('pending-refunds', 'Reembolsos pendientes', '/admin/refunds?status=pending', pendingRefundsResult, failures),
    readQueue('failed-refunds', 'Reembolsos fallidos', '/admin/refunds?status=rejected', failedRefundsResult, failures),
    readQueue('withdrawals', 'Retiros por revisar', '/admin/payouts', withdrawalsResult, failures),
    readQueue('kyc', 'KYC por revisar', '/admin/users', kycResult, failures),
    readQueue('disputes', 'Disputas abiertas', '/admin/disputes', disputesResult, failures),
    readQueue('dte', 'Documentos tributarios fallidos', '/admin/reports', dteResult, failures),
  ]

  if (liabilityResult.error) {
    failures.push('exposición financiera')
    console.error('No se pudo leer la exposición financiera para el resumen administrativo:', liabilityResult.error.message)
  }
  if (heartbeatsResult.error) {
    failures.push('automatizaciones')
    console.error('No se pudo leer la salud de automatizaciones para el resumen administrativo:', heartbeatsResult.error.message)
  }

  const liabilityRow = liabilityResult.data
  const committedCents = Number(liabilityRow?.committed_cents ?? 0)
  const liability: PrizeLiabilitySummary | null = liabilityResult.error
    ? null
    : {
        committedCents,
        contingentCents: Number(liabilityRow?.contingent_cents ?? 0),
        collectedCents: Number(liabilityRow?.collected_cents ?? 0),
        platformFeeNetCents: Number(liabilityRow?.platform_fee_net_cents ?? 0),
        activeCount: Number(liabilityRow?.active_count ?? 0),
        pendingCount: Number(liabilityRow?.pending_count ?? 0),
        coverage: committedCents > 0
          ? Number(liabilityRow?.collected_cents ?? 0) / committedCents
          : 1,
      }
  const cronJobs = heartbeatsResult.error
    ? []
    : assessCronHeartbeats((heartbeatsResult.data ?? []) as CronHeartbeat[], generatedAt.getTime())

  const issues: AdminHealthIssue[] = failures.map((source) => ({
    level: 'critical',
    title: `No se pudo verificar: ${source}`,
    detail: 'El panel no tiene datos suficientes para confirmar que esta área está saludable.',
    href: '/admin/audit',
  }))

  for (const cron of cronJobs) {
    if (cron.state !== 'healthy') {
      issues.push({
        level: 'critical',
        title: `${cron.label} requiere revisión`,
        detail: cron.state === 'error'
          ? `La última ejecución terminó con error${cron.detail ? `: ${cron.detail}` : '.'}`
          : cron.state === 'missing'
            ? 'No existe un latido registrado para esta automatización.'
            : `El último latido superó el límite de ${cron.maxAgeMinutes} minutos.`,
        href: '/admin/audit',
      })
    }
  }

  const queueByKey = new Map(queues.map((queue) => [queue.key, queue]))
  const payments = queueByKey.get('payments')
  const pendingRefunds = queueByKey.get('pending-refunds')
  const failedRefunds = queueByKey.get('failed-refunds')
  const failedDte = queueByKey.get('dte')

  if ((failedRefunds?.count ?? 0) > 0) {
    issues.push({
      level: 'critical',
      title: `${failedRefunds?.count} reembolso${failedRefunds?.count === 1 ? '' : 's'} fallido${failedRefunds?.count === 1 ? '' : 's'}`,
      detail: 'Flow rechazó la reversa y requiere intervención manual.',
      href: failedRefunds?.href ?? '/admin/refunds?status=rejected',
    })
  }

  const oldestPaymentAge = ageMinutes(payments?.oldestAt ?? null, generatedAt.getTime())
  if (oldestPaymentAge !== null && oldestPaymentAge > 30) {
    issues.push({
      level: 'attention',
      title: 'Hay pagos pendientes fuera de plazo',
      detail: `El más antiguo lleva ${oldestPaymentAge} minutos sin resolverse.`,
      href: payments?.href ?? '/admin/payments?status=pending',
    })
  }

  const oldestRefundAge = ageMinutes(pendingRefunds?.oldestAt ?? null, generatedAt.getTime())
  if (oldestRefundAge !== null && oldestRefundAge > 30) {
    issues.push({
      level: 'critical',
      title: 'Hay reembolsos pendientes fuera de plazo',
      detail: `El más antiguo lleva ${oldestRefundAge} minutos sin confirmación.`,
      href: pendingRefunds?.href ?? '/admin/refunds?status=pending',
    })
  }

  for (const queue of queues.filter((item) => ['withdrawals', 'kyc', 'disputes'].includes(item.key))) {
    if ((queue.count ?? 0) > 0) {
      issues.push({
        level: 'attention',
        title: `${queue.count} ${queue.label.toLocaleLowerCase('es-CL')}`,
        detail: 'Esta cola requiere revisión del equipo administrativo.',
        href: queue.href,
      })
    }
  }

  if ((failedDte?.count ?? 0) > 0) {
    issues.push({
      level: 'attention',
      title: `${failedDte?.count} documento${failedDte?.count === 1 ? '' : 's'} tributario${failedDte?.count === 1 ? '' : 's'} fallido${failedDte?.count === 1 ? '' : 's'}`,
      detail: 'La emisión tributaria necesita revisión.',
      href: failedDte?.href ?? '/admin/reports',
    })
  }

  if (liability && liability.coverage < 1) {
    issues.push({
      level: 'critical',
      title: 'Cobertura de premios insuficiente',
      detail: 'Los ingresos recaudados no cubren los premios ya comprometidos.',
      href: '/admin/tournaments',
    })
  }

  const level: AdminHealthLevel = issues.some((issue) => issue.level === 'critical')
    ? 'critical'
    : issues.length > 0
      ? 'attention'
      : 'healthy'

  return {
    generatedAt: generatedAt.toISOString(),
    level,
    issues,
    cronJobs,
    metrics,
    queues,
    liability,
  }
}
