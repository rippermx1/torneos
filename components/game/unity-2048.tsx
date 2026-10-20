'use client'
import Link from 'next/link'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { parseUnity2048Input, UNITY_2048_BUILD, UNITY_2048_CHANNEL,
  Unity2048Session, type TournamentUnityConfig, type Unity2048State } from '@/lib/game/unity-2048-session'
import { requestGameJson } from '@/lib/game/game-json-request'
import { focusUnity2048, isolateUnity2048, moveUnity2048Focus, parseUnity2048Navigation } from '@/lib/game/unity-2048-navigation'
import styles from './unity-2048.module.css'
import { Game2048Result, Training2048View } from './2048-game-result'
import type { Direction } from '@/lib/game/engine'
import type { Practice2048Snapshot } from '@/lib/game/practice-2048-experience'
import { Free2048Experience, type Free2048Snapshot } from '@/lib/game/free-2048-experience'
import { readDaily2048Challenge, type Daily2048Challenge } from '@/lib/game/daily-2048'
import { Personal2048ProgressView } from './2048-personal-progress'
import { Daily2048View, Return2048View } from './2048-daily-progress'
import { RewardedController, type RewardedSnapshot } from '@/lib/ads/rewarded'
import { Practice2048Recovery, type Practice2048RecoverySnapshot } from '@/lib/game/practice-2048-recovery'
import { Load2048Diagnostics } from '@/lib/game/2048-load-diagnostics'
import { Load2048DiagnosticsView } from './2048-load-diagnostics'

const ENTRY = `/games/2048/${UNITY_2048_BUILD}/index.html`
export function Unity2048({ tournament, observationCategory = 'observed_browser', measureAccountActivity = false }: {
  tournament?: TournamentUnityConfig; observationCategory?: 'observed_browser' | 'synthetic'; measureAccountActivity?: boolean
}) {
  const guideId = useId(), controlsId = `${guideId}-controls`, statusId = `${guideId}-status`
  const frame = useRef<HTMLIFrameElement>(null), viewport = useRef<HTMLDivElement>(null)
  const session = useRef<Unity2048Session>(null)
  const shell = useRef<HTMLElement>(null), viewControl = useRef<HTMLButtonElement>(null)
  const [generation, setGeneration] = useState(0), [ready, setReady] = useState(false)
  const [failure, setFailure] = useState(''), [progress, setProgress] = useState(0)
  const [state, setState] = useState<Unity2048State | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [personal, setPersonal] = useState<Practice2048Snapshot | null>(null)
  const [free, setFree] = useState<Free2048Snapshot | null>(null)
  const [dailyChallenge, setDailyChallenge] = useState<Daily2048Challenge | null>(null)
  const [dailyError, setDailyError] = useState(''), [dailyRefresh, setDailyRefresh] = useState(0)
  const [trainingNotice, setTrainingNotice] = useState('')
  const [rewardedState, setRewardedState] = useState<RewardedSnapshot | null>(null)
  const [recoveryState, setRecoveryState] = useState<Practice2048RecoverySnapshot | null>(null)
  const [loadDiagnosticsState, setLoadDiagnosticsState] = useState<ReturnType<Load2048Diagnostics['snapshot']> | null>(null)
  const [loadDiagnosticsId, setLoadDiagnosticsId] = useState<string | null>(null)
  const experience = useRef<Free2048Experience | null>(null)
  const dailyClock = useRef<{ serverNow: number; monotonicAt: number; confirmed: boolean } | null>(null)
  const rewarded = useRef<RewardedController | null>(null)
  const recovery = useRef<Practice2048Recovery | null>(null)
  const loadDiagnostics = useRef<Load2048Diagnostics | null>(null)
  const lastLoadAttempt = useRef<string | null>(null)
  const isTournament = !!tournament
  const assisted = !isTournament && !!state?.training && (state.training.phase === 'active' || state.training.phase === 'ended')
  const canResumePractice = !isTournament && !state?.started && !state?.game_over && !state?.training
    && state?.mode !== 'tournament' && free?.mode !== 'daily'
  const startUrl = tournament?.startUrl, moveUrl = tournament?.moveUrl, timeoutUrl = tournament?.timeoutUrl
  const existingGameId = tournament?.existingGameId, leaderboardUrl = tournament?.leaderboardUrl, presetKey = tournament?.presetKey
  useEffect(() => {
    if (isTournament) return
    const controller = new AbortController()
    let alive = true, loading = false, boundary: ReturnType<typeof setTimeout> | undefined
    const refreshTrainingAvailability = () => {
      const next = session.current?.snapshot()
      if (alive && next?.training?.phase === 'offered' && rewarded.current) setRewardedState(rewarded.current.snapshot(next.training.sourceId))
    }
    const load = async () => {
      if (loading) return
      loading = true
      try {
        const response = await fetch('/api/2048/daily', { cache: 'no-store', credentials: 'same-origin',
          redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) })
        const challenge = response.ok ? readDaily2048Challenge(await response.json()) : null
        if (!challenge) throw new Error('Daily unavailable')
        if (!alive) return
        dailyClock.current = { serverNow: challenge.serverNow, monotonicAt: performance.now(), confirmed: true }
        setDailyChallenge(challenge); setDailyError(''); experience.current?.setToday(challenge)
        clearTimeout(boundary)
        boundary = setTimeout(() => { if (dailyClock.current) dailyClock.current.confirmed = false; experience.current?.refresh(); void load() }, Math.max(1, challenge.closesAt - challenge.serverNow))
      } catch { if (alive) setDailyError('No pudimos cargar el desafío de hoy. La práctica libre sigue disponible.') }
      finally { loading = false; refreshTrainingAvailability() }
    }
    void load()
    const timer = setInterval(() => void load(), 60000)
    const resumeDaily = () => {
      if (dailyClock.current) dailyClock.current.confirmed = false
      experience.current?.refresh()
      if (document.visibilityState === 'visible') { refreshTrainingAvailability(); void load() }
    }
    document.addEventListener('visibilitychange', resumeDaily)
    window.addEventListener('pageshow', resumeDaily)
    return () => { alive = false; controller.abort(); clearInterval(timer); clearTimeout(boundary); document.removeEventListener('visibilitychange', resumeDaily); window.removeEventListener('pageshow', resumeDaily) }
  }, [isTournament, dailyRefresh])
  useEffect(() => {
    if (!fullscreen || !shell.current) return
    const root = shell.current
    const returnControl = viewControl.current
    const restore = isolateUnity2048(root)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (ready && !failure) focusUnity2048(frame.current)
    else returnControl?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setFullscreen(false) }
      if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault(); moveUnity2048Focus(root, document.activeElement, event.shiftKey, true)
      }
    }
    root.addEventListener('keydown', keyboard)
    return () => {
      restore(); document.body.style.overflow = previous; root.removeEventListener('keydown', keyboard)
      returnControl?.focus()
    }
  }, [fullscreen, ready, failure])
  useLayoutEffect(() => {
    let alive = true, loaded = false, failed = false
    let rewardController: RewardedController | null = null
    let recoveryController: Practice2048Recovery | null = null
    const diagnostic = !isTournament ? new Load2048Diagnostics({ getStorage: () => window.localStorage,
      category: observationCategory, changed: next => { if (alive) setLoadDiagnosticsState(next) } }) : null
    loadDiagnostics.current = diagnostic
    diagnostic?.begin(generation > 0 ? lastLoadAttempt.current : null)
    lastLoadAttempt.current = diagnostic?.currentId() ?? null
    setLoadDiagnosticsId(lastLoadAttempt.current)
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const publish = (next: Unity2048State) => {
      if (!alive) return
      setState(next)
      recoveryController?.capture()
      if (next.training?.phase === 'offered' && rewardController) setRewardedState(rewardController.snapshot(next.training.sourceId))
      frame.current?.contentWindow?.postMessage({ channel: UNITY_2048_CHANNEL, version:1, type:'platform.state', state:{...next, reduced_motion:motionPreference.matches} }, location.origin)
    }
    const config = startUrl && moveUrl && timeoutUrl ? { startUrl, moveUrl, timeoutUrl, existingGameId, leaderboardUrl, presetKey } : undefined
    const practice = config ? null : new Free2048Experience({ getStorage: () => window.localStorage,
      category: observationCategory, measureAccountActivity,
      dailyNow: () => dailyClock.current ? Math.floor(dailyClock.current.serverNow + performance.now() - dailyClock.current.monotonicAt) : Date.now(),
      dailyAvailable: () => dailyClock.current?.confirmed === true,
      changed: value => { if (alive) { setPersonal(value.personal); setFree(value) } } })
    experience.current = practice
    const current = new Unity2048Session(publish, requestGameJson, config, undefined, practice ? event => {
      practice.observe(event)
      if (event.type === 'start' && event.practiceId && !event.assisted) diagnostic?.linkPractice(event.practiceId, 'new', practice.snapshot().mode)
    } : undefined); session.current = current
    if (practice) {
      recoveryController = new Practice2048Recovery({ session: current, experience: practice,
        getStorage: () => window.localStorage, category: observationCategory,
        changed: next => { if (alive) setRecoveryState(next) } })
      recovery.current = recoveryController
      rewardController = new RewardedController({ mode: 'demo', category: observationCategory, getStorage: () => window.localStorage,
        isEligible: sourceId => {
          const next = current.snapshot()
          return alive && !failed && next.mode === 'practice' && next.game_over && next.training?.phase === 'offered' && next.training.sourceId === sourceId
        },
        grant: sourceId => alive && !failed && current.beginTrainingDemo(sourceId),
        changed: next => { if (alive) setRewardedState(next) }, observe: practice.observeRewarded })
      rewarded.current = rewardController
    }
    const timer = setTimeout(() => {
      if (!loaded && !failed) { failed = true; diagnostic?.fail('timeout'); recoveryController?.destroy(); rewardController?.invalidate(); setFailure('No se pudo cargar Unity. Puedes reintentar la carga.') }
    }, 90000)
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || !frame.current?.contentWindow || event.source !== frame.current.contentWindow) return
      const data = event.data
      const navigation = parseUnity2048Navigation(data)
      if (navigation) {
        if (navigation.key === 'Escape') { setFullscreen(false); viewControl.current?.focus() }
        else if (shell.current) moveUnity2048Focus(shell.current, frame.current, navigation.shift, shell.current.dataset.view === 'expanded')
        return
      }
      if (data?.channel === UNITY_2048_CHANNEL && data.version === 1 && data.type === 'game.loading') {
        if (typeof data.progress === 'number') setProgress(Math.max(0, Math.min(100, Math.round(data.progress * 100))))
        return
      }
      if (data?.channel === UNITY_2048_CHANNEL && data.version === 1 && data.type === 'game.error') {
        if (failed) return
        failed = true; diagnostic?.fail('error'); clearTimeout(timer); recoveryController?.destroy(); rewardController?.invalidate(); setFailure('Unity no pudo cargar. Reintenta la carga.'); return
      }
      const input = parseUnity2048Input(data)
      if (input === 'ready') {
        if (loaded || failed) return
        loaded = true; clearTimeout(timer); diagnostic?.ready(); setReady(true); setFailure(''); practice?.ready(); recoveryController?.ready(); setPersonal(practice?.snapshot().personal ?? null); setFree(practice?.snapshot() ?? null); publish(current.snapshot())
        if (config?.existingGameId) void current.recover()
      } else if (input && loaded && !failed && !recoveryController?.snapshot().pending) void current.move(input)
    }
    window.addEventListener('message', receive)
    // A warm WebGL cache can load before hydration installs the message listener.
    // Start the iframe only after the bridge exists; retries install it during commit.
    if (frame.current) frame.current.src = ENTRY
    const updateMotion = () => publish(current.snapshot())
    motionPreference.addEventListener('change', updateMotion)
    const clock = setInterval(() => void current.tick(), 1000)
    const resume = () => {
      practice?.visibility(document.visibilityState === 'visible')
      if (document.visibilityState === 'visible') void current.resynchronizeTime()
    }
    const restore = (event: PageTransitionEvent) => { if (event.persisted) resume() }
    const checkpoint = () => { diagnostic?.leave(); recoveryController?.capture(); practice?.checkpoint() }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pageshow', restore)
    window.addEventListener('pagehide', checkpoint)
    return () => { alive = false; diagnostic?.leave(); loadDiagnostics.current = null; recoveryController?.capture(); recoveryController?.destroy(); recovery.current = null; rewardController?.destroy(); rewarded.current = null; practice?.checkpoint(); experience.current = null; current.destroy(); session.current = null; clearTimeout(timer); clearInterval(clock); window.removeEventListener('message',receive); motionPreference.removeEventListener('change',updateMotion); document.removeEventListener('visibilitychange',resume); window.removeEventListener('pageshow',restore); window.removeEventListener('pagehide',checkpoint) }
  }, [generation,startUrl,moveUrl,timeoutUrl,existingGameId,leaderboardUrl,presetKey,observationCategory,measureAccountActivity,isTournament])
  const startFree = async (mode: 'practice' | 'daily') => {
    if (recovery.current?.snapshot().pending) return
    rewarded.current?.invalidate()
    if (!experience.current?.selectNext(mode, dailyChallenge)) { setDailyError('El desafío cambió o está cerrado. Actualiza el desafío para jugar el de hoy.'); return }
    setTrainingNotice('')
    const seed = mode === 'daily' ? dailyChallenge?.seed : undefined
    if (recovery.current) await recovery.current.start(mode, seed)
    else void session.current?.start(seed, { freeMode: mode })
    requestAnimationFrame(() => focusUnity2048(frame.current))
  }
  const resumePractice = async () => {
    if (!canResumePractice || !ready || failure || recovery.current?.snapshot().pending) return
    rewarded.current?.invalidate(); setTrainingNotice('')
    const controller = recovery.current, practice = experience.current, diagnostic = loadDiagnostics.current
    if (await controller?.resume() && controller === recovery.current && practice === experience.current) {
      if (diagnostic) {
        const id = practice?.practiceCheckpointMetadata()?.practiceId
        if (id) diagnostic.linkPractice(id, 'resumed', 'practice')
      }
      requestAnimationFrame(() => focusUnity2048(frame.current))
    }
  }
  const beginTraining = (sourceId: string) => {
    if (tournament || free?.mode !== 'practice') return
    if (!rewarded.current) {
      setTrainingNotice('No pudimos preparar la demostración. Puedes iniciar una nueva partida sin ayuda.')
      return
    }
    setTrainingNotice('')
    void rewarded.current.request(sourceId)
  }
  const continueTraining = (requestId: string) => {
    const controller = rewarded.current
    if (tournament || free?.mode !== 'practice' || !controller) return
    void controller.completeDemo(requestId).then(granted => {
      if (granted && rewarded.current === controller) requestAnimationFrame(() => focusUnity2048(frame.current))
    })
  }
  const cancelTraining = (requestId: string) => {
    rewarded.current?.cancelPending(requestId)
  }
  const tryTrainingDirection = (direction: Direction) => {
    const current = session.current
    if (tournament || free?.mode !== 'practice' || current?.snapshot().training?.phase !== 'active') return
    void current.move(direction).then(() => {
      if (!current.snapshot().game_over) requestAnimationFrame(() => focusUnity2048(frame.current))
    })
  }
  const exportObservations = () => {
    const data = experience.current?.exportJson(loadDiagnostics.current?.snapshot())
    if (!data) return
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'torneos-2048-observacion-local.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const exportLoadDiagnostics = () => {
    const diagnostic = loadDiagnostics.current
    if (!diagnostic) return
    const data = experience.current?.exportJson(diagnostic.snapshot()) ?? diagnostic.exportJson()
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'torneos-2048-diagnostico-carga.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section ref={shell} className={`${styles.shell} ${fullscreen ? styles.expanded : ''}`} role={fullscreen ? 'dialog' : undefined} aria-modal={fullscreen ? true : undefined} aria-label="2048 en Unity" data-view={fullscreen ? 'expanded' : 'normal'}>
    <div className={styles.toolbar} aria-label="Controles de la plataforma">
      <p className="sr-only" role="status" aria-atomic="true">{ready && state?.started && !failure ? `${assisted ? 'Puntaje del entrenamiento' : 'Puntaje'}: ${state.score.toLocaleString('es-CL')}` : ''}</p>
      {canResumePractice && recoveryState?.checkpoint && recoveryState.status === 'ready' && <button type="button" disabled={!ready || !!failure || recoveryState.pending} className={styles.action} onClick={() => resumePractice()}>Continuar práctica</button>}
      {!tournament && <button type="button" disabled={!ready || !state?.can_restart || !!failure || recoveryState?.pending} className={styles.action} onClick={() => void startFree('practice')}>{assisted ? 'Nueva partida sin ayuda' : free?.mode === 'daily' ? 'Práctica libre' : state?.started || recoveryState?.checkpoint ? 'Nueva partida' : 'Iniciar partida'}</button>}
      {!tournament && <button type="button" disabled={!ready || !!failure || recoveryState?.pending || !dailyChallenge || !free?.dailyTimeConfirmed} className={styles.action} onClick={() => void startFree('daily')}>{free?.mode === 'daily' && free.challenge?.id === dailyChallenge?.id ? 'Reintentar desafío' : 'Jugar desafío de hoy'}</button>}
      {tournament && ready && !failure && !state?.started && !existingGameId && <button type="button" className={styles.action} onClick={() => { void session.current?.start(); focusUnity2048(frame.current) }}>Iniciar partida</button>}
      {tournament && ready && !failure && state?.can_recover && <button type="button" className={styles.action} onClick={() => void session.current?.recover()}>Recuperar partida</button>}
      {tournament && state?.started && state.time_left_seconds >= 0 && <p className={styles.clock} aria-label="Tiempo restante">Tiempo {Math.floor(state.time_left_seconds / 60).toString().padStart(2,'0')}:{(state.time_left_seconds % 60).toString().padStart(2,'0')}</p>}
      {assisted && <><span className={styles.trainingBadge}>Entrenamiento · partida asistida</span><span className={styles.trainingDemo}>Demostración sin anuncios</span></>}
      <button ref={viewControl} type="button" className={`${styles.action} ${styles.viewAction}`} aria-expanded={fullscreen} onClick={() => setFullscreen(value => !value)}>{fullscreen ? 'Volver a la página' : 'Ampliar juego'}</button>
    </div>
    <div ref={viewport} className={styles.viewport} aria-busy={!ready && !failure} aria-describedby={!ready && !failure ? statusId : undefined}>
      <iframe key={generation} ref={frame} title="2048 · Unity" aria-describedby={controlsId} tabIndex={ready && !failure && !state?.game_over ? 0 : -1} inert={!ready || !!failure || !!state?.game_over} sandbox="allow-scripts allow-same-origin" allow="fullscreen" className={styles.frame} />
      {ready && !failure && state?.game_over && <Game2048Result state={state} tournament={tournament}
        personal={free?.mode === 'daily' ? null : personal} daily={free?.mode === 'daily' ? free.daily : undefined}
        dailyChallenge={free?.mode === 'daily' ? free.challenge : null}
        restartDisabled={free?.mode === 'daily' && (!dailyChallenge || !free.dailyTimeConfirmed)}
        freeMode={free?.mode} onBeginTraining={beginTraining} rewarded={rewardedState}
        onContinueRewarded={continueTraining} onCancelRewarded={cancelTraining}
        onRestart={() => { if (!tournament) startFree(assisted ? 'practice' : free?.mode ?? 'practice') }} />}
      {!ready && !failure && <div className="absolute inset-0 flex items-center justify-center text-[#193337]" role="progressbar" aria-label="Carga de 2048" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>Cargando Unity… {progress}%</div>}
      {failure && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#f6f5f0] p-8 text-center text-[#193337]"><p role="alert">{failure}</p><button type="button" className="rounded-lg border px-4 py-2" onClick={() => { rewarded.current?.invalidate(); setFailure(''); setReady(false); setProgress(0); setGeneration(x=>x+1) }}>Reintentar carga</button></div>}
    </div>
    <div className={styles.feedback} aria-label="Estado de la partida">
      <p id={statusId} role="status" aria-atomic="true">{state?.message ?? 'Cargando 2048. El juego estará disponible al terminar la carga.'}</p>
      {!tournament && <Load2048DiagnosticsView snapshot={loadDiagnosticsState} currentId={loadDiagnosticsId} onExport={exportLoadDiagnostics} />}
      {trainingNotice && <p role="alert">{trainingNotice}</p>}
      {!tournament && recoveryState && <p role="status" aria-live="polite">
        {recoveryState.pending ? 'Preparando práctica…' : recoveryState.status === 'busy'
          ? 'La práctica guardada está abierta en otra pestaña. Puedes iniciar una práctica nueva sin guardar o cerrar la otra pestaña y recargar.'
          : recoveryState.status === 'stale' ? 'La práctica guardada ya no se puede continuar. Puedes iniciar una nueva.'
          : recoveryState.status !== 'ready' ? 'No podemos guardar ni recuperar la práctica en este navegador. Puedes seguir jugando sin guardado.'
          : recoveryState.checkpoint ? state?.started ? 'Práctica guardada en este navegador. Puedes continuarla después de recargar.'
            : 'Tienes una práctica guardada en este navegador. Continúala o elige una nueva partida.'
          : 'La práctica libre se guarda en este navegador mientras juegas. El diario y el entrenamiento se mantienen separados.'}
      </p>}
      {!tournament && free?.mode !== 'daily' && state?.training?.phase === 'active' && <Training2048View training={state.training}
        onAlternative={tryTrainingDirection} disabled={!ready || !!failure || state.locked} />}
      {tournament && state?.game_over && leaderboardUrl && <Link href={leaderboardUrl} className={styles.action}>Ver ranking</Link>}
      {!tournament && <>
        <Daily2048View challenge={dailyChallenge} free={free} error={dailyError} onRefresh={() => setDailyRefresh(value => value + 1)} />
        <Personal2048ProgressView progress={personal} onExport={exportObservations} />
        {assisted && <p className={styles.trainingHistoryNote}>Las marcas e historial que ves corresponden a partidas sin ayuda. Este entrenamiento no los modifica.</p>}
        <Return2048View free={free} measureAccountActivity={measureAccountActivity} />
      </>}
      <details className={styles.instructions}>
        <summary>Cómo jugar</summary>
        <div>
          <p>Une fichas del mismo número para sumar puntos: dos fichas de 2 forman una de 4. Cada movimiento desplaza todo el tablero; sigue jugando mientras queden movimientos.</p>
          <p id={controlsId}>Activa «Iniciar partida». Usa las flechas o WASD para mover; en el teléfono, desliza sobre el tablero. Tab permite salir del tablero y Escape vuelve a los controles de la plataforma.</p>
          <p>{tournament ? 'En torneo tienes una sola partida. El tiempo restante y el resultado aparecen en la plataforma.' : 'En práctica puedes comenzar de nuevo con «Nueva partida».'} Después de iniciar, «Consultar tablero» permite leer las casillas y el puntaje.</p>
        </div>
      </details>
      {state?.started && state.cells?.length === 16 && <details className={styles.boardDescription}>
        <summary>Consultar tablero</summary>
        <table aria-live="off">
          <caption>Tablero confirmado · puntaje {state.score.toLocaleString('es-CL')}</caption>
          <thead><tr><th scope="col">Fila</th>{[1,2,3,4].map(column => <th scope="col" key={column}>Columna {column}</th>)}</tr></thead>
          <tbody>{[0,1,2,3].map(row => <tr key={row}><th scope="row">{row + 1}</th>{state.cells.slice(row * 4, row * 4 + 4).map((value, column) => <td key={column}>{value || 'Vacía'}</td>)}</tr>)}</tbody>
        </table>
      </details>}
    </div>
  </section>
}
