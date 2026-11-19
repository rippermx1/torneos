import { createAdminClient } from '@/lib/supabase/server'
import { formatDateTimeCL } from '@/lib/utils'
import type { Dispute } from '@/types/database'
import { DisputeResolveForm } from '@/components/admin/dispute-resolve-form'

const TYPE_LABEL: Record<Dispute['type'], string> = {
  payment: 'Pago',
  tournament_result: 'Resultado torneo',
  technical: 'Técnico',
  other: 'Otro',
}
const STATUS_STYLE: Record<Dispute['status'], string> = {
  open: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
  rejected: 'bg-slate-100 text-slate-600',
}

export default async function AdminDisputesPage() {
  const supabase = createAdminClient()

  const [openResult, closedResult] = await Promise.all([
    supabase.from('disputes').select('*').eq('status','open').order('created_at').limit(1000),
    supabase.from('disputes').select('*').neq('status','open').order('created_at',{ascending:false}).limit(100),
  ])
  if (openResult.error || closedResult.error) throw new Error('No se pudo cargar soporte')
  const disputes = [...(openResult.data ?? []), ...(closedResult.data ?? [])] as Dispute[]

  const userIds = [...new Set(disputes.map((d) => d.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', userIds)

  const usernameMap = Object.fromEntries(
    (profiles ?? []).map((p: { id: string; username: string }) => [p.id, p.username])
  )

  const open = disputes.filter((d) => d.status === 'open')
  const closed = disputes.filter((d) => d.status !== 'open')

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Casos de soporte</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {open.length} abierto{open.length !== 1 ? 's' : ''}. Se muestran hasta 1000 abiertos, desde el más antiguo, y 100 cerrados recientes. Lee los antecedentes y deja una resolución clara; cada decisión quedará registrada.
        </p>
      </div>

      {open.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Abiertas</h2>
          {open.map((d) => (
            <div key={d.id} className="border rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{usernameMap[d.user_id] ?? '—'}</span>
                    <span className="text-xs border rounded px-1.5 py-0.5">{TYPE_LABEL[d.type]}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateTimeCL(d.created_at)}</p>
                </div>
              </div>
              <p className="text-sm border rounded-lg p-3 bg-muted/30 whitespace-pre-wrap leading-relaxed">
                {d.description}
              </p>
              <p className="text-xs">Referencia: {d.id} · {d.acknowledged_at ? 'Atención acusada' : 'Sin acuse'}</p>
              <DisputeResolveForm disputeId={d.id} acknowledged={!!d.acknowledged_at} />
            </div>
          ))}
        </section>
      )}

      {closed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Historial</h2>
          <div className="border rounded-xl divide-y overflow-hidden">
            {closed.map((d) => (
              <div key={d.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[d.status]}`}>
                  {d.status === 'resolved' ? 'Resuelto' : 'Rechazado'}
                </span>
                <span className="text-muted-foreground shrink-0">{TYPE_LABEL[d.type]}</span>
                <span className="flex-1 truncate">{usernameMap[d.user_id] ?? '—'}</span>
                <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                  {formatDateTimeCL(d.created_at)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {disputes.length === 0 && (
        <p className="text-muted-foreground text-sm">No hay disputas.</p>
      )}
    </div>
  )
}
