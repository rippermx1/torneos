'use client'
import Link from 'next/link'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { parseUnity2048Input, UNITY_2048_BUILD, UNITY_2048_CHANNEL,
  Unity2048Session, type TournamentUnityConfig, type Unity2048State } from '@/lib/game/unity-2048-session'
import { requestGameJson } from '@/lib/game/game-json-request'
import styles from './unity-2048.module.css'

const ENTRY = `/games/2048/${UNITY_2048_BUILD}/index.html`
export function Unity2048({ tournament }: { tournament?: TournamentUnityConfig }) {
  const frame = useRef<HTMLIFrameElement>(null), viewport = useRef<HTMLDivElement>(null)
  const session = useRef<Unity2048Session>(null)
  const [generation, setGeneration] = useState(0), [ready, setReady] = useState(false)
  const [failure, setFailure] = useState(''), [progress, setProgress] = useState(0)
  const [state, setState] = useState<Unity2048State | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const startUrl = tournament?.startUrl, moveUrl = tournament?.moveUrl, timeoutUrl = tournament?.timeoutUrl
  const existingGameId = tournament?.existingGameId, leaderboardUrl = tournament?.leaderboardUrl
  useEffect(() => {
    frame.current?.focus()
    if (!fullscreen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', escape)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', escape) }
  }, [fullscreen])
  useLayoutEffect(() => {
    let alive = true, loaded = false
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const publish = (next: Unity2048State) => {
      if (!alive) return
      setState(next)
      frame.current?.contentWindow?.postMessage({ channel: UNITY_2048_CHANNEL, version:1, type:'platform.state', state:{...next, reduced_motion:motionPreference.matches} }, location.origin)
    }
    const config = startUrl && moveUrl && timeoutUrl ? { startUrl, moveUrl, timeoutUrl, existingGameId, leaderboardUrl } : undefined
    const current = new Unity2048Session(publish, requestGameJson, config); session.current = current
    const timer = setTimeout(() => { if (!loaded) setFailure('No se pudo cargar Unity. Puedes reintentar la carga.') }, 90000)
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || !frame.current?.contentWindow || event.source !== frame.current.contentWindow) return
      const data = event.data
      if (data?.channel === UNITY_2048_CHANNEL && data.version === 1 && data.type === 'game.loading') {
        if (typeof data.progress === 'number') setProgress(Math.max(0, Math.min(100, Math.round(data.progress * 100))))
        return
      }
      if (data?.channel === UNITY_2048_CHANNEL && data.version === 1 && data.type === 'game.error') {
        setFailure('Unity no pudo cargar. Reintenta la carga.'); return
      }
      const input = parseUnity2048Input(data)
      if (input === 'ready') {
        if (loaded) return
        loaded = true; clearTimeout(timer); setReady(true); setFailure(''); publish(current.snapshot())
        if (config?.existingGameId) void current.recover()
      } else if (input) void current.move(input)
    }
    window.addEventListener('message', receive)
    // A warm WebGL cache can load before hydration installs the message listener.
    // Start the iframe only after the bridge exists; retries install it during commit.
    if (frame.current) frame.current.src = ENTRY
    const updateMotion = () => publish(current.snapshot())
    motionPreference.addEventListener('change', updateMotion)
    const clock = setInterval(() => void current.tick(), 1000)
    const resume = () => { if (document.visibilityState === 'visible') void current.resynchronizeTime() }
    const restore = (event: PageTransitionEvent) => { if (event.persisted) resume() }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pageshow', restore)
    return () => { alive = false; current.destroy(); session.current = null; clearTimeout(timer); clearInterval(clock); window.removeEventListener('message',receive); motionPreference.removeEventListener('change',updateMotion); document.removeEventListener('visibilitychange',resume); window.removeEventListener('pageshow',restore) }
  }, [generation,startUrl,moveUrl,timeoutUrl,existingGameId,leaderboardUrl])
  return <section className={`${styles.shell} ${fullscreen ? styles.expanded : ''}`} aria-label="2048 en Unity" data-view={fullscreen ? 'expanded' : 'normal'}>
    <div className={styles.toolbar} aria-label="Controles de la plataforma">
      <p className="sr-only" aria-live="polite">{state ? `Puntaje: ${state.score.toLocaleString('es-CL')}` : `Cargando juego ${progress}%`}</p>
      {!tournament && <button type="button" disabled={!ready || !state?.can_restart || !!failure} className={styles.action} onClick={() => { void session.current?.start(); frame.current?.focus() }}>{state?.started ? 'Nueva partida' : 'Iniciar partida'}</button>}
      {tournament && ready && !failure && !state?.started && !existingGameId && <button type="button" className={styles.action} onClick={() => { void session.current?.start(); frame.current?.focus() }}>Iniciar partida</button>}
      {tournament && ready && !failure && state?.can_recover && <button type="button" className={styles.action} onClick={() => void session.current?.recover()}>Recuperar partida</button>}
      {tournament && state?.started && state.time_left_seconds >= 0 && <p className={styles.clock} aria-label="Tiempo restante">Tiempo {Math.floor(state.time_left_seconds / 60).toString().padStart(2,'0')}:{(state.time_left_seconds % 60).toString().padStart(2,'0')}</p>}
      <button type="button" className={`${styles.action} ${styles.viewAction}`} aria-expanded={fullscreen} onClick={() => setFullscreen(value => !value)}>{fullscreen ? 'Volver a la página' : 'Ampliar juego'}</button>
    </div>
    <div ref={viewport} className={styles.viewport}>
      <iframe key={generation} ref={frame} title="2048 · Unity" sandbox="allow-scripts allow-same-origin" allow="fullscreen" className={styles.frame} />
      {!ready && !failure && <div className="absolute inset-0 flex items-center justify-center text-[#193337]" role="status">Cargando Unity… {progress}%</div>}
      {failure && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#f6f5f0] p-8 text-center text-[#193337]"><p role="alert">{failure}</p><button type="button" className="rounded-lg border px-4 py-2" onClick={() => { setFailure(''); setReady(false); setProgress(0); setGeneration(x=>x+1) }}>Reintentar carga</button></div>}
    </div>
    <div className={styles.feedback} aria-label="Estado de la partida">
      <p role="status" aria-live="polite">{state?.message ?? 'El juego estará disponible al terminar la carga.'}</p>
      {tournament && state?.game_over && leaderboardUrl && <Link href={leaderboardUrl} className={styles.action}>Ver ranking</Link>}
    </div>
  </section>
}
