import Link from 'next/link'
import { requireAdminMfa } from '@/lib/supabase/admin-mfa'
import { createAdminClient } from '@/lib/supabase/server'
import { readCommunity2048Report } from '@/lib/analytics/2048-community'

export const revalidate = 0

export default async function Community2048ReportPage() {
  await requireAdminMfa()
  let report: Awaited<ReturnType<typeof readCommunity2048Report>> | null = null
  try { report = await readCommunity2048Report(createAdminClient()) } catch { /* Preserve unknown rather than presenting zero counts. */ }
  return <div className="max-w-6xl space-y-5">
    <div><h1 className="text-2xl font-bold">Participación en retos de 2048</h1>
      <p className="mt-1 text-sm text-muted-foreground">Últimos 30 retos comunitarios gratuitos sin premio. Conteos confirmados por el servidor.</p></div>
    {!report ? <p role="alert">No se pudo confirmar el informe. Recarga para volver a consultar; no se muestran ceros estimados.</p>
      : <><div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm">
        <caption className="p-3 text-left text-muted-foreground">Participaciones por cuenta y regreso al siguiente reto no cancelado.</caption>
        <thead><tr className="border-b text-left"><th className="p-3">Reto / estado</th><th className="p-3">Inscritos</th><th className="p-3">Inicios</th>
          <th className="p-3">Primer movimiento</th><th className="p-3">Completados</th><th className="p-3">Regreso al siguiente</th></tr></thead>
        <tbody>{report.events.map(event => <tr key={event.tournamentId} className="border-b last:border-0">
          <td className="p-3"><Link className="underline" href={`/tournaments/${event.tournamentId}`}>{event.name}</Link>
            <div className="text-xs text-muted-foreground">{event.status} · {new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.startsAt))}</div></td>
          <td className="p-3">{event.registrations}</td><td className="p-3">{event.starts}</td><td className="p-3">{event.firstMoves}</td><td className="p-3">{event.completed}</td>
          <td className="p-3">{event.status === 'cancelled' ? 'No aplica: cancelado' : event.returnToNext
            ? `${event.returnToNext.returnedAccounts}/${event.returnToNext.eligibleAccounts} · ${event.returnToNext.rate === null ? 'Sin denominador' : `${Math.round(event.returnToNext.rate * 100)}%`}`
            : 'Pendiente de dos retos cerrados'}</td></tr>)}</tbody>
      </table></div>{report.events.length === 0 && <p>Aún no hay retos comunitarios registrados.</p>}
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{report.limitations.map(item => <li key={item}>{item}</li>)}</ul></>}
    <Link href="/admin/reports" className="text-sm underline">Volver a reportes</Link>
  </div>
}
