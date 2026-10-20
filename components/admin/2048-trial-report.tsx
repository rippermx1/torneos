'use client'
import Link from 'next/link'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import type { Trial2048ServerSnapshot } from '@/lib/analytics/2048-trial-server'
import type { Player2048RetentionMetric } from '@/lib/game/player-2048-retention'
import { MAX_2048_TRIAL_LOCAL_BYTES, parse2048TrialLocalExport, type Trial2048LocalMetrics,
  type Trial2048Duration, type Trial2048LoadMetrics } from '@/lib/analytics/2048-trial-local'

const category = (value: string) => value === 'synthetic' ? 'QA sintética' : value === 'demonstration' ? 'Demostración local' : 'Observado en navegador'
const count = (value: number) => value.toLocaleString('es-CL')
const metric = (value: Player2048RetentionMetric) => `${count(value.returnedAccounts)} / ${count(value.eligibleAccounts)} · ${value.rate === null ? 'Sin denominador maduro' : `${(value.rate * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`}`
const safeMetric = (value: Player2048RetentionMetric) => ({ eligibleAccounts: value.eligibleAccounts, returnedAccounts: value.returnedAccounts, rate: value.rate })
const pendingEvidence = ['Segunda partida orgánica frente a reinicio con recordatorio o ayuda: atribución no confirmada.',
  'Personas únicas, interés declarado en ticket y avisos consentidos: no medidos por estas vistas locales.',
  'Horas de convocatoria y operación, costos, soporte y reclamos: pendientes de registro operativo.',
  'Ensayo con jugadores reales y cohortes maduras: pendiente de evidencia propia, separado de QA.']

const safeDuration = (value: Trial2048Duration) => ({ samples: value.samples, meanMs: value.meanMs, minMs: value.minMs, maxMs: value.maxMs })
function safeLoadDiagnostics(value: Trial2048LoadMetrics | null | undefined) {
  if (!value) return null
  const milestone = (row: NonNullable<Trial2048LoadMetrics['milestones']>['firstValidMove']) => ({ practices: row.practices,
    fromLoad: safeDuration(row.fromLoad), fromReady: safeDuration(row.fromReady) })
  return { category: value.category, attempts: value.attempts, ready: value.ready, errors: value.errors, timeouts: value.timeouts,
    inconclusive: value.inconclusive, loading: value.loading, retries: value.retries,
    linkedEntries: { new: value.linkedEntries.new, resumed: value.linkedEntries.resumed }, readyDuration: safeDuration(value.readyDuration),
    milestones: value.milestones ? { linkedPractices: value.milestones.linkedPractices, unmatchedEntries: value.milestones.unmatchedEntries,
      firstValidMove: milestone(value.milestones.firstValidMove), twentyValidMoves: milestone(value.milestones.twentyValidMoves) } : null,
    quality: { coverage: value.quality.coverage, storageStatus: value.quality.storageStatus,
      truncated: value.quality.truncated, observationGap: value.quality.observationGap } }
}
function safeLocal(local: Trial2048LocalMetrics | null) {
  if (!local) return null
  return { version: local.version, scope: local.scope, practice: local.practice, localReturn: local.localReturn,
    training: local.training, rewardedDemo: local.rewardedDemo, ticketOffer: local.ticketOffer,
    ...(Object.hasOwn(local, 'loadDiagnostics') ? { loadDiagnostics: safeLoadDiagnostics(local.loadDiagnostics) } : {}) }
}

/** Explicit projections keep tournament identities, names and arbitrary source fields out of the download. */
export function build2048TrialAggregate(snapshot: Trial2048ServerSnapshot | null, local: Trial2048LocalMetrics | null) {
  const retention = snapshot?.retention.status === 'ready' ? snapshot.retention.report : null
  const community = snapshot?.community.status === 'ready' ? snapshot.community.report : null
  return { format: 'torneos.2048.trial-aggregate', version: 1, generatedAt: new Date().toISOString(),
    serverLoadedAt: snapshot?.loadedAt ?? null,
    modes: { game: '2048', rewarded: 'demonstration', ticket: 'informational_unavailable' },
    sources: {
      accountRetention: retention ? { status: 'ready', unit: 'accounts', source: retention.source, cohortBasis: retention.cohortBasis, from: retention.from, to: retention.to,
        timezone: retention.timezone, asOfChileDay: retention.asOfChileDay,
        totals: { accounts: retention.totals.accounts, day1: safeMetric(retention.totals.day1), day7: safeMetric(retention.totals.day7) },
        cohorts: retention.cohorts.map(row => ({ cohortDay: row.cohortDay, accounts: row.accounts, day1: safeMetric(row.day1), day7: safeMetric(row.day7) })) }
        : { status: 'unavailable', report: null },
      community: community ? { status: 'ready', source: community.source, unit: community.unit, scope: 'latest_30_community_events_without_date_filter',
        events: community.events.map((event, index) => ({ eventNumber: index + 1, status: event.status, startsAt: event.startsAt,
          closesAt: event.closesAt, registrations: event.registrations, starts: event.starts, firstMoves: event.firstMoves,
          completed: event.completed, returnToNext: event.returnToNext ? safeMetric(event.returnToNext) : null })) }
        : { status: 'unavailable', report: null },
      local: { status: local ? 'selected' : 'unselected', scope: 'one_local_browser_export_without_account_join', summary: safeLocal(local) },
    },
    pendingEvidence,
    limitations: [...(snapshot?.limitations ?? []), 'Fuentes y denominadores separados; no se unen cuentas, participaciones ni navegadores.',
      'El filtro selecciona cohortes de cuentas; no filtra comunidad ni el registro local seleccionado.',
      'Las observaciones locales retenidas no equivalen a personas únicas ni a cobertura total.',
      'Los intentos de carga empiezan al montar el host; una carga inconclusa no acredita abandono. Los hitos enlazados reutilizan el registro existente y no se suman a sus conteos.',
      'Rewarded permanece en demostración y el ticket es informativo: no se calculan ingresos ni ventas.',
      'La preparación técnica y QA no prueban aceptación humana, demanda o encaje de mercado.'],
  }
}

function LocalDuration({ label, value }: { label: string; value: Trial2048Duration }) {
  const milliseconds = (amount: number | null) => amount === null ? 'desconocido' : `${amount.toLocaleString('es-CL', { maximumFractionDigits: 1 })} ms`
  return <p>{label}: {value.samples === 0 ? 'desconocido; sin muestras temporales válidas' : `media ${milliseconds(value.meanMs)} · mínimo ${milliseconds(value.minMs)} · máximo ${milliseconds(value.maxMs)}`} · muestras: {count(value.samples)}.</p>
}

function LocalLoadDiagnostics({ diagnostics }: { diagnostics: Trial2048LoadMetrics | null | undefined }) {
  const milestones = diagnostics?.milestones
  return <section className="space-y-2"><h3 className="font-semibold">Diagnóstico local de carga</h3>
    {!diagnostics ? <p>Desconocido: este archivo no aporta diagnóstico de carga.</p> : <>
      <p className="font-medium">{category(diagnostics.category)}</p>
      <p>Intentos retenidos: {count(diagnostics.attempts)} · listos: {count(diagnostics.ready)} · errores: {count(diagnostics.errors)} · timeout: {count(diagnostics.timeouts)} · inconclusos: {count(diagnostics.inconclusive)} · en curso: {count(diagnostics.loading)} · reintentos: {count(diagnostics.retries)}.</p>
      <p>Entradas enlazadas: {count(diagnostics.linkedEntries.new)} nuevas · {count(diagnostics.linkedEntries.resumed)} retomadas. Una práctica puede aparecer en varias cargas.</p>
      <LocalDuration label="Carga hasta listo" value={diagnostics.readyDuration} />
      {!milestones ? <p>Hitos desconocidos: el diagnóstico autónomo no incluye el registro de movimientos.</p>
        : milestones.linkedPractices === 0 ? <p>Hitos desconocidos: no hay prácticas compatibles para enlazar en este archivo.</p> : <>
          <p>Prácticas compatibles distintas: {count(milestones.linkedPractices)} · entradas sin registro compatible: {count(milestones.unmatchedEntries)}.</p>
          <p>Primer movimiento observado después de entrar: {count(milestones.firstValidMove.practices)} / {count(milestones.linkedPractices)} prácticas enlazadas. Veinte movimientos: {count(milestones.twentyValidMoves.practices)} / {count(milestones.linkedPractices)}.</p>
          <div className="text-sm space-y-1">
            <LocalDuration label="Primer movimiento desde carga" value={milestones.firstValidMove.fromLoad} />
            <LocalDuration label="Primer movimiento desde listo" value={milestones.firstValidMove.fromReady} />
            <LocalDuration label="Veinte movimientos desde carga" value={milestones.twentyValidMoves.fromLoad} />
            <LocalDuration label="Veinte movimientos desde listo" value={milestones.twentyValidMoves.fromReady} />
          </div>
        </>}
      <LocalQuality quality={diagnostics.quality} />
    </>}
    <p className="text-sm text-muted-foreground">Intentos observados desde el montaje del host, sin medir visitas o personas. Inconcluso no significa abandono. Retomar no repite hitos históricos; estos enlaces reutilizan las observaciones existentes y no se suman a sus conteos. Cargar o descargar no acredita juego ni retorno.</p>
  </section>
}

function LocalQuality({ quality }: { quality: NonNullable<Trial2048LocalMetrics['training']>['quality'] }) {
  return <p className="text-xs text-muted-foreground">Cobertura: {quality.coverage === 'local_best_effort' ? 'local de mejor esfuerzo' : quality.coverage === 'incomplete' ? 'incompleta' : 'desconocida'}
    {' · '}Almacenamiento: {quality.storageStatus === 'ready' ? 'disponible' : quality.storageStatus === 'corrupt' ? 'corrupto' : quality.storageStatus === 'unavailable' ? 'no disponible' : 'desconocido'}
    {quality.truncated && ' · registro truncado'}{quality.observationGap && ' · observación con saltos'}</p>
}

function Local2048Summary({ local }: { local: Trial2048LocalMetrics }) {
  const dayStatus = (value: NonNullable<Trial2048LocalMetrics['localReturn']>['d1']) => value.status === 'returned' ? 'Regreso observado'
    : value.status === 'not_returned' ? 'Sin regreso registrado en el día maduro' : value.status === 'pending' ? 'Día objetivo pendiente de terminar' : 'Desconocido'
  return <div className="space-y-5">
    <LocalLoadDiagnostics diagnostics={local.loadDiagnostics} />
    <section className="space-y-2"><h3 className="font-semibold">Práctica observada en el archivo</h3>
      {local.practice === null ? <p>Desconocido: este archivo no aporta observaciones de práctica.</p> : local.practice.length === 0 ? <p>No hay prácticas observadas retenidas en este archivo.</p> : local.practice.map(row => <div key={row.category} className="rounded border p-3 space-y-2">
        <p className="font-medium">{category(row.category)}</p>
        <p>Sesiones retenidas: {count(row.sessions)} · inicios: {count(row.started)} · primer movimiento válido: {count(row.firstValidMove)} · veinte movimientos válidos: {count(row.twentyValidMoves)}.</p>
        <p>Terminadas: {count(row.ended)} · interrumpidas: {count(row.interrupted)}.</p>
        <p>Segunda práctica observada en 24 h: {row.observedSecondPracticeWithin24h === null ? 'desconocida' : row.observedSecondPracticeWithin24h ? 'sí' : 'no registrada'}. No es una tasa de repetición de jugadores.</p>
        <LocalQuality quality={row.quality} />
      </div>)}</section>
    <section className="space-y-2"><h3 className="font-semibold">Regreso local de un navegador</h3>
      {!local.localReturn ? <p>Desconocido: este archivo no aporta regreso local.</p> : <>
        <p>{category(local.localReturn.category)} · días jugados retenidos: {count(local.localReturn.daysPlayed)}.</p>
        <p>D1 local: {dayStatus(local.localReturn.d1)} · D7 local: {dayStatus(local.localReturn.d7)}.</p>
        <LocalQuality quality={local.localReturn.quality} />
      </>}</section>
    <section className="space-y-2"><h3 className="font-semibold">Entrenamiento de demostración</h3>
      {!local.training ? <p>Desconocido: este archivo no aporta entrenamiento.</p> : <>
        <p>{category(local.training.category)} · ofertas: {count(local.training.offered)} · inicios: {count(local.training.started)} · con movimiento válido: {count(local.training.withValidMove)}.</p>
        <p>Movimientos asistidos: {count(local.training.validMoves)} · terminados: {count(local.training.ended)} · interrumpidos: {count(local.training.interrupted)}.</p>
        <LocalQuality quality={local.training.quality} />
      </>}</section>
    <section className="space-y-2"><h3 className="font-semibold">Rewarded demo · sin publicidad real</h3>
      {!local.rewardedDemo ? <p>Desconocido: este archivo no aporta solicitudes de demostración.</p> : <>
        <p>{category(local.rewardedDemo.category)} · solicitudes: {count(local.rewardedDemo.requests)} · aplicaciones demo: {count(local.rewardedDemo.applied)} · canceladas: {count(local.rewardedDemo.cancelled)}.</p>
        <p>Vencidas: {count(local.rewardedDemo.timeouts)} · errores: {count(local.rewardedDemo.errors)} · sin disponibilidad: {count(local.rewardedDemo.noFill)} · duplicadas ignoradas: {count(local.rewardedDemo.ignoredDuplicate)} · tardías ignoradas: {count(local.rewardedDemo.ignoredLate)}.</p>
        <LocalQuality quality={local.rewardedDemo.quality} />
      </>}</section>
    <section className="space-y-2"><h3 className="font-semibold">Consultas locales de ticket informativo</h3>
      {!local.ticketOffer ? <p>Desconocido: este archivo no aporta consultas de ticket.</p> : <>
        <p>{category(local.ticketOffer.category)} · vistas retenidas: {count(local.ticketOffer.views)} · desde práctica: {count(local.ticketOffer.bySource.practice)} · desde resultado: {count(local.ticketOffer.bySource.result)} · directas: {count(local.ticketOffer.bySource.direct)}.</p>
        <LocalQuality quality={local.ticketOffer.quality} />
      </>}
      <p className="text-sm text-muted-foreground">Vistas de un navegador; no son personas únicas, solicitudes de aviso, reservas ni compras.</p>
    </section>
  </div>
}

export function Trial2048Report({ snapshot, from, to, rangeError }: {
  snapshot: Trial2048ServerSnapshot | null; from: string; to: string; rangeError?: string
}) {
  const fileId = useId(), generation = useRef(0)
  const [local, setLocal] = useState<Trial2048LocalMetrics | null>(null), [localError, setLocalError] = useState(''), [reading, setReading] = useState(false)
  useEffect(() => () => { generation.current++ }, [])
  const retention = snapshot?.retention.status === 'ready' ? snapshot.retention.report : null
  const community = snapshot?.community.status === 'ready' ? snapshot.community.report : null
  const importLocal = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    const current = ++generation.current
    setLocal(null); setLocalError(''); setReading(true)
    try {
      if (file.size > MAX_2048_TRIAL_LOCAL_BYTES) throw new Error('Oversized')
      const text = await file.text()
      if (new TextEncoder().encode(text).byteLength > MAX_2048_TRIAL_LOCAL_BYTES) throw new Error('Oversized')
      const parsed = parse2048TrialLocalExport(text)
      if (current === generation.current) setLocal(parsed)
    } catch { if (current === generation.current) setLocalError('No pudimos leer este registro. Selecciona una exportación local válida de 2048 de hasta 2,5 MB.') }
    finally { if (current === generation.current) setReading(false) }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(build2048TrialAggregate(snapshot, local), null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = '2048-informe-ensayo-agregado.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div className="max-w-6xl space-y-6">
    <header className="space-y-2"><h1 className="text-2xl font-bold">Ensayo de 2048 · informe operativo</h1>
      <p className="text-sm text-muted-foreground">Fuentes independientes: cuentas, participaciones comunitarias y un archivo local opcional. No se unen identidades ni denominadores.</p>
      <p className="text-sm">Modalidades actuales: <strong>Rewarded en demostración</strong> · <strong>Ticket informativo, todavía no disponible</strong>. Este informe no estima ingresos ni ventas.</p>
      {snapshot && <p className="text-xs text-muted-foreground">Lectura central: {snapshot.loadedAt} · hora UTC de consulta; no es la fecha de maduración de las cohortes.</p>}
    </header>
    <form method="get" action="/admin/reports/2048-trial" className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1">Desde<input type="date" name="from" required defaultValue={from} className="rounded border p-2" /></label>
      <label className="grid gap-1">Hasta<input type="date" name="to" required defaultValue={to} className="rounded border p-2" /></label>
      <button type="submit" className="rounded border px-4 py-2">Consultar / reintentar</button>
    </form>
    <p className="text-sm text-muted-foreground">Hasta 90 días inclusivos. El filtro selecciona cohortes de primer día activo conocido; no filtra los últimos 30 retos comunitarios ni el archivo local.</p>
    {rangeError && <p role="alert">{rangeError}</p>}
    <section className="space-y-3" aria-labelledby="trial-accounts"><h2 id="trial-accounts" className="text-xl font-semibold">Retorno central de cuentas · D1/D7</h2>
      {!retention ? <p role="status">Desconocido: no se pudo confirmar el retorno de cuentas. No se presentan ceros estimados.</p> : <>
        <p>Cohortes {retention.from} — {retention.to} · corte de maduración {retention.asOfChileDay} (Chile) · {count(retention.totals.accounts)} cuentas.</p>
        <p>D1: {metric(retention.totals.day1)} · pendientes: {count(retention.totals.accounts - retention.totals.day1.eligibleAccounts)}.</p>
        <p>D7: {metric(retention.totals.day7)} · pendientes: {count(retention.totals.accounts - retention.totals.day7.eligibleAccounts)}.</p>
        <p className="text-sm text-muted-foreground">Numerador / denominador: cuentas que regresaron en el día exacto / cuentas cuyo día objetivo ya terminó en Chile. Un día pendiente no es una pérdida. Una cuenta no equivale necesariamente a una persona.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="text-left p-2">Cohortes de actividad declarada en práctica o desafío diario</caption>
          <thead><tr><th scope="col" className="p-2">Primer día conocido</th><th scope="col" className="p-2">Cuentas</th><th scope="col" className="p-2">D1</th><th scope="col" className="p-2">D7</th></tr></thead>
          <tbody>{retention.cohorts.map(row => <tr key={row.cohortDay} className="border-t"><th scope="row" className="p-2">{row.cohortDay}</th><td className="p-2">{count(row.accounts)}</td><td className="p-2">{metric(row.day1)}</td><td className="p-2">{metric(row.day7)}</td></tr>)}</tbody>
        </table></div>
      </>}
    </section>
    <section className="space-y-3" aria-labelledby="trial-community"><h2 id="trial-community" className="text-xl font-semibold">Comunidad · últimos 30 retos, sin filtro de fechas</h2>
      {!community ? <p role="status">Desconocido: no se pudo confirmar la participación comunitaria.</p> : community.events.length === 0 ? <p>No hay retos comunitarios registrados en esta ventana.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="p-2 text-left">Participaciones por cuenta y regreso al siguiente reto no cancelado; no es D1/D7.</caption>
        <thead><tr>{['Reto / estado', 'Inscritos', 'Inicios', 'Primer movimiento', 'Completados', 'Regreso al siguiente'].map(label => <th scope="col" className="p-2" key={label}>{label}</th>)}</tr></thead>
        <tbody>{community.events.map((event, index) => <tr key={event.tournamentId} className="border-t"><th scope="row" className="p-2">Reto {index + 1} · {event.status}<span className="block text-xs font-normal">{new Date(event.startsAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</span></th>
          <td className="p-2">{count(event.registrations)}</td><td className="p-2">{count(event.starts)}</td><td className="p-2">{count(event.firstMoves)}</td><td className="p-2">{count(event.completed)}</td>
          <td className="p-2">{event.status === 'cancelled' ? 'No aplica: cancelado' : event.returnToNext ? metric(event.returnToNext) : 'Pendiente: requiere dos resultados oficiales'}</td></tr>)}</tbody>
      </table></div>}
      <p className="text-sm text-muted-foreground">No se suman participantes entre retos como personas únicas. La repetición necesita dos retos oficiales y conserva su propio denominador.</p>
    </section>
    <section className="rounded-xl border p-4 space-y-4" aria-labelledby="trial-local"><h2 id="trial-local" className="text-xl font-semibold">Resumen local opcional · un navegador</h2>
      <p id={`${fileId}-help`} className="text-sm text-muted-foreground">Selecciona una descarga de «Mi progreso» o un diagnóstico de carga de 2048 de hasta 2,5 MB. Reemplaza el resumen anterior; se procesa en memoria sin subir el archivo, guardarlo ni conservar su nombre. El filtro de cohortes no lo recorta.</p>
      <label className="grid gap-2" htmlFor={fileId}>Seleccionar registro local JSON<input id={fileId} type="file" className="block w-full min-w-0 max-w-full" accept=".json,application/json" aria-describedby={`${fileId}-help`} onChange={event => void importLocal(event)} /></label>
      {reading && <p role="status">Leyendo el resumen local…</p>}{localError && <p role="alert">{localError}</p>}
      {!local ? <p>No hay un resumen local seleccionado. Sus métricas permanecen desconocidas.</p> : <>
        <p role="status">Resumen local seleccionado; no se ha enviado ni guardado.</p><Local2048Summary local={local} />
      </>}
      <button type="button" className="rounded border px-4 py-2" disabled={!local && !reading} onClick={() => {
        generation.current++; setLocal(null); setLocalError(''); setReading(false)
      }}>Quitar resumen local</button>
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Salida del ensayo</h2>
      <p className="text-sm text-muted-foreground">El archivo descargado contiene sólo agregados confirmados y sus límites. Fuentes ausentes siguen desconocidas. No incluye nombres de archivo, identidades ni tableros; no construye una conversión entre fuentes o un veredicto automático de mercado.</p>
      <button type="button" className="rounded border px-4 py-2" onClick={download} disabled={reading}>Descargar informe agregado JSON</button>
      <p className="text-sm text-muted-foreground">La aceptación humana, convocatoria, soporte, costos y retorno real del ensayo necesitan observación propia. La demostración no mide publicidad real y las consultas de ticket no son compras.</p>
    </section>
    <section className="space-y-2" aria-labelledby="trial-pending"><h2 id="trial-pending" className="text-xl font-semibold">Evidencia pendiente o no medida</h2>
      <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">{pendingEvidence.map(item => <li key={item}>{item}</li>)}</ul>
      <p className="text-sm text-muted-foreground">Estos vacíos permanecen desconocidos; no se reemplazan por ceros ni producen una decisión automática de encaje de mercado.</p>
    </section>
    {snapshot && <details className="rounded border p-4 text-sm"><summary className="cursor-pointer font-medium">Alcance de las fuentes</summary>
      <ul className="list-disc pl-5 mt-3 space-y-1 text-muted-foreground">{snapshot.limitations.map(item => <li key={item}>{item}</li>)}</ul>
    </details>}
    <nav aria-label="Recorrido e informes de 2048" className="flex flex-wrap gap-4 text-sm underline"><Link href="/admin/reports/2048-trial/operations">Convocatoria y primeras sesiones</Link><Link href="/play">Práctica gratuita</Link><Link href="/tournaments">Retos y clasificación</Link><Link href="/play/2048/ticket">Ficha informativa de ticket</Link><Link href="/admin/reports/2048">Detalle de retorno de cuentas</Link><Link href="/admin/reports/2048-community">Detalle de comunidad</Link><Link href="/admin/reports">Volver a reportes</Link></nav>
  </div>
}
