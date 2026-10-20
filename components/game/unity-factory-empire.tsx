'use client'
import {useEffect, useRef, useState} from 'react'
import {FACTORY_API, FACTORY_BUILD, FACTORY_CHANNEL, readFactoryIntent, toFactoryView, toFactoryFeedback, formatMilli, type FactoryAction, type FactoryView} from '@/lib/game/factory-empire'
import {ReliableCommands} from '@/lib/game/factory-reference/core/reliable-commands'
import {ApiError} from '@/lib/game/factory-reference/core/errors'
import type {Command, CommandResult, GuestSession, PlanetDirectoryPage, LeaderboardPage, CompetitionSummary, PlanetVisit} from '@/lib/game/factory-reference/contracts'
import {resolveFactoryAction} from '@/lib/game/factory-catalog'
import {FactoryClickBuffer} from '@/lib/game/factory-click-buffer'
import {startTrainingDuel, advanceTrainingDuel, type DuelState, type DuelMove} from '@/lib/game/factory-reference/core/training-duel'
import {publicFactoryRows, publicPlanetAllowed, type PublicFactoryState} from '@/lib/game/factory-public-planets'
import styles from './unity-factory-empire.module.css'

export function UnityFactoryEmpire() {
  const frame = useRef<HTMLIFrameElement>(null)
  const retryRef = useRef<() => void>(() => {})
  const [view, setView] = useState<FactoryView | null>(null)
  const [status, setStatus] = useState('Cargando Unity…')
  const [failed, setFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    // Open small screens in the game view so platform chrome cannot hide tabs.
    const start = requestAnimationFrame(() => {if (window.matchMedia('(max-width:599px)').matches) setExpanded(true)})
    return () => cancelAnimationFrame(start)
  }, [])
  useEffect(() => {
    if (!expanded) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape') setExpanded(false)}
    window.addEventListener('keydown', escape)
    return () => {document.body.style.overflow = previous; window.removeEventListener('keydown', escape)}
  }, [expanded])
  useEffect(() => {
    let disposed = false, ready = false, busy = false, csrf = '', commands: ReliableCommands | undefined, revision = -1
    let pendingEffect: FactoryAction | undefined
    let latest: CommandResult | undefined, duel: DuelState | undefined, duelFleet: CommandResult['state']['fleet']
    let blocked = false
    let celebration = ''
    const clicks = new FactoryClickBuffer()
    const publicState: PublicFactoryState = {}
    const send = (method: string, data: unknown) => frame.current?.contentWindow?.postMessage({channel: FACTORY_CHANNEL, version: 1, build: FACTORY_BUILD, type: 'host', method, payload: JSON.stringify(data)}, location.origin)
    const notice = (message: string, waiting = false, error = false) => {
      if (disposed) return
      setStatus(message); setFailed(error); blocked = error; send('OnStatus', {message, busy: waiting, error, queued: clicks.count})
    }
    async function request<T>(path: string, body?: unknown): Promise<T> {
      const response = await fetch(`${FACTORY_API}/${path}`, {method: body === undefined ? 'GET' : 'POST', cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(15000),
        headers: body === undefined ? {} : {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, ...(body === undefined ? {} : {body: JSON.stringify(body)})})
      const data = await response.json()
      if (!response.ok) throw new ApiError(response.status, data.error?.message ?? data.detail ?? 'No se pudo completar la acción.', data.state ? data : undefined, data.error?.code)
      return data as T
    }
    function apply(result: CommandResult, returning = false) {
      if (disposed || result.state.revision < revision) return
      const mapped = toFactoryView(result)
      if (latest) {
        const milestone = result.state.milestones?.find(m => m.completed && latest?.state.milestones?.some(old => old.id === m.id && !old.completed))
        const achievement = result.state.achievements?.find(a => a.unlocked && latest?.state.achievements?.some(old => old.id === a.id && !old.unlocked))
        celebration = milestone ? `Hito: ${milestone.title} · +${formatMilli(milestone.reward_milli)} Ferrite acreditados` : achievement ? `Logro desbloqueado: ${achievement.title}` : celebration
      }
      mapped.catalog = [...publicFactoryRows(publicState).slice(0, 256 - mapped.catalog.length), ...mapped.catalog]
      latest = result
      revision = result.state.revision; setView(mapped); send('OnState', mapped)
      if (returning && result.offline.elapsed_ms >= 60000 && BigInt(result.offline.earned_milli) > BigInt(0)) send('OnOffline', mapped)
    }
    async function boot() {
      if (busy) return
      busy = true; notice('Conectando con tu industria…', true)
      try {
        let session: GuestSession
        try {session = await request('auth/session')} catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) throw error
          session = await request('auth/guest', {})
        }
        csrf = session.csrf_token
        commands = new ReliableCommands(session.user_id, sessionStorage, (command: Command) => request('games/factory-empire/commands', command))
        if (commands.hasPending) apply(await commands.retry())
        apply(await request('games/factory-empire/sync', {}), true)
        notice(celebration || 'Guardado en el servidor'); celebration = ''
      } catch (error) {notice(error instanceof Error ? error.message : 'Sin conexión. Reintenta.', false, true)} finally {busy = false}
    }
    function confirm(result: CommandResult, submitted: FactoryAction) {
      if (submitted.kind === 'mine') clicks.settle(submitted.clicks, result.accepted_clicks)
      const feedback = toFactoryFeedback(result, submitted)
      if (feedback) send('OnFeedback', feedback)
      pendingEffect = undefined
    }
    function train(intent: string) {
      try {
        if (intent === 'train') {
          if (!latest?.state.fleet) throw new Error('Construye una nave para entrenar.')
          duelFleet = latest.state.fleet
          duel = startTrainingDuel(duelFleet)
        } else if (duel && duelFleet) duel = advanceTrainingDuel(duel, duelFleet, intent as DuelMove)
        if (duel) send('OnTraining', {...duel, message: duel.log.slice(-4).join('\n')})
      } catch (error) {send('OnTraining', {result: 'locked', message: error instanceof Error ? error.message : 'Entrenamiento no disponible.'})}
    }
    async function publicAction(id: string) {
      if (id === 'directory:refresh' || id === 'directory:next') {
        const cursor = id.endsWith('next') ? publicState.directory?.next_cursor : null
        if (id.endsWith('next') && !cursor) throw new Error('No hay otra página disponible.')
        publicState.directory = await request<PlanetDirectoryPage>(`planets?limit=24${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
      } else if (id === 'ranking:refresh' || id === 'ranking:next') {
        const cursor = id.endsWith('next') ? publicState.ranking?.next_cursor : null
        if (id.endsWith('next') && !cursor) throw new Error('No hay otra página disponible.')
        publicState.ranking = await request<LeaderboardPage>(`competition/leaderboard?limit=24${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
        publicState.competition = await request<CompetitionSummary>('competition')
      } else if (id.startsWith('visit:') && publicPlanetAllowed(publicState, id.slice(6))) {
        publicState.visit = await request<PlanetVisit>(`planets/${id.slice(6)}/visit`)
      } else throw new Error('Esta consulta ya no está disponible. Actualiza el directorio.')
      if (latest) apply(latest)
    }
    async function action(intent: ReturnType<typeof readFactoryIntent>, returning = false, actionId = '') {
      if (busy || !ready) return
      if (!commands) {await boot(); return}
      if (intent !== 'mine' && intent !== 'sync' && intent !== 'retry' && clicks.count > 0) {notice('Espera la confirmación de los toques antes de comprar.', true); return}
      busy = true; notice(intent === 'mine' ? `Guardando toques · ${clicks.count} en cola` : 'Guardando…', true)
      try {
        if (commands.hasPending) {
          if (intent !== 'retry') throw new Error('Hay una acción pendiente. Reintenta para recuperarla.')
          const result = await commands.retry()
          apply(result)
          if (pendingEffect) confirm(result, pendingEffect)
          apply(await request('games/factory-empire/sync', {}))
        } else if (intent === 'catalog' && /^(directory:|ranking:|visit:)/.test(actionId)) {
          await publicAction(actionId)
          notice(actionId.startsWith('visit:') ? 'Visita cargada: toca la imagen del planeta para leer su industria.' : 'Consulta local actualizada')
          return
        } else if (intent === 'sync' || intent === 'retry') {
          apply(await request('games/factory-empire/sync', {}), returning)
        } else {
          const submitted: FactoryAction | null = intent === 'mine' ? {kind: 'mine', clicks: clicks.take()} : intent === 'catalog' ? latest ? resolveFactoryAction(latest, actionId) : null : intent === 'upgrade' ? {kind: 'upgrade_click'} : {kind: 'buy_machine', machine_id: intent === 'drill' ? 'drill' : 'drone'}
          if (!submitted || submitted.kind === 'mine' && submitted.clicks === 0) {notice('Cotización actualizada. Revisa el catálogo.'); return}
          pendingEffect = submitted
          const result = await commands.submit(submitted)
          apply(result)
          confirm(result, submitted)
        }
        notice(celebration || 'Guardado en el servidor'); celebration = ''
      } catch (error) {
        if (error instanceof ApiError && error.code === 'click_limit' && error.result && pendingEffect?.kind === 'mine' && !commands.hasPending) {
          clicks.settle(pendingEffect.clicks, 0); pendingEffect = undefined
          apply(error.result); notice(`Esperando energía de extracción · ${clicks.count} toques en cola`)
          return
        }
        if (!commands.hasPending) {
          if (pendingEffect?.kind === 'mine') clicks.settle(pendingEffect.clicks, 0)
          pendingEffect = undefined
        }
        if (error instanceof ApiError && error.result) apply(error.result)
        notice(error instanceof Error ? error.message : 'Sin conexión. Reintenta.', false, true)
      } finally {busy = false}
    }
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return
      if (event.data?.channel === FACTORY_CHANNEL && event.data.version === 1 && event.data.build === FACTORY_BUILD && event.data.type === 'exit_expanded') {setExpanded(false); return}
      const intent = readFactoryIntent(event.data)
      if (!intent) return
      if (intent === 'ready') {ready = true; void boot()}
      else if (['train', 'attack', 'guard', 'repair'].includes(intent)) train(intent)
      else if (intent === 'mine') {
        if (!ready || !commands || blocked) return
        if (!clicks.enqueue()) {send('OnStatus', {message: 'Cola llena. Espera la confirmación de tus toques.', busy, error: false, queued: clicks.count}); return}
        send('OnStatus', {message: `Extracción pendiente · ${clicks.count} toques`, busy, error: false, queued: clicks.count})
      } else void action(intent, false, event.data.actionId)
    }
    retryRef.current = () => {if (ready) void action('retry'); else if (frame.current) frame.current.src = `/games/factory-empire/${FACTORY_BUILD}/index.html`}
    const returning = () => {if (!document.hidden && ready) void action('sync', true)}
    window.addEventListener('message', receive); document.addEventListener('visibilitychange', returning)
    if (frame.current) frame.current.src = `/games/factory-empire/${FACTORY_BUILD}/index.html`
    const poll = setInterval(() => {if (!document.hidden && ready && commands && !commands.hasPending && clicks.count === 0) void action('sync')}, 5000)
    const flush = setInterval(() => {if (!disposed && ready && commands && !blocked && clicks.count > 0 && !commands.hasPending) void action('mine')}, 250)
    const timeout = setTimeout(() => {if (!ready) notice('La carga está tardando. Comprueba la build y reintenta.', false, true)}, 90000)
    return () => {disposed = true; clearInterval(poll); clearInterval(flush); clearTimeout(timeout); window.removeEventListener('message', receive); document.removeEventListener('visibilitychange', returning)}
  }, [])
  return <section aria-label="Factory Empire en Unity" className={expanded ? styles.expanded : styles.player}>
    <div className={styles.toolbar}><span role={failed ? 'alert' : 'status'}>{status}</span>{failed && <button className={styles.tool} onClick={() => retryRef.current()}>Reintentar conexión</button>}<button className={styles.tool} aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Salir de vista ampliada' : 'Ampliar juego'}</button></div>
    <div className={styles.game}><iframe ref={frame} title="Factory Empire · Nereida-7 · Unity" sandbox="allow-scripts allow-same-origin" className="h-full w-full border-0" /></div>
    {!expanded && <><p className="text-xs text-muted-foreground">Extrae y abre Explorar para máquinas, tecnologías, objetivos, evolución, universo y legado. Flechas y Enter para navegar; Esc sale de la vista ampliada.</p>{view && <p className="text-xs text-muted-foreground">Ferrite <strong data-testid="factory-balance">{view.ferrite}</strong> · <span data-testid="factory-rate">{view.rate}</span>/s · Drones <span data-testid="factory-drones">{view.droneOwned}</span></p>}</>}
    {expanded && view && <span className="sr-only">Ferrite <strong data-testid="factory-balance">{view.ferrite}</strong> · <span data-testid="factory-rate">{view.rate}</span>/s · Drones <span data-testid="factory-drones">{view.droneOwned}</span></span>}
  </section>
}
