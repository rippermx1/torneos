'use client'
import Link from 'next/link'
import { requestGameJson } from '@/lib/game/game-json-request'
import { useEffect, useRef, useState } from 'react'
import { parseUnity2048Input, UNITY_2048_BUILD, UNITY_2048_CHANNEL,
  Unity2048Session, type TournamentUnityConfig, type Unity2048State } from '@/lib/game/unity-2048-session'

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
  useEffect(() => {
    let alive = true, loaded = false
    const publish = (next: Unity2048State) => {
      if (!alive) return
      setState(next)
      frame.current?.contentWindow?.postMessage({ channel: UNITY_2048_CHANNEL, version:1, type:'platform.state', state:next }, location.origin)
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
        if (!config) void current.start()
      } else if (input === 'restart') { if (!config) void current.start() }
      else if (input) void current.move(input)
    }
    window.addEventListener('message', receive)
    const clock = setInterval(() => void current.tick(), 1000)
    const resume = () => { if (document.visibilityState === 'visible') void current.resynchronizeTime() }
    const restore = (event: PageTransitionEvent) => { if (event.persisted) resume() }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pageshow', restore)
    return () => { alive = false; current.destroy(); session.current = null; clearTimeout(timer); clearInterval(clock); window.removeEventListener('message',receive); document.removeEventListener('visibilitychange',resume); window.removeEventListener('pageshow',restore) }
  }, [generation,startUrl,moveUrl,timeoutUrl,existingGameId,leaderboardUrl])
  return <section className="space-y-3" aria-label="2048 en Unity">
    <div className="flex items-center justify-between gap-3 text-sm">
      <p aria-live="polite">{state ? `Puntaje: ${state.score.toLocaleString('es-CL')}` : `Cargando juego ${progress}%`}</p>
      <button type="button" className="border rounded-lg px-3 py-2" onClick={() => setFullscreen(true)}>Ampliar juego</button>
    </div>
    <div ref={viewport} className={fullscreen ? 'fixed inset-0 z-[100] flex h-dvh w-screen items-center justify-center overflow-hidden bg-[#102b31]' : 'relative mx-auto w-full max-w-[680px] overflow-hidden rounded-2xl bg-[#102b31]'} style={fullscreen ? undefined : {aspectRatio:'4 / 5'}}>
      <iframe key={generation} ref={frame} src={ENTRY} title="2048 · Unity" sandbox="allow-scripts allow-same-origin" allow="fullscreen" className="h-full w-full border-0" style={fullscreen ? {width:'min(100vw, 80dvh)',height:'min(125vw, 100dvh)'} : undefined} />
      {fullscreen && <button type="button" className="absolute right-3 top-3 rounded-lg bg-[#102b31] px-3 py-2 text-white" onClick={() => setFullscreen(false)}>Volver a la página</button>}
      {!ready && !failure && <div className="absolute inset-0 flex items-center justify-center text-white" role="status">Cargando Unity… {progress}%</div>}
      {failure && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#102b31] p-8 text-center text-white"><p role="alert">{failure}</p><button type="button" className="rounded-lg border px-4 py-2" onClick={() => { setFailure(''); setReady(false); setProgress(0); setGeneration(x=>x+1) }}>Reintentar carga</button></div>}
    </div>
    {tournament && ready && !state?.started && !existingGameId && <button type="button" className="rounded-lg bg-foreground px-5 py-3 text-background disabled:opacity-50" onClick={() => void session.current?.start()}>Iniciar partida</button>}
    {tournament && ready && state?.locked && !state.game_over && (state.started || existingGameId) && <button type="button" className="rounded-lg border px-4 py-2" onClick={() => void session.current?.recover()}>Recuperar partida</button>}
    {tournament && state?.game_over && leaderboardUrl && <Link href={leaderboardUrl} className="inline-block rounded-lg border px-4 py-2">Ver ranking</Link>}
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{state?.message ?? 'El juego estará disponible al terminar la carga.'}</p>
  </section>
}
