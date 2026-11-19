import Link from 'next/link'
import { loadOperationalDashboard } from '@/lib/ops/monitor'
import { assessCronHeartbeats } from '@/lib/ops/health'
import { OpsNotificationReview } from '@/components/admin/ops-notification-review'
import { OpsAcknowledgement } from '@/components/admin/ops-acknowledgement'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'

export const revalidate = 0
const date = (value: string | null | undefined) => value ? formatDateTimeCL(value) : 'Sin registro'

export default async function OperationsPage() {
  let data: Awaited<ReturnType<typeof loadOperationalDashboard>>
  try { data = await loadOperationalDashboard() }
  catch { return <div role="alert" className="rounded border border-red-400 p-6"><h1 className="text-2xl font-bold">Comprobación operativa incompleta</h1><p>No se pudieron leer todas las obligaciones y alertas. Recarga y revisa la conexión; los pendientes no se consideran cero.</p></div> }
  const jobs = assessCronHeartbeats(data.snapshot.jobs, Date.parse(data.snapshot.observed_at))
  const watchdogMs = data.watchdog?.last_success_at ? Date.parse(data.watchdog.last_success_at) : NaN
  const monitorStale = !Number.isFinite(watchdogMs) || Date.parse(data.snapshot.observed_at) - watchdogMs >= 15 * 60_000
  return <div className="mx-auto max-w-6xl space-y-8">
    <header><h1 className="text-3xl font-bold">Obligaciones y alertas</h1><p className="mt-2 text-muted-foreground">Comprobado {date(data.snapshot.observed_at)}. Los montos corresponden a cada cola y pueden representar etapas de la misma obligación; no sumarlos como exposición total.</p></header>
    {monitorStale && <div role="alert" className="rounded border border-red-400 p-4">Monitor sin éxito registrado en los últimos 15 minutos. Las alertas guardadas pueden estar desactualizadas. Revisar scheduler y respaldo independiente.</div>}
    <p className="rounded border p-4">Revisa la <Link className="underline" href="/admin/cash">conciliación bancaria y la reserva de caja</Link> antes de admitir nuevos cobros. Los asientos equilibrados requieren respaldo bancario.</p>
    <section><h2 className="mb-3 text-xl font-semibold">Obligaciones pendientes</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.snapshot.queues.map(queue => <Link key={queue.key} href={queue.href} className="rounded border p-4">
      <h3 className="font-semibold">{queue.title}</h3><p>{queue.count} pendientes · {formatCLP(queue.amount_cents)}</p><p className="text-sm text-muted-foreground">Más antiguo: {date(queue.oldest_at)}</p>
    </Link>)}</div></section>
    <section><h2 className="text-xl font-semibold">Integridad contable</h2>{data.snapshot.checks.map(check => <p key={check.key} className={check.count ? 'text-red-700' : ''}><Link href={check.href}>{check.title}: {check.count} · {formatCLP(check.amount_cents)}</Link></p>)}</section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Incidentes activos ({data.incidents.length})</h2><p className="text-sm text-muted-foreground">Acusar atención asigna un responsable. El cierre requiere una comprobación posterior de recuperación; los pagos conservan sus controles.</p>
      {data.incidents.map(incident => <article key={incident.id} className={`rounded border p-4 ${incident.severity === 'critical' ? 'border-red-400' : 'border-amber-400'}`}>
        <h3 className="font-semibold">{incident.severity === 'critical' ? 'Crítico' : 'Atención'}: {incident.title}</h3>
        <p className="text-sm">Detectado {date(incident.first_seen_at)} · Última comprobación {date(incident.last_seen_at)}</p>
        <p className="text-sm">{incident.escalated_at ? `Escalado al suplente ${date(incident.escalated_at)}` : 'Sin escalamiento registrado'}</p>
        {typeof incident.details.href === 'string' && <Link className="underline" href={incident.details.href}>Revisar causa</Link>}
        {incident.acknowledged_at ? <p className="mt-2 text-sm">Atención asumida por {incident.acknowledged_by} · {date(incident.acknowledged_at)} · {incident.acknowledgement_note}</p> : <OpsAcknowledgement id={incident.id} />}
      </article>)}
      {!data.incidents.length && <p>Sin incidentes guardados activos. Comprobar también la fecha del monitor.</p>}
    </section>
    <section className="space-y-2"><h2 className="text-xl font-semibold">Avisos sin aceptación del proveedor</h2><p className="text-sm text-muted-foreground">Hasta 50 avisos más antiguos. Aceptación del proveedor, entrega del correo y atención del operador son estados diferentes. El suplente se configura con un destinatario distinto.</p>
      {data.notifications.map(notification => <article key={notification.id} className="rounded border p-3"><p>{notification.subject} · {{ pending: 'Pendiente', sending: 'Envío en curso', blocked: 'Bloqueado', accepted: 'Aceptado por proveedor', received_manually: 'Recibido por otro canal' }[notification.state]} · {notification.attempts} intentos</p><p className="text-sm text-muted-foreground">{notification.recipient ?? 'Destinatario ausente'} · {date(notification.created_at)} · {notification.last_error}</p><OpsNotificationReview id={notification.id} /></article>)}
      {!data.notifications.length && <p>Sin avisos pendientes de aceptación.</p>}
    </section>
    <section><h2 className="text-xl font-semibold">Últimas aceptaciones y recepciones por otro canal</h2>
      {data.recentNotificationResults.map(notification => <article key={notification.id} className="mt-2 rounded border p-3">
        <p>{notification.subject}</p><p className="text-sm text-muted-foreground">{notification.state === 'accepted' ? `Aceptado por proveedor ${date(notification.accepted_at)} · Referencia ${notification.provider_id}` : `Recepción por otro canal ${date(notification.reviewed_at)} · ${notification.reviewed_by} · ${notification.review_note}`}</p>
      </article>)}
    </section>
    <section><h2 className="text-xl font-semibold">Ejecución y procesamiento</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Proceso</th><th>Último inicio</th><th>Último término</th><th>Último éxito</th><th>Fallos consecutivos</th><th>Último fallo externo</th></tr></thead><tbody>{jobs.map(job => <tr key={job.jobName}><td className="py-2">{job.label} · {job.state}</td><td>{date(job.lastStartedAt)}</td><td>{date(job.lastRunAt)}</td><td>{date(job.lastSuccessAt)}</td><td>{job.consecutiveFailures}</td><td>{date(data.snapshot.jobs.find(row => row.job_name === job.jobName)?.last_dispatch_failure_at)}</td></tr>)}</tbody></table></div></section>
    <section><h2 className="text-xl font-semibold">Últimas recuperaciones</h2>{data.recovered.map(incident => <p key={incident.id}>{incident.title} · {date(incident.resolved_at)}</p>)}</section>
    <section><h2 className="text-xl font-semibold">Últimas acciones registradas</h2>{data.events?.map(event => <p key={event.id} className="text-sm">{date(event.created_at)} · {event.action} · {event.incident_id} · {event.note}</p>)}</section>
  </div>
}
