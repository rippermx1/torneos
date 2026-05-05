import { createAdminClient } from '@/lib/supabase/server'
import { formatDateTimeCL } from '@/lib/utils'
import Link from 'next/link'
import type { AdminAction } from '@/types/database'

export const revalidate = 0

const ACTION_LABEL: Record<string, string> = {
  'payout.approve': 'Aprobó retiro',
  'payout.reject': 'Rechazó retiro',
  'kyc.approve': 'Aprobó KYC',
  'kyc.reject': 'Rechazó KYC',
  'user.ban': 'Baneó usuario',
  'user.unban': 'Desbaneó usuario',
  'dispute.resolved': 'Resolvió disputa',
  'dispute.rejected': 'Rechazó disputa',
  'tournament.finalize': 'Finalizó torneo',
  'tournament.cancel': 'Canceló torneo',
  'flow.reverify': 'Reverificó pago Flow',
}

const TARGET_LABEL: Record<string, string> = {
  withdrawal_request: 'Retiro',
  profile: 'Usuario',
  dispute: 'Disputa',
  tournament: 'Torneo',
  flow_payment_attempt: 'Pago Flow',
}

const ACTION_TONE: Record<string, string> = {
  'payout.approve': 'bg-green-100 text-green-700',
  'kyc.approve': 'bg-green-100 text-green-700',
  'user.unban': 'bg-green-100 text-green-700',
  'dispute.resolved': 'bg-green-100 text-green-700',
  'tournament.finalize': 'bg-blue-100 text-blue-700',
  'payout.reject': 'bg-red-100 text-red-700',
  'kyc.reject': 'bg-red-100 text-red-700',
  'user.ban': 'bg-red-100 text-red-700',
  'dispute.rejected': 'bg-red-100 text-red-700',
  'tournament.cancel': 'bg-red-100 text-red-700',
  'flow.reverify': 'bg-amber-100 text-amber-700',
}

interface PageSearchParams {
  action?: string
  target?: string
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>
}) {
  const params = await searchParams
  const supabase = createAdminClient()

  let query = supabase
    .from('admin_actions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (params.action) query = query.eq('action', params.action)
  if (params.target) query = query.eq('target_type', params.target)

  const { data } = await query
  const actions = (data ?? []) as AdminAction[]

  const adminIds = [...new Set(actions.map((a) => a.admin_id))]
  const { data: admins } = adminIds.length > 0
    ? await supabase.from('profiles').select('id, username').in('id', adminIds)
    : { data: [] }
  const adminMap = Object.fromEntries(
    (admins ?? []).map((p: { id: string; username: string }) => [p.id, p.username])
  )

  const knownActions = Object.keys(ACTION_LABEL)
  const knownTargets = Object.keys(TARGET_LABEL)

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Bitácora administrativa</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Últimas {actions.length} acciones registradas. Inmutable.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap text-sm">
        <Link
          href="/admin/audit"
          className={`px-3 py-1.5 rounded-lg border ${!params.action && !params.target ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
        >
          Todas
        </Link>
        {knownActions.map((a) => (
          <Link
            key={a}
            href={`/admin/audit?action=${encodeURIComponent(a)}`}
            className={`px-3 py-1.5 rounded-lg border ${params.action === a ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
          >
            {ACTION_LABEL[a]}
          </Link>
        ))}
        <span className="border-l mx-1" />
        {knownTargets.map((t) => (
          <Link
            key={t}
            href={`/admin/audit?target=${encodeURIComponent(t)}`}
            className={`px-3 py-1.5 rounded-lg border ${params.target === t ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
          >
            {TARGET_LABEL[t]}
          </Link>
        ))}
      </div>

      {actions.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hay acciones registradas con este filtro.</p>
      ) : (
        <div className="border rounded-xl divide-y overflow-hidden">
          <div className="grid grid-cols-[160px_1fr_auto] gap-3 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wide bg-muted/40">
            <span>Fecha</span>
            <span>Acción</span>
            <span>Admin</span>
          </div>
          {actions.map((a) => {
            const tone = ACTION_TONE[a.action] ?? 'bg-slate-100 text-slate-700'
            return (
              <div key={a.id} className="grid grid-cols-[160px_1fr_auto] gap-3 px-4 py-3 items-start text-sm">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateTimeCL(a.created_at)}
                </span>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tone}`}>
                      {ACTION_LABEL[a.action] ?? a.action}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {TARGET_LABEL[a.target_type] ?? a.target_type}
                      {a.target_id ? ` · ${a.target_id.slice(0, 8)}` : ''}
                    </span>
                  </div>
                  {a.summary && (
                    <p className="text-foreground break-words">{a.summary}</p>
                  )}
                  {Object.keys(a.payload ?? {}).length > 0 && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer hover:text-foreground">payload</summary>
                      <pre className="mt-1 bg-muted/40 rounded-md p-2 overflow-x-auto">
                        {JSON.stringify(a.payload, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
                <span className="text-xs text-right shrink-0">
                  {adminMap[a.admin_id] ?? a.admin_id.slice(0, 8)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
