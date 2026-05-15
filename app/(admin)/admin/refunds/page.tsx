import { createAdminClient } from '@/lib/supabase/server'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'
import Link from 'next/link'
import { RefundRetryButton } from '@/components/admin/refund-retry-button'
import type { FlowRefundAttempt, FlowRefundStatus } from '@/types/database'

export const revalidate = 0

const STATUS_LABEL: Record<FlowRefundStatus, string> = {
  pending: 'Pendiente',
  completed: 'Acreditado',
  rejected: 'Fallido',
  cancelled: 'Cancelado',
}

const STATUS_TONE: Record<FlowRefundStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-700',
}

const ALL_STATUSES: FlowRefundStatus[] = ['pending', 'completed', 'rejected', 'cancelled']

export default async function AdminRefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const filterStatus = ALL_STATUSES.includes(params.status as FlowRefundStatus)
    ? (params.status as FlowRefundStatus)
    : null

  const supabase = createAdminClient()

  // Conteos por estado para los chips de filtro
  const { data: countRows } = await supabase
    .from('flow_refund_attempts')
    .select('status')
  const counts: Record<FlowRefundStatus, number> = { pending: 0, completed: 0, rejected: 0, cancelled: 0 }
  for (const r of (countRows ?? []) as { status: FlowRefundStatus }[]) {
    counts[r.status] = (counts[r.status] ?? 0) + 1
  }

  // Intentos paginados
  let query = supabase
    .from('flow_refund_attempts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(150)
  if (filterStatus) query = query.eq('status', filterStatus)

  const { data } = await query
  const attempts = (data ?? []) as FlowRefundAttempt[]

  // Nombres de torneos referenciados
  const tournamentIds = [...new Set(attempts.map((a) => a.tournament_id))]
  const { data: tournaments } = tournamentIds.length
    ? await supabase.from('tournaments').select('id, name').in('id', tournamentIds)
    : { data: [] }
  const tournamentNameMap = Object.fromEntries(
    (tournaments ?? []).map((t: { id: string; name: string }) => [t.id, t.name])
  )

  // Usernames para mostrar en lugar de UUIDs
  const userIds = [...new Set(attempts.map((a) => a.user_id))]
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, username').in('id', userIds)
    : { data: [] }
  const usernameMap = Object.fromEntries(
    (profiles ?? []).map((p: { id: string; username: string }) => [p.id, p.username])
  )

  const pendingCount = counts.pending
  const rejectedCount = counts.rejected

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Reembolsos Flow</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Reversas emitidas al cancelar torneos. Usa &ldquo;Reintentar&rdquo; en los fallidos.
          El cron reconcilia pendientes cada 10 minutos.
        </p>
      </div>

      {(pendingCount > 0 || rejectedCount > 0) && (
        <div className="flex gap-3 flex-wrap">
          {rejectedCount > 0 && (
            <div className="text-sm px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700">
              ⚠ {rejectedCount} reembolso{rejectedCount !== 1 ? 's' : ''} fallido{rejectedCount !== 1 ? 's' : ''} — requieren reintento manual
            </div>
          )}
          {pendingCount > 0 && (
            <div className="text-sm px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
              {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''} — esperando confirmación de Flow
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/admin/refunds"
          className={`px-3 py-1.5 rounded-lg border ${!filterStatus ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
        >
          Todos
        </Link>
        {ALL_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/refunds?status=${s}`}
            className={`px-3 py-1.5 rounded-lg border ${filterStatus === s ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
          >
            {STATUS_LABEL[s]}{' '}
            <span className="text-xs text-muted-foreground">({counts[s] ?? 0})</span>
          </Link>
        ))}
      </div>

      {attempts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No hay reembolsos con este filtro.
        </p>
      ) : (
        <div className="border rounded-xl divide-y overflow-hidden">
          {attempts.map((a) => (
            <div key={a.id} className="px-4 py-3 grid grid-cols-[auto_1fr_auto] gap-4 items-start">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap mt-0.5 ${STATUS_TONE[a.status]}`}>
                {STATUS_LABEL[a.status]}
              </span>

              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <Link
                    href={`/admin/users/${a.user_id}/wallet`}
                    className="font-medium hover:underline"
                  >
                    {usernameMap[a.user_id] ?? a.user_id.slice(0, 8)}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {tournamentNameMap[a.tournament_id] ?? a.tournament_id.slice(0, 8)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Monto: <span className="text-foreground">{formatCLP(a.amount_cents)}</span>
                  {' · '}
                  Email: <span className="text-foreground">{a.receiver_email}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Creado: {formatDateTimeCL(a.created_at)}
                  {a.settled_at ? ` · Resuelto: ${formatDateTimeCL(a.settled_at)}` : ''}
                </p>
                {a.error_message && (
                  <p className="text-xs text-red-600 font-mono truncate max-w-md" title={a.error_message}>
                    {a.error_message}
                  </p>
                )}
              </div>

              <div className="text-right shrink-0">
                {a.status === 'rejected' && (
                  <RefundRetryButton refundId={a.id} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
