'use client'
import Link from 'next/link'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { player2048ChileDay } from '@/lib/game/player-2048-retention'
import { create2048TrialOperations, parse2048TrialOperations, build2048TrialOperationsSummary,
  MAX_2048_OPERATIONS_BYTES, type Operations2048, type Session2048Operations } from '@/lib/analytics/2048-trial-operations'

const fieldClass = 'block w-full min-w-0 max-w-full rounded border p-2'
const invitation = { not_recorded: 'Sin registrar', invited: 'Invitación enviada manualmente', accepted: 'Aceptó', declined: 'Declinó' }
const observation = { unknown: 'Desconocido', observed: 'Observado', not_observed: 'No observado explícitamente' }
const device = { unknown: 'Desconocido', mobile: 'Teléfono', desktop: 'Computador', tablet: 'Tablet' }
const auth = { unknown: 'Desconocido', authenticated: 'Cuenta autenticada', anonymous: 'Sin cuenta / anónimo' }
const ending = { unknown: 'Desconocido', completed: 'Terminó la práctica', left: 'Salió', technical_block: 'Bloqueo técnico' }
const blocker = { unknown: 'Desconocido', none: 'Sin bloqueo observado', load: 'Carga', controls: 'Controles', account: 'Cuenta', understanding: 'Comprensión', other: 'Otro bloqueo' }
const assistance = { unknown: 'Desconocida', none: 'Sin ayuda registrada', instructions: 'Instrucciones del observador', individual_help: 'Ayuda individual' }
const second = { unknown: 'Desconocida', observed_without_prompt: 'Observada sin indicación registrada', observed_after_prompt: 'Observada después de indicación', not_observed: 'No observada explícitamente' }
const understanding = { unknown: 'Desconocido', understood: 'Comprendió', confused: 'Mostró confusión', not_offered: 'No se ofreció' }
const ticketUnderstanding = { unknown: 'Desconocido', understood: 'Comprendió', confused: 'Mostró confusión', not_shown: 'No se mostró' }
const followActivity = { unknown: 'Desconocida', observed: 'Actividad observada', participant_reported: 'Declarada por participante', not_observed: 'Sin juego observado en el día objetivo' }
const prompts = { unknown: 'Desconocido', none_recorded: 'Sin recordatorio registrado', general_reminder: 'Recordatorio general', individual_help: 'Ayuda individual' }
const channels = { unspecified: 'Por definir', community: 'Comunidad', personal_invitation: 'Invitación personal', social: 'Red social', other: 'Otro canal' }
const workKinds = { recruitment: 'Convocatoria', session: 'Sesión observada', reminder: 'Recordatorio', support: 'Soporte', analysis: 'Análisis' }
const categoryLabel = (value: Operations2048['category']) => value === 'synthetic' ? 'QA sintética' : 'Observaciones reales declaradas'
const dateLabel = (value: string | null) => value ?? 'Desconocida'
const numberLabel = (value: number | null) => value === null ? 'Desconocido' : value.toLocaleString('es-CL')
type Summary = ReturnType<typeof build2048TrialOperationsSummary>

function EnumField<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: Record<T, string>; onChange: (value: T) => void
}) {
  return <label className="grid min-w-0 gap-1 text-sm">{label}<select className={fieldClass} value={value}
    onChange={event => onChange(event.currentTarget.value as T)}>{Object.entries<string>(options).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
}
function DayField({ label, value, onChange, max, disabled = false }: {
  label: string; value: string | null; onChange: (day: string | null) => void; max?: string; disabled?: boolean
}) {
  return <label className="grid min-w-0 gap-1 text-sm">{label}<input className={fieldClass} type="date" value={value ?? ''} max={max} disabled={disabled}
    onChange={event => onChange(event.currentTarget.value || null)} /></label>
}

function FollowFields({ title, value, derived, today, onChange }: {
  title: string; value: Session2048Operations['d1']; derived?: Summary['sessions'][number]['d1']; today: string
  onChange: (value: Session2048Operations['d1']) => void
}) {
  const maturity = derived?.maturity === 'mature' ? 'Día objetivo terminado' : derived?.maturity === 'open' ? 'Día objetivo en curso'
    : derived?.maturity === 'pending' ? 'Día objetivo futuro' : 'Sin primer juego observado'
  return <fieldset className="rounded border p-3 space-y-3 min-w-0"><legend className="px-1 font-medium">{title}</legend>
    <p className="text-sm">Día objetivo: {dateLabel(derived?.targetDay ?? null)} · {maturity}.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <EnumField label="Actividad en el día objetivo" value={value.activity} options={followActivity} onChange={activity => onChange({ ...value, activity,
        checkedDay: activity === 'unknown' ? null : value.checkedDay })} />
      <DayField label="Fecha de comprobación" value={value.checkedDay} max={today} disabled={value.activity === 'unknown'} onChange={checkedDay => onChange({ ...value, checkedDay })} />
      <EnumField label="Recordatorio o ayuda" value={value.prompt} options={prompts} onChange={prompt => onChange({ ...value, prompt })} />
    </div>
    <p className="text-xs text-muted-foreground">La actividad corresponde al día objetivo D1/D7; la fecha de comprobación indica cuándo la verificaste. Un recordatorio no acredita regreso. Sólo registra sin juego observado después de terminar el día objetivo; deja desconocido lo que no comprobaste.</p>
  </fieldset>
}

function SessionCard({ session, summary, today, onChange }: {
  session: Session2048Operations; summary?: Summary['sessions'][number]; today: string; onChange: (patch: Partial<Session2048Operations>) => void
}) {
  return <details aria-label={`Ficha ${session.code}`} className="rounded-xl border p-4 min-w-0"><summary className="cursor-pointer font-semibold break-words">{session.code} · {invitation[session.invitation]} · sesión {session.sessionDay ?? 'sin fecha'}</summary>
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <EnumField label="Invitación" value={session.invitation} options={invitation} onChange={value => onChange({ invitation: value })} />
        <DayField label="Fecha de sesión (Chile)" value={session.sessionDay} max={today} onChange={sessionDay => onChange({ sessionDay })} />
        <EnumField label="Dispositivo utilizado" value={session.device} options={device} onChange={value => onChange({ device: value })} />
        <EnumField label="Cuenta durante la sesión" value={session.auth} options={auth} onChange={value => onChange({ auth: value })} />
        <EnumField label="Primer movimiento válido" value={session.firstMove} options={observation} onChange={value => onChange({ firstMove: value })} />
        <EnumField label="Veinte movimientos válidos" value={session.twentyMoves} options={observation} onChange={value => onChange({ twentyMoves: value })} />
        <EnumField label="Cómo terminó la sesión" value={session.ending} options={ending} onChange={value => onChange({ ending: value })} />
        <EnumField label="Bloqueo principal" value={session.blocker} options={blocker} onChange={value => onChange({ blocker: value })} />
        <EnumField label="Ayuda durante la sesión" value={session.assistance} options={assistance} onChange={value => onChange({ assistance: value })} />
        <EnumField label="Segunda práctica" value={session.secondPractice} options={second} onChange={value => onChange({ secondPractice: value })} />
        <EnumField label="Comprensión del entrenamiento demo" value={session.trainingUnderstanding} options={understanding} onChange={value => onChange({ trainingUnderstanding: value })} />
        <EnumField label="Comprensión del ticket informativo" value={session.ticketUnderstanding} options={ticketUnderstanding} onChange={value => onChange({ ticketUnderstanding: value })} />
      </div>
      <FollowFields title="Seguimiento D1 manual" value={session.d1} derived={summary?.d1} today={today} onChange={d1 => onChange({ d1 })} />
      <FollowFields title="Seguimiento D7 manual" value={session.d7} derived={summary?.d7} today={today} onChange={d7 => onChange({ d7 })} />
    </div>
  </details>
}

function invitationText(url: string, start: string | null) {
  return `Te invitamos a probar 2048 gratis en un entorno de desarrollo de TorneosPlay. La participación es voluntaria: puedes dejar de jugar cuando quieras.\n\n${url}\n\nPuedes practicar y mejorar tu marca sin cuenta. Si eliges probar el entrenamiento de demostración, la continuación es asistida, no muestra anuncios reales y no cambia tu récord ni una clasificación. El ticket es sólo informativo y todavía no está disponible: no hay pagos ni promesas de ingresos.\n\n${start ? `Fecha propuesta: ${start} (Chile). Coordinaremos el horario manualmente.` : 'Coordinaremos una fecha y horario manualmente.'}\n\nNos interesa observar si puedes empezar, qué cuesta entender y si decides repetir. No necesitas realizar compras ni aceptar anuncios.`
}

export function Trial2048Operations({ asOfDay, practiceUrl }: { asOfDay: string; practiceUrl: string }) {
  const fileId = useId(), generation = useRef(0)
  const [operations, setOperations] = useState<Operations2048>(() => create2048TrialOperations('declared_real'))
  const [today, setToday] = useState(asOfDay), [dirty, setDirty] = useState(false), [notice, setNotice] = useState('')
  const [reading, setReading] = useState(false), [newCategory, setNewCategory] = useState<Operations2048['category']>('declared_real')
  const [discardAccepted, setDiscardAccepted] = useState(false)
  useEffect(() => () => { generation.current++ }, [])
  let valid: Operations2048 | null = null, summary: Summary | null = null
  try {
    const calculated = build2048TrialOperationsSummary(operations, today)
    const parsed = parse2048TrialOperations(JSON.stringify(operations), today)
    valid = parsed; summary = calculated
  } catch { /* The draft can be incomplete; it cannot be exported as valid evidence. */ }
  const edit = (next: Operations2048) => { generation.current++; setReading(false); setOperations(next); setDirty(true); setNotice(''); setDiscardAccepted(false) }
  const patchSession = (code: string, patch: Partial<Session2048Operations>) => edit({ ...operations, sessions: operations.sessions.map(session => session.code === code ? { ...session, ...patch } : session) })
  const download = (text: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''
    if (!file) return
    const current = ++generation.current; setReading(true); setNotice('')
    try {
      if (file.size > MAX_2048_OPERATIONS_BYTES) throw new Error('Size')
      const text = await file.text()
      if (new TextEncoder().encode(text).byteLength > MAX_2048_OPERATIONS_BYTES) throw new Error('Size')
      const parsed = parse2048TrialOperations(text, today)
      if (current === generation.current) { setOperations(parsed); setDirty(false); setDiscardAccepted(false); setNotice('Registro importado en memoria; no se mezcló con el anterior. Conserva el archivo original y descarga después de editar.') }
    } catch { if (current === generation.current) setNotice('No se importó; registro actual conservado. Usa un JSON operativo válido de hasta 250.000 bytes y fechas de observación no futuras.') }
    finally { if (current === generation.current) setReading(false) }
  }
  const invite = invitationText(practiceUrl, operations.plan.plannedStartDay)
  return <div className="max-w-6xl space-y-6 min-w-0">
    <header className="space-y-3"><h1 className="text-2xl font-bold">Convocatoria y primeras sesiones · 2048</h1>
      <p className="rounded border bg-muted/20 p-3 font-medium">No se guarda automáticamente. Descarga el registro después de editar y antes de salir.</p>
      <p className="text-sm"><strong>{categoryLabel(operations.category)}</strong> · {dirty ? 'Cambios sin descargar' : 'Sin ediciones desde la creación, importación o última descarga solicitada'}.</p>
      <p className="text-sm text-muted-foreground">Ocho fichas con códigos S01–S08 para observar las primeras 6–8 sesiones. No introduzcas nombres, correos, cuentas o notas personales. La categoría y los hechos son declaraciones del operador; no verifican personas únicas ni consentimiento humano.</p>
    </header>

    <section className="rounded-xl border p-4 space-y-3"><h2 className="text-lg font-semibold">Conservar o reabrir el registro</h2>
      <label className="grid gap-2 min-w-0" htmlFor={fileId}>Importar registro operativo JSON (reemplaza sólo si es válido)<input id={fileId} type="file" accept=".json,application/json" className={fieldClass} onChange={event => void importFile(event)} /></label>
      <p className="text-sm text-muted-foreground">Sólo memoria de esta página: sin subida, almacenamiento automático ni cruce con las cuentas. Importar conserva la categoría del archivo; un fallo conserva el documento actual.</p>
      {reading && <p role="status">Leyendo registro operativo…</p>}{notice && <p role="status" aria-live="polite">{notice}</p>}
      {!valid && <p role="alert">El borrador contiene datos incompletos, incompatibles o fechas futuras de observación. Corrige las fichas o el trabajo registrado; la descarga está bloqueada.</p>}
      <button type="button" className="rounded border px-4 py-2" disabled={!valid || reading} onClick={() => {
        if (!valid) return
        download(JSON.stringify(valid, null, 2), '2048-registro-operativo.json', 'application/json')
        setDirty(false); setNotice('Descarga solicitada. Comprueba que conservaste el archivo; esta página no lo guarda automáticamente.')
      }}>Descargar registro JSON para reabrir</button>
    </section>

    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Crear otro registro vacío</summary><div className="mt-4 space-y-3">
      <EnumField label="Categoría del nuevo registro" value={newCategory} options={{ declared_real: 'Observaciones reales declaradas', synthetic: 'QA sintética' }} onChange={setNewCategory} />
      <p className="text-sm">Crear otro registro descarta el documento actual y comienza con ocho fichas vacías. No convierte QA en observaciones reales. Descarga antes lo que quieras conservar.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={discardAccepted} onChange={event => setDiscardAccepted(event.currentTarget.checked)} />Conservé lo necesario y acepto reemplazar este documento por uno vacío.</label>
      <button type="button" className="rounded border px-4 py-2" disabled={!discardAccepted || reading} onClick={() => {
        if (!discardAccepted) return
        generation.current++; setOperations(create2048TrialOperations(newCategory)); setDirty(false); setNotice('Nuevo registro vacío. No se copiaron observaciones del documento anterior.'); setDiscardAccepted(false)
      }}>Crear nuevo registro vacío</button>
    </div></details>

    <section className="space-y-3"><h2 className="text-xl font-semibold">Plan de convocatoria</h2><div className="grid gap-3 sm:grid-cols-3">
      <DayField label="Fecha propuesta de inicio (opcional)" value={operations.plan.plannedStartDay} onChange={plannedStartDay => edit({ ...operations, plan: { ...operations.plan, plannedStartDay } })} />
      <EnumField label="Canal principal" value={operations.plan.channel} options={channels} onChange={channel => edit({ ...operations, plan: { ...operations.plan, channel } })} />
      <label className="grid gap-1 text-sm">Meta de primeras sesiones<select className={fieldClass} value={operations.plan.targetSessions} onChange={event => edit({ ...operations, plan: { ...operations.plan, targetSessions: Number(event.currentTarget.value) as 6 | 7 | 8 } })}>{[6, 7, 8].map(value => <option key={value} value={value}>{value} sesiones</option>)}</select></label>
    </div><p className="text-sm text-muted-foreground">La fecha propuesta no inicia el ensayo. El primer movimiento observado en una sesión fechada define el inicio operativo conocido; no representa adquisición central.</p>
      {summary && <div className="rounded border p-3 space-y-1 text-sm"><p>Calendario {summary.calendar.basis === 'observed_session' ? 'desde el primer juego observado' : summary.calendar.basis === 'proposed' ? 'propuesto, sin primer juego observado' : 'sin fecha de inicio'}.</p>
        <p>Día 1: {dateLabel(summary.calendar.day1)} · propuesta de reto día 14: {dateLabel(summary.calendar.day14)} · propuesta de reto día 21: {dateLabel(summary.calendar.day21)} · cierre día 30: {dateLabel(summary.calendar.day30)}.</p>
        <p>Son referencias para coordinar manualmente; esta página no crea torneos, recordatorios ni eventos.</p></div>}
    </section>

    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Invitación preparada · copiar manualmente o descargar TXT</summary><div className="mt-3 space-y-3">
      <label className="grid gap-2 text-sm">Texto de invitación, sin envío automático<textarea readOnly className={`${fieldClass} h-64`} value={invite} /></label>
      <button type="button" className="rounded border px-4 py-2" onClick={() => download(invite, '2048-invitacion-prueba.txt', 'text/plain;charset=utf-8')}>Descargar invitación TXT</button>
    </div></details>

    <section className="space-y-3"><h2 className="text-xl font-semibold">Guión breve para observar</h2><ol className="list-decimal pl-5 space-y-1 text-sm">
      <li>Presenta la prueba gratuita y voluntaria. Observa primero si la persona puede empezar y entender los controles.</li>
      <li>Registra el primer movimiento válido, veinte movimientos, bloqueos y cómo termina. Distingue lo observado de lo desconocido.</li>
      <li>Si das instrucciones o pides otra práctica, anótalo. Una segunda práctica después de una indicación no demuestra repetición orgánica.</li>
      <li>Comprueba si entiende que el entrenamiento demo es asistido y que el ticket es informativo, todavía no disponible.</li>
      <li>En D1/D7 anota comprobación y recordatorio por separado. Sin comprobación no declares ausencia; no deduzcas regreso de haber enviado un aviso.</li>
    </ol><Link className="inline-flex underline text-sm" href={practiceUrl}>Abrir práctica gratuita de desarrollo</Link></section>

    <section className="space-y-3"><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-semibold">Fichas y seguimiento manual</h2><button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => { setToday(player2048ChileDay(Date.now())); setNotice('Fecha de seguimiento actualizada con el reloj de este dispositivo. Revisa las comprobaciones registradas.'); }}>Actualizar fecha de seguimiento</button></div>
      <p className="text-sm text-muted-foreground">Fecha de seguimiento: {today}, America/Santiago. D1 y D7 sólo maduran después de terminar su día objetivo; una actividad observada durante ese día todavía no acredita una cohorte madura.</p>
      {operations.sessions.map(session => <SessionCard key={session.code} session={session} summary={summary?.sessions.find(value => value.code === session.code)} today={today} onChange={patch => patchSession(session.code, patch)} />)}
    </section>

    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Tiempo y costos operativos · {operations.workLog.length} de 120 registros</summary><div className="mt-4 space-y-3">
      <p className="text-sm text-muted-foreground">Vacío significa desconocido; 0 es un valor declarado. Registra sólo lo comprobado, sin notas ni datos personales.</p>
      {operations.workLog.map((row, index) => <fieldset key={index} className="rounded border p-3 min-w-0"><legend className="px-1">Trabajo {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DayField label="Fecha de trabajo (Chile), obligatoria" value={row.day} max={today} onChange={day => edit({ ...operations, workLog: operations.workLog.map((value, position) => position === index ? { ...value, day: day ?? '' } : value) })} />
        <EnumField label="Tipo de trabajo" value={row.kind} options={workKinds} onChange={kind => edit({ ...operations, workLog: operations.workLog.map((value, position) => position === index ? { ...value, kind } : value) })} />
        {(['minutes', 'costClp'] as const).map(key => <label key={key} className="grid gap-1 text-sm">{key === 'minutes' ? 'Minutos (vacío = desconocido)' : 'Costo CLP (vacío = desconocido)'}<input type="number" min={0} step={1} className={fieldClass} value={row[key] ?? ''}
          onChange={event => { const value = event.currentTarget.value; edit({ ...operations, workLog: operations.workLog.map((item, position) => position === index ? { ...item, [key]: value === '' ? null : Number(value) } : item) }) }} /></label>)}
      </div><button type="button" className="mt-3 rounded border px-3 py-2 text-sm" onClick={() => edit({ ...operations, workLog: operations.workLog.filter((_value, position) => position !== index) })}>Quitar trabajo {index + 1}</button></fieldset>)}
      <button type="button" className="rounded border px-3 py-2" disabled={operations.workLog.length >= 120} onClick={() => edit({ ...operations, workLog: [...operations.workLog, { day: '', kind: 'recruitment', minutes: null, costClp: null }] })}>Añadir trabajo</button>
    </div></details>

    <section className="space-y-3"><h2 className="text-xl font-semibold">Resumen operativo declarado</h2>
      {!summary ? <p>Desconocido mientras existan datos incompletos o incompatibles.</p> : <>
        <p>{categoryLabel(summary.category)} · {summary.totals.sessionDaysRecorded} fichas con fecha de sesión · {summary.totals.firstMove.observed} primeros movimientos observados · {summary.totals.twentyMoves.observed} sesiones con veinte movimientos observados.</p>
        <p>Invitaciones: {summary.totals.invitation.invited} enviadas sin respuesta registrada · {summary.totals.invitation.accepted} aceptadas · {summary.totals.invitation.declined} declinadas · {summary.totals.invitation.not_recorded} sin registrar.</p>
        <p>Segunda práctica: {summary.totals.secondPractice.observed_without_prompt} observadas sin indicación registrada · {summary.totals.secondPractice.observed_after_prompt} después de indicación · {summary.totals.secondPractice.unknown} desconocidas. No es una tasa de retención orgánica.</p>
        <p>D1: {summary.totals.d1.maturity.mature} fichas con día objetivo terminado; de las fichas maduras, {summary.sessions.filter(session => session.d1.maturity === 'mature' && session.d1.activity === 'unknown').length} sin comprobación. D7: {summary.totals.d7.maturity.mature} fichas con día objetivo terminado; de las fichas maduras, {summary.sessions.filter(session => session.d7.maturity === 'mature' && session.d7.activity === 'unknown').length} sin comprobación. Las demás mantienen su estado pendiente o sin base; no son ausencias.</p>
        <p>Minutos declarados conocidos: {numberLabel(summary.totals.work.knownMinutes)} · registros sin minutos: {summary.totals.work.minutesUnknownEntries}. Costo conocido: {numberLabel(summary.totals.work.knownCostClp)} CLP · registros sin costo: {summary.totals.work.costUnknownEntries}.</p>
      </>}
      <p className="text-sm text-muted-foreground">Este registro manual no demuestra personas únicas, consentimiento, adquisición, retorno orgánico, ingresos ni ventas. No se cruza con archivos locales o identidades de cuentas.</p>
    </section>

    <section className="space-y-3"><h2 className="text-lg font-semibold">Consultar fuentes centrales por separado</h2><p className="text-sm text-muted-foreground">D1/D7 centrales cuentan cuentas autenticadas con actividad declarada; una visita anónima permanece local. El rango se elige manualmente y no vincula estas fichas S01–S08 a una cuenta. Descarga este registro antes de consultar: navegar al informe central cierra esta página y pierde los cambios que no conservaste.</p>
      <form method="get" action="/admin/reports/2048-trial" className="flex flex-wrap items-end gap-3"><label className="grid min-w-0 gap-1 text-sm">Cohortes desde<input type="date" name="from" max={today} required className={fieldClass} /></label><label className="grid min-w-0 gap-1 text-sm">Cohortes hasta<input type="date" name="to" max={today} required className={fieldClass} /></label><button type="submit" className="rounded border px-3 py-2">Consultar informe central</button></form>
    </section>
    <Link href="/admin/reports/2048-trial" className="inline-flex underline text-sm">Volver al informe del ensayo</Link>
  </div>
}
