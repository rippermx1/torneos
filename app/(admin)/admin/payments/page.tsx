import { createAdminClient } from '@/lib/supabase/server'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'
import Link from 'next/link'
import type { FlowAttemptStatus, FlowPaymentAttempt } from '@/types/database'
import { FlowReverifyButton } from '@/components/admin/flow-reverify-button'

export const revalidate = 0

const STATUS_LABEL: Record<FlowAttemptStatus, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
}

const STATUS_TONE: Record<FlowAttemptStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-700',
  expired: 'bg-slate-100 text-slate-700',
}

const ALL_STATUSES: FlowAttemptStatus[] = ['pending', 'paid', 'rejected', 'cancelled', 'expired']

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const filterStatus = ALL_STATUSES.includes(params.status as FlowAttemptStatus)
    ? (params.status as FlowAttemptStatus)
    : null

  const supabase = createAdminClient()

  let query = supabase
    .from('flow_payment_attempts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(150)
  if (filterStatus) query = query.eq('status', filterStatus)

  const { data } = await query
  const attempts = (data ?? []) as FlowPaymentAttempt[]

  const userIds = [...new Set(attempts.map((a) => a.user_id))]
  const { data: profiles } = userIds.length > 0
    ? await supabase.from('profiles').select('id, username').in('id', userIds)
    : { data: [] }
  const usernameMap = Object.fromEntries(
    (profiles ?? []).map((p: { id: string; username: string }) => [p.id, p.username])
  )

  // Conteos por estado para los chips
  const counts: Record<FlowAttemptStatus, number> = {
    pending: 0, paid: 0, rejected: 0, cancelled: 0, expired: 0,
  }
  const { data: countRows } = await supabase
    .from('flow_payment_attempts')
    .select('status')
  for (const r of (countRows ?? []) as { status: FlowAttemptStatus }[]) {
    counts[r.status] = (counts[r.status] ?? 0) + 1
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Pagos Flow</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Bitácora de intentos de pago. El cron `flow-reconcile` corre cada 10 minutos;
          usa &ldquo;Reverificar&rdquo; para forzar la consulta a Flow ahora.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/admin/payments"
          className={`px-3 py-1.5 rounded-lg border ${!filterStatus ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
        >
          Todos
        </Link>
        {ALL_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/payments?status=${s}`}
            className={`px-3 py-1.5 rounded-lg border ${filterStatus === s ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
          >
            {STATUS_LABEL[s]} <span className="text-xs text-muted-foreground">({counts[s] ?? 0})</span>
          </Link>
        ))}
      </div>

      {attempts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No hay intentos de pago con este filtro.
        </p>
      ) : (
        <div className="border rounded-xl divide-y overflow-hidden">
          {attempts.map((a) => (
            <div key={a.id} className="px-4 py-3 grid grid-cols-[auto_1fr_auto] gap-4 items-start">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_TONE[a.status]}`}>
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
                    Order: {a.commerce_order}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cobrado: <span className="text-foreground">{formatCLP(a.charged_amount_cents)}</span>
                  {' · '}
                  Acreditable: <span className="text-foreground">{formatCLP(a.net_amount_cents)}</span>
                  {' · '}
                  Fee usuario: <span className="text-foreground">{formatCLP(a.user_fee_cents)}</span>
                  {a.payment_method ? (
                    <>
                      {' · '}
                      Medio: <span className="text-foreground">{a.payment_method}</span>
                    </>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Creado: {formatDateTimeCL(a.created_at)}
                  {a.settled_at ? ` · Resuelto: ${formatDateTimeCL(a.settled_at)}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0 space-y-2">
                {a.status === 'pending' && a.flow_token && (
                  <FlowReverifyButton attemptId={a.id} token={a.flow_token} />
                )}
                {a.status === 'pending' && !a.flow_token && (
                  <span className="text-xs text-muted-foreground">Sin token</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
