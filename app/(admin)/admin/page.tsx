import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  CircleDollarSign,
  CircleHelp,
  Clock3,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  WalletCards,
} from 'lucide-react'
import {
  loadAdminHealthDashboard,
  type AdminHealthLevel,
  type AdminQueueSummary,
} from '@/lib/admin/health'
import { getAdminGuidance, type AdminGuidanceKind } from '@/lib/admin/guidance'
import { formatCLP, formatDateTimeCL } from '@/lib/utils'

export const revalidate = 0

const LEVEL_COPY: Record<AdminHealthLevel, { title: string; detail: string; tone: string; dot: string }> = {
  healthy: {
    title: 'El sistema está funcionando',
    detail: 'Pagos, torneos y procesos automáticos están operando sin alertas.',
    tone: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30',
    dot: 'bg-emerald-500',
  },
  attention: {
    title: 'El sistema está estable, con tareas pendientes',
    detail: 'Puedes seguir operando, pero conviene resolver las solicitudes indicadas hoy.',
    tone: 'border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30',
    dot: 'bg-amber-500',
  },
  critical: {
    title: 'Hay un riesgo que debes revisar ahora',
    detail: 'Antes de continuar con la rutina diaria, abre la alerta prioritaria y resuélvela.',
    tone: 'border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30',
    dot: 'bg-red-500',
  },
}

const GUIDANCE_TONE: Record<AdminGuidanceKind, string> = {
  critical: 'border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100',
  attention: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
  setup: 'border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100',
  healthy: 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
}

const MANUAL_QUEUE_KEYS = ['failed-refunds', 'withdrawals', 'kyc', 'disputes', 'dte']
const AUTOMATIC_QUEUE_KEYS = ['payments', 'pending-refunds']

function formatAge(isoDate: string | null, nowIso: string): string {
  if (!isoDate) return 'Sin ejecuciones'
  const minutes = Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(isoDate).getTime()) / 60_000))
  if (minutes < 1) return 'Hace menos de un minuto'
  if (minutes < 60) return `Hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Hace ${hours} h`
  return `Hace ${Math.floor(hours / 24)} d`
}

function queueTotal(queues: AdminQueueSummary[]): number {
  return queues.reduce((total, queue) => total + (queue.count ?? 0), 0)
}

function QueueCard({ queue, generatedAt }: { queue: AdminQueueSummary; generatedAt: string }) {
  const hasProblem = queue.key === 'failed-refunds' || queue.key === 'dte'
  const hasPending = (queue.count ?? 0) > 0

  return (
    <Link
      href={queue.href}
      className="group flex h-full flex-col rounded-2xl border bg-background p-4 transition-colors hover:border-foreground/30 hover:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold leading-snug">{queue.label}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{queue.description}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${
          queue.count === null
            ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
            : hasPending
              ? hasProblem
                ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
        }`}>
          {queue.count ?? '—'}
        </span>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs">
        <span className={queue.count === null ? 'text-red-600' : 'text-muted-foreground'}>
          {queue.count === null
            ? 'No se pudo comprobar'
            : queue.count === 0
              ? 'Al día · no requiere acción'
              : `Más antiguo: ${formatAge(queue.oldestAt, generatedAt)}`}
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
    </Link>
  )
}

function FinancialMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{detail}</p>
    </div>
  )
}

export default async function AdminIndexPage() {
  const dashboard = await loadAdminHealthDashboard()
  const guidance = getAdminGuidance(dashboard)
  const levelCopy = LEVEL_COPY[dashboard.level]
  const coveragePercent = dashboard.liability
    ? Math.round(dashboard.liability.coverage * 100)
    : null
  const sortedIssues = [...dashboard.issues].sort((left, right) =>
    left.level === right.level ? 0 : left.level === 'critical' ? -1 : 1
  )
  const manualQueues = dashboard.queues.filter((queue) => MANUAL_QUEUE_KEYS.includes(queue.key))
  const automaticQueues = dashboard.queues.filter((queue) => AUTOMATIC_QUEUE_KEYS.includes(queue.key))
  const manualCount = queueTotal(manualQueues)
  const firstManualQueue = manualQueues.find((queue) => (queue.count ?? 0) > 0)
  const activeTournamentCount = dashboard.metrics.activeTournaments ?? 0
  const PriorityIcon = guidance.kind === 'critical'
    ? AlertTriangle
    : guidance.kind === 'attention'
      ? ListChecks
      : guidance.kind === 'setup'
        ? Sparkles
        : CheckCircle2
  const dailySteps = [
    {
      number: 1,
      title: 'Revisa las alertas',
      detail: dashboard.issues.length === 0
        ? 'No hay riesgos ni atrasos detectados.'
        : `${dashboard.issues.length} tema${dashboard.issues.length === 1 ? '' : 's'} necesita${dashboard.issues.length === 1 ? '' : 'n'} atención.`,
      href: sortedIssues[0]?.href ?? '#estado-operativo',
      done: dashboard.issues.length === 0,
    },
    {
      number: 2,
      title: 'Resuelve solicitudes humanas',
      detail: manualCount === 0
        ? 'No hay identidades, retiros, disputas ni errores por resolver.'
        : `${manualCount} elemento${manualCount === 1 ? '' : 's'} espera${manualCount === 1 ? '' : 'n'} una decisión administrativa.`,
      href: firstManualQueue?.href ?? '#solicitudes',
      done: manualCount === 0,
    },
    {
      number: 3,
      title: 'Confirma la programación de torneos',
      detail: activeTournamentCount > 0
        ? `${activeTournamentCount} torneo${activeTournamentCount === 1 ? '' : 's'} activo${activeTournamentCount === 1 ? '' : 's'} o próximo${activeTournamentCount === 1 ? '' : 's'}.`
        : 'No hay torneos públicos programados. Crea uno cuando quieras abrir actividad.',
      href: activeTournamentCount > 0 ? '/admin/tournaments' : '/admin/tournaments/new',
      done: activeTournamentCount > 0,
    },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Centro de operaciones
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Empieza por aquí</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Este resumen te dice qué necesita atención y te lleva a la acción correcta. No necesitas memorizar el producto ni revisar todas las secciones.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          Datos actualizados {formatDateTimeCL(dashboard.generatedAt)}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className={`rounded-3xl border p-6 sm:p-7 ${GUIDANCE_TONE[guidance.kind]}`} aria-labelledby="priority-title">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex max-w-2xl items-start gap-4">
              <span className="rounded-2xl bg-white/70 p-3 shadow-sm dark:bg-black/20">
                <PriorityIcon className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-70">{guidance.eyebrow}</p>
                <h2 id="priority-title" className="mt-2 text-xl font-bold sm:text-2xl">{guidance.title}</h2>
                <p className="mt-2 text-sm leading-relaxed opacity-80">{guidance.detail}</p>
              </div>
            </div>
            <Link
              href={guidance.href}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-85"
            >
              {guidance.actionLabel}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section id="estado-operativo" className={`rounded-3xl border p-6 ${levelCopy.tone}`} aria-labelledby="system-title">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${levelCopy.dot}`} aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Estado técnico</p>
          </div>
          <h2 id="system-title" className="mt-4 text-lg font-semibold">{levelCopy.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{levelCopy.detail}</p>
        </section>
      </div>

      {sortedIssues.length > 0 && (
        <section className="space-y-3" aria-labelledby="pending-actions">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="pending-actions" className="text-xl font-semibold">Alertas y tareas pendientes</h2>
              <p className="mt-1 text-sm text-muted-foreground">Están ordenadas por urgencia. Abre una tarjeta para resolverla.</p>
            </div>
            <span className="rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background">
              {sortedIssues.length}
            </span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {sortedIssues.map((issue) => (
              <Link
                key={`${issue.level}-${issue.title}-${issue.href}`}
                href={issue.href}
                className={`group rounded-2xl border bg-background p-4 transition-colors hover:bg-muted/30 ${
                  issue.level === 'critical' ? 'border-red-300 dark:border-red-900' : 'border-amber-300 dark:border-amber-900'
                }`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${issue.level === 'critical' ? 'text-red-600' : 'text-amber-600'}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold">{issue.title}</p>
                      <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{issue.detail}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section id="guia-inicial" className="scroll-mt-6 space-y-4" aria-labelledby="daily-guide">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Guía para tu turno</p>
          <h2 id="daily-guide" className="mt-1 text-xl font-semibold">Tu rutina diaria en 3 pasos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Si completas estos tres puntos, la operación queda cubierta.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {dailySteps.map((step) => (
            <Link
              key={step.number}
              href={step.href}
              className="group rounded-2xl border bg-background p-5 transition-colors hover:border-foreground/30 hover:bg-muted/30"
            >
              <div className="flex items-center justify-between gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  step.done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-foreground text-background'
                }`}>
                  {step.done ? <Check className="h-4 w-4" aria-label="Completado" /> : step.number}
                </span>
                <span className={`text-xs font-medium ${step.done ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}>
                  {step.done ? 'Listo' : 'Abrir'}
                </span>
              </div>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="business-activity">
        <div>
          <h2 id="business-activity" className="text-xl font-semibold">Actividad del producto</h2>
          <p className="mt-1 text-sm text-muted-foreground">Estas cifras muestran uso real; no determinan por sí solas si el sistema está sano.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              label: 'Jugadores registrados',
              value: dashboard.metrics.playerAccounts,
              detail: 'No incluye cuentas administrativas.',
              icon: UserRound,
            },
            {
              label: 'Inscripciones esta semana',
              value: dashboard.metrics.registrationsLast7Days,
              detail: 'Participaciones creadas en los últimos 7 días.',
              icon: WalletCards,
            },
            {
              label: 'Torneos activos o próximos',
              value: dashboard.metrics.activeTournaments,
              detail: 'Programados, abiertos, en juego o finalizando.',
              icon: Trophy,
            },
          ].map((metric) => {
            const Icon = metric.icon
            return (
              <div key={metric.label} className="rounded-2xl border bg-background p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{metric.label}</p>
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="mt-3 text-3xl font-bold tabular-nums">{metric.value ?? '—'}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{metric.detail}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section id="solicitudes" className="scroll-mt-6 space-y-6" aria-labelledby="manual-work">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="manual-work" className="text-xl font-semibold">Decisiones que dependen de ti</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              manualCount > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
            }`}>
              {manualCount}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Estas áreas necesitan una revisión o decisión humana cuando su contador es mayor que cero.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {manualQueues.map((queue) => (
            <QueueCard key={queue.key} queue={queue} generatedAt={dashboard.generatedAt} />
          ))}
        </div>

        <div>
          <h3 className="font-semibold">Seguimiento automático</h3>
          <p className="mt-1 text-sm text-muted-foreground">Estos procesos suelen resolverse solos. Solo actúa si el resumen genera una alerta.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {automaticQueues.map((queue) => (
            <QueueCard key={queue.key} queue={queue} generatedAt={dashboard.generatedAt} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="space-y-3" aria-labelledby="financial-exposure">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="financial-exposure" className="text-xl font-semibold">Dinero comprometido</h2>
              <p className="mt-1 text-sm text-muted-foreground">Comprueba que lo recaudado puede cubrir los premios ya prometidos.</p>
            </div>
            <Link href="/admin/reports" className="text-xs font-medium hover:underline">Abrir finanzas</Link>
          </div>
          <div className="rounded-2xl border bg-background p-5">
            {dashboard.liability ? (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="rounded-xl bg-muted p-2.5">
                      <CircleDollarSign className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs text-muted-foreground">Cobertura de premios confirmados</p>
                      <p className={`mt-1 text-2xl font-bold ${dashboard.liability.coverage < 1 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {dashboard.liability.committedCents > 0 ? `${coveragePercent}%` : 'Sin exposición'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {dashboard.liability.committedCents > 0
                          ? 'Debe mantenerse en 100% o más.'
                          : 'No existen premios confirmados que cubrir.'}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground sm:text-right">
                    {dashboard.liability.activeCount} torneo{dashboard.liability.activeCount === 1 ? '' : 's'} con premios confirmados<br />
                    {dashboard.liability.pendingCount} torneo{dashboard.liability.pendingCount === 1 ? '' : 's'} próximo{dashboard.liability.pendingCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FinancialMetric label="Dinero recaudado" value={formatCLP(dashboard.liability.collectedCents)} detail="Cobros asociados a torneos activos." />
                  <FinancialMetric label="Premios confirmados" value={formatCLP(dashboard.liability.committedCents)} detail="Monto que ya debes pagar a jugadores." />
                  <FinancialMetric label="Premios de torneos próximos" value={formatCLP(dashboard.liability.contingentCents)} detail="Compromiso posible si esos torneos se activan." />
                  <FinancialMetric label="Ingreso neto de plataforma" value={formatCLP(dashboard.liability.platformFeeNetCents)} detail="Fee neto acumulado registrado por el sistema." />
                </div>
              </div>
            ) : (
              <p className="text-sm text-red-600">No fue posible verificar los compromisos financieros. Revisa los reportes antes de aprobar movimientos.</p>
            )}
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="automations">
          <div>
            <h2 id="automations" className="text-xl font-semibold">Procesos que corren solos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Si todos aparecen funcionando, no necesitas hacer nada.</p>
          </div>
          <div className="divide-y rounded-2xl border bg-background">
            {dashboard.cronJobs.length > 0 ? dashboard.cronJobs.map((cron) => (
              <div key={cron.jobName} className="flex items-center gap-3 p-4">
                <span className={`rounded-xl p-2 ${cron.state === 'healthy' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>
                  <Bot className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{cron.label}</p>
                  <p className="text-xs text-muted-foreground">Se ejecuta cada {cron.cadenceMinutes} min</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-xs font-medium ${cron.state === 'healthy' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600'}`}>
                    {cron.state === 'healthy' ? 'Funcionando' : 'Revisar'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{formatAge(cron.lastRunAt, dashboard.generatedAt)}</p>
                </div>
              </div>
            )) : (
              <p className="p-4 text-sm text-red-600">No fue posible comprobar los procesos automáticos.</p>
            )}
          </div>
        </section>
      </div>

      <section className="space-y-4" aria-labelledby="quick-actions">
        <div>
          <h2 id="quick-actions" className="text-xl font-semibold">Acciones frecuentes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Atajos para las tareas habituales del administrador.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { href: '/admin/tournaments/new', label: 'Crear un torneo', detail: 'Define fechas, cupos, precio y premios.', icon: Trophy },
            { href: '/admin/users', label: 'Revisar identidades', detail: 'Aprueba o rechaza documentos KYC.', icon: UserRound },
            { href: '/admin/payouts', label: 'Aprobar retiros', detail: 'Valida saldo e información bancaria.', icon: WalletCards },
            { href: '/admin/reports', label: 'Abrir finanzas', detail: 'Consulta conciliación y exporta reportes.', icon: CircleDollarSign },
          ].map((action) => {
            const Icon = action.icon
            return (
              <Link key={action.href} href={action.href} className="group rounded-2xl border bg-background p-4 transition-colors hover:border-foreground/30 hover:bg-muted/30">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-xl bg-muted p-2"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </div>
                <p className="mt-4 text-sm font-semibold">{action.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.detail}</p>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="rounded-3xl border bg-background p-5 sm:p-6" aria-labelledby="glossary">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-muted p-2.5"><CircleHelp className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 id="glossary" className="text-xl font-semibold">Palabras que verás en el panel</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ábrelas cuando necesites recordar qué significan.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            {
              term: 'KYC · Verificación de identidad',
              definition: 'Es la revisión del documento, RUT y datos bancarios del jugador. Debe estar aprobada antes de cobrar una inscripción pagada o autorizar un retiro.',
            },
            {
              term: 'Flow · Proveedor de pagos',
              definition: 'Es la empresa externa que procesa cobros y reembolsos. Un pago pendiente no significa necesariamente que falló: primero espera la conciliación automática.',
            },
            {
              term: 'DTE · Documento tributario electrónico',
              definition: 'Es la boleta o nota de crédito que respalda una operación ante el SII. Solo necesitas intervenir cuando aparezca como fallida.',
            },
            {
              term: 'Cobertura de premios',
              definition: 'Compara el dinero recaudado con los premios ya comprometidos. Debe ser 100% o superior. Si no hay premios confirmados, el panel muestra “Sin exposición”.',
            },
          ].map((item) => (
            <details key={item.term} className="group rounded-xl border px-4 py-3 open:bg-muted/30">
              <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
                <span className="flex items-center justify-between gap-3">
                  {item.term}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </span>
              </summary>
              <p className="mt-3 border-t pt-3 text-xs leading-relaxed text-muted-foreground">{item.definition}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
