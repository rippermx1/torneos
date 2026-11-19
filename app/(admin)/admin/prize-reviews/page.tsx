import { createAdminClient } from '@/lib/supabase/server'
import { loadPrizeEvidence } from '@/lib/payouts/review'
import { PrizeReviewActions } from '@/components/admin/prize-review-actions'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'

export default async function PrizeReviewsPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const filters = await searchParams
  const page = Math.max(1, Math.min(100000, Number.parseInt(filters.page ?? '1') || 1))
  const approved = filters.status === 'approved'
  const pageLink = (n: number) => `/admin/prize-reviews?page=${n}&status=${approved ? 'approved' : 'pending'}`
  const admin = createAdminClient()
  const { data: reviews, error } = await admin.from('prize_reviews').select('*').in('status', approved ? ['approved'] : ['pending', 'held']).order('created_at', { ascending: true }).order('id', { ascending: true }).range((page - 1) * 20, page * 20 - 1)
  if (error) return <p role="alert">No se pudo cargar la cola de revisión. Los premios permanecen retenidos.</p>
  const items = await Promise.all((reviews ?? []).map(async r => {
    const [{ data: profile }, { data: holds }, { data: events }, evidence] = await Promise.all([
      admin.from('profiles').select('username, kyc_status, is_banned').eq('id', r.user_id).single(),
      admin.from('financial_holds').select('id, reason').eq('user_id', r.user_id).is('released_at', null),
      admin.from('financial_review_events').select('action, actor_id, reason, created_at').eq('target_id', r.id).order('created_at', { ascending: false }).limit(5),
      loadPrizeEvidence(admin, r.tournament_id, r.user_id).catch(() => null),
    ])
    return { r, profile, holds, events, evidence }
  }))
  return <div className="space-y-5 max-w-4xl">
    <h1 className="text-2xl font-bold">Revisión y retención de premios</h1>
    <p className="text-sm text-muted-foreground">Todos los premios reales requieren aprobación humana. Últimos 50 premios; las retenciones permanecen aunque el caso deje de mostrarse aquí.</p>
    <nav className="flex gap-4 text-sm"><a className="underline" href="/admin/prize-reviews">Pendientes y retenidos</a><a className="underline" href="/admin/prize-reviews?status=approved">Aprobados</a></nav>
    {items.map(({ r, profile, holds, events, evidence }) => <article key={r.id} className="border rounded-xl p-4 space-y-3">
      <h2 className="font-semibold">{profile?.username ?? r.user_id} · {formatCLP(r.amount_cents)} · {r.status === 'approved' ? 'Aprobado' : r.status === 'held' ? 'Retenido' : 'Pendiente'}</h2>
      <p className="text-sm">KYC: {profile?.kyc_status ?? 'Sin datos'} · Cuenta: {profile?.is_banned ? 'Suspendida' : 'Activa'} · {r.reason}</p>
      {evidence ? <div className="text-sm space-y-1">
        {evidence.games.map(g => <p key={g.id}><a className="underline" href={`/admin/tournaments/${r.tournament_id}/games/${g.id}`}>Abrir partida</a> · {g.moveCount} movimientos · {g.finalScore} puntos</p>)}
        {evidence.flags.length ? evidence.flags.map(f => <p key={f.code}>{f.code}: {f.detail}</p>) : <p>Sin señales heurísticas. Revisión manual requerida.</p>}
      </div> : <p className="text-amber-700 text-sm">Evidencia incompleta: aprobación bloqueada.</p>}
      <a href="/admin/disputes" className="underline text-sm">Revisar disputas</a>
      <PrizeReviewActions reviewId={r.id} userId={r.user_id} activeHolds={holds ?? []} />
      <details className="text-xs"><summary>Últimas decisiones registradas</summary>{(events ?? []).map((e, i) => <p key={i}>{formatDateTimeCL(e.created_at)} · {e.action} · {e.actor_id ?? 'Sistema'} · {e.reason}</p>)}</details>
    </article>)}
    <nav className="flex gap-4 text-sm">{page > 1 && <a className="underline" href={pageLink(page - 1)}>Anterior</a>}{items.length === 20 && <a className="underline" href={pageLink(page + 1)}>Siguiente</a>}</nav>
    {items.length === 0 && <p>No hay premios para revisar.</p>}
  </div>
}
