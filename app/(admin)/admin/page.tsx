import Link from 'next/link'
import { loadAdminHealthDashboard, type AdminHealthLevel } from '@/lib/admin/health'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'

export const revalidate = 0

const LEVEL_COPY: Record<AdminHealthLevel, { title: string; detail: string; tone: string; dot: string }> = {
  healthy: {
    title: 'Operación saludable',
    detail: 'No hay alertas ni tareas administrativas pendientes.',
    tone: 'border-emerald-200 bg-emerald-50/70 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100',
    dot: 'bg-emerald-500',
  },
  attention: {
    title: 'Hay tareas pendientes',
    detail: 'El producto está operativo, pero hay trabajo administrativo por resolver.',
    tone: 'border-amber-200 bg-amber-50/70 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100',
    dot: 'bg-amber-500',
  },
  critical: {
    title: 'Requiere acción inmediata',
    detail: 'Se detectó un riesgo operativo o faltan datos para confirmar la salud del producto.',
    tone: 'border-red-200 bg-red-50/70 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100',
    dot: 'bg-red-500',
  },
}

function formatAge(isoDate: string | null, nowIso: string): string {
  if (!isoDate) return 'Sin ejecuciones'
  const minutes = Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(isoDate).getTime()) / 60_000))
  if (minutes < 1) return 'Hace menos de un minuto'
  if (minutes < 60) return `Hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Hace ${hours} h`
  return `Hace ${Math.floor(hours / 24)} d`
}

export default async function AdminIndexPage() {
  const dashboard = await loadAdminHealthDashboard()
  const levelCopy = LEVEL_COPY[dashboard.level]
  const coveragePercent = dashboard.liability
    ? Math.round(dashboard.liability.coverage * 100)
    : null

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resumen operativo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estado del producto, tareas pendientes y exposición financiera en un solo lugar.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Actualizado {formatDateTimeCL(dashboard.generatedAt)}
        </p>
      </div>

      <section className={`rounded-2xl border p-5 ${levelCopy.tone}`} aria-labelledby="operation-status">
        <div className="flex items-start gap-3">
          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${levelCopy.dot}`} aria-hidden="true" />
          <div>
            <h2 id="operation-status" className="font-semibold">{levelCopy.title}</h2>
            <p className="mt-1 text-sm opacity-80">{levelCopy.detail}</p>
          </div>
        </div>
      </section>

      {dashboard.issues.length > 0 && (
        <section className="space-y-3" aria-labelledby="pending-actions">
          <div className="flex items-center justify-between gap-3">
            <h2 id="pending-actions" className="text-lg font-semibold">Acciones requeridas</h2>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
              {dashboard.issues.length}
            </span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {dashboard.issues.map((issue) => (
              <Link
                key={`${issue.level}-${issue.title}-${issue.href}`}
                href={issue.href}
                className={`rounded-xl border p-4 transition-colors hover:bg-muted/40 ${
                  issue.level === 'critical'
                    ? 'border-red-200 dark:border-red-900'
                    : 'border-amber-200 dark:border-amber-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{issue.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{issue.detail}</p>
                  </div>
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${issue.level === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`}
                    aria-hidden="true"
                  />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="business-activity">
        <h2 id="business-activity" className="text-lg font-semibold">Actividad del producto</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Cuentas totales (incluye técnicas)', value: dashboard.metrics.accounts },
            { label: 'Inscripciones en 7 días', value: dashboard.metrics.registrationsLast7Days },
            { label: 'Torneos activos o próximos', value: dashboard.metrics.activeTournaments },
          ].map((metric) => (
            <div key={metric.label} className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{metric.value ?? '—'}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="work-queues">
        <h2 id="work-queues" className="text-lg font-semibold">Colas de trabajo</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {dashboard.queues.map((queue) => (
            <Link
              key={queue.key}
              href={queue.href}
              className="rounded-xl border p-4 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium leading-snug">{queue.label}</p>
                <span className={`text-xl font-bold tabular-nums ${queue.count === null ? 'text-red-600' : ''}`}>
                  {queue.count ?? '—'}
                </span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {queue.count === null
                  ? 'No se pudo verificar'
                  : queue.count === 0
                    ? 'Sin pendientes'
                    : `Más antiguo: ${formatAge(queue.oldestAt, dashboard.generatedAt)}`}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="space-y-3" aria-labelledby="financial-exposure">
          <div className="flex items-center justify-between gap-3">
            <h2 id="financial-exposure" className="text-lg font-semibold">Exposición financiera</h2>
            <Link href="/admin/reports" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
              Ver reportes
            </Link>
          </div>
          <div className="rounded-xl border p-5">
            {dashboard.liability ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Cobertura de premios comprometidos</p>
                    <p className={`mt-1 text-2xl font-bold ${dashboard.liability.coverage < 1 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
                      {coveragePercent}%
                    </p>
                  </div>
                  <p className="text-right text-xs text-muted-foreground">
                    {dashboard.liability.activeCount} activos<br />
                    {dashboard.liability.pendingCount} pendientes
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Recaudado</p>
                    <p className="mt-1 font-semibold">{formatCLP(dashboard.liability.collectedCents)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Comprometido</p>
                    <p className="mt-1 font-semibold">{formatCLP(dashboard.liability.committedCents)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pasivo contingente</p>
                    <p className="mt-1 font-semibold">{formatCLP(dashboard.liability.contingentCents)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fee neto acumulado</p>
                    <p className="mt-1 font-semibold">{formatCLP(dashboard.liability.platformFeeNetCents)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-red-600">No fue posible verificar la exposición financiera.</p>
            )}
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="automations">
          <h2 id="automations" className="text-lg font-semibold">Automatizaciones</h2>
          <div className="divide-y rounded-xl border">
            {dashboard.cronJobs.length > 0 ? dashboard.cronJobs.map((cron) => (
              <div key={cron.jobName} className="flex items-center gap-3 p-4">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${cron.state === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{cron.label}</p>
                  <p className="text-xs text-muted-foreground">Cada {cron.cadenceMinutes} min</p>
                </div>
                <p className="shrink-0 text-right text-xs text-muted-foreground">
                  {formatAge(cron.lastRunAt, dashboard.generatedAt)}
                </p>
              </div>
            )) : (
              <p className="p-4 text-sm text-red-600">No fue posible verificar las automatizaciones.</p>
            )}
          </div>
        </section>
      </div>

      <section className="space-y-3" aria-labelledby="quick-actions">
        <h2 id="quick-actions" className="text-lg font-semibold">Accesos rápidos</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { href: '/admin/tournaments/new', label: 'Crear torneo' },
            { href: '/admin/payments', label: 'Revisar pagos' },
            { href: '/admin/reports', label: 'Abrir reportes' },
            { href: '/admin/audit', label: 'Ver bitácora' },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              {action.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
