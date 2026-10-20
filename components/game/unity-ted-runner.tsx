'use client'
import {useEffect,useRef,useState} from 'react'
import {ALIEN_RUN_BUILD,ALIEN_RUN_RULES,createAlienPracticeConfig,parseAlienResult,type AlienPracticeResult} from '@/lib/game/alien-run-client'

export function UnityTedRunner() {
  const frame=useRef<HTMLIFrameElement>(null),viewport=useRef<HTMLDivElement>(null),run=useRef('')
  const [ready,setReady]=useState(false),[playing,setPlaying]=useState(false),[error,setError]=useState('')
  const [generation,setGeneration]=useState(0),[fullscreen,setFullscreen]=useState(false),[result,setResult]=useState<AlienPracticeResult|null>(null)
  useEffect(()=>{
    let loaded=false
    const timer=setTimeout(()=>{if(!loaded)setError('El juego tardó demasiado en cargar. Reintenta la carga.')},90000)
    const receive=(e:MessageEvent)=>{
      if(e.origin!==location.origin || !frame.current?.contentWindow || e.source!==frame.current.contentWindow) return
      const d=e.data
      if(!d || d.channel!=='orbit.arcade' || d.version!==1) return
      if(d.type==='game.ready') {
        if(d.build_id!==ALIEN_RUN_BUILD || d.ruleset_version!==ALIEN_RUN_RULES) {setError('Esta versión del juego requiere una nueva carga.');return}
        loaded=true;clearTimeout(timer);setReady(true)
      } else if(d.type==='game.error') {setPlaying(false);setError('No se pudo completar la partida. Puedes iniciar otra práctica.')}
      else if(run.current) {const parsed=parseAlienResult(d,run.current);if(parsed){run.current='';setResult(parsed);setPlaying(false)}}
    }
    window.addEventListener('message',receive)
    return()=>{clearTimeout(timer);run.current='';window.removeEventListener('message',receive)}
  },[generation])
  useEffect(()=>{
    frame.current?.focus()
    if(!fullscreen)return
    const previous=document.body.style.overflow;document.body.style.overflow='hidden'
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setFullscreen(false)}
    window.addEventListener('keydown',escape)
    return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',escape)}
  },[fullscreen])
  const start=()=>{
    if(!ready || playing)return
    const config=createAlienPracticeConfig();run.current=config.run_id;setResult(null);setError('');setPlaying(true)
    frame.current?.contentWindow?.postMessage({channel:'orbit.arcade',version:1,type:'platform.start',config},location.origin)
    frame.current?.focus()
  }
  return <section className="space-y-4" aria-label="Ted Runner">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" disabled={!ready || playing} onClick={start} className="rounded-lg bg-foreground px-5 py-3 text-background disabled:opacity-50">{playing?'Partida en curso':result?'Jugar otra vez':'Jugar gratis'}</button>
      <button type="button" className="rounded-lg border px-4 py-2" onClick={()=>setFullscreen(true)}>Ampliar juego</button>
    </div>
    <div ref={viewport} className={fullscreen?'fixed inset-0 z-[100] flex h-dvh w-screen items-center justify-center overflow-hidden bg-[#101923]':'relative overflow-hidden rounded-2xl bg-[#101923]'} style={fullscreen?undefined:{aspectRatio:'16 / 9'}}>
      <iframe key={generation} ref={frame} src={`/games/alien-run/${ALIEN_RUN_BUILD}/index.html`} title="Ted Runner · Unity" sandbox="allow-scripts allow-same-origin" allow="fullscreen" className="h-full w-full border-0" style={fullscreen?{width:'min(100vw, 177.777dvh)',height:'min(56.25vw, 100dvh)'}:undefined} />
      {!ready && !error && <p role="status" className="absolute inset-0 grid place-items-center text-white">Cargando Ted Runner…</p>}
      {fullscreen && <button type="button" className="absolute right-3 top-3 rounded-lg bg-[#101923] px-3 py-2 text-white" onClick={()=>setFullscreen(false)}>Volver a la página</button>}
    </div>
    {error && <div role="alert" className="space-y-2"><p>{error}</p><button type="button" className="rounded-lg border px-4 py-2" onClick={()=>{setError('');setReady(false);setPlaying(false);setResult(null);setGeneration(n=>n+1)}}>Reintentar carga</button></div>}
    {result && <p role="status">{result.finished?'¡Llegaste a la meta!':'Práctica terminada.'} Recogiste {result.collected_ids.filter(x=>x.startsWith('c')).length} monedas y {result.collected_ids.filter(x=>x.startsWith('s')).length} estrellas en {Math.round(result.duration_ms/1000)} segundos.</p>}
    <p className="text-sm text-muted-foreground">Avanza con A/D o las flechas, salta con Espacio. En el celular usa los controles de pantalla. Práctica gratuita, sin inscripción ni premios.</p>
  </section>
}
