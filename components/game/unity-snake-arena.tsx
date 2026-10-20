'use client'
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react'
import {readArenaMessage,rareResourceHint,SNAKE_BUILD,SNAKE_CHANNEL,type ArenaData,type ArenaRank} from '@/lib/game/snake-arena-client'
import {lightRainHint} from '@/lib/game/snake-light-rain'
import {SnakeLightRain} from './snake-light-rain'
import {ArenaPerformance,type ArenaPerformanceSummary} from '@/lib/game/snake-arena-performance'
import {SNAKE_APPEARANCES,isSnakeAppearance,canUseAppearance,cosmeticUnlockNotice,type SnakeAppearance} from '@/lib/game/snake-arena-cosmetics'
import {useSnakePractice} from './use-snake-practice'
import {SnakeCosmetics} from './snake-cosmetics'
import {SnakeQuality} from './snake-quality'
import {SnakeResultSponsor} from './snake-result-sponsor'
import {SnakeTournamentInvitation} from './snake-funnel'
import {trackSnakeFunnel} from '@/lib/analytics/snake-funnel-client'
import {ArenaAdaptiveQuality,isArenaQualityMode,type ArenaQuality,type ArenaQualityMode} from '@/lib/game/snake-arena-quality'
import {SnakeMissions} from './snake-missions'
import {SnakeDailyMissions} from './snake-daily-missions'
import {SnakePracticeLeaderboard} from './snake-practice-leaderboard'
import {readSnakeProgress,missionCelebration,accountLevelCelebration,type SnakeProgress} from '@/lib/game/snake-arena-missions'
const subscribeLocation=()=>()=>{}
function localArenaAddress(){
  if(typeof window==='undefined'||!['127.0.0.1','localhost'].includes(window.location.hostname)||window.location.port!=='3080')return ''
  const arena=new URL(window.location.href);arena.port='3090';return arena.href
}
export function UnitySnakeArena(){
  const frame=useRef<HTMLIFrameElement>(null),playerId=useRef(''),appearanceRef=useRef<SnakeAppearance>('aurora')
  const practice=useSnakePractice(frame)
  const progressRef=useRef<SnakeProgress|null>(null),authenticatedRef=useRef(false),accountXpRef=useRef<number|null>(null)
  const [progress,setProgress]=useState<SnakeProgress|null>(null),[missionNotice,setMissionNotice]=useState('')
  useEffect(()=>{if(!missionNotice)return;const timer=setTimeout(()=>setMissionNotice(''),2800);return()=>clearTimeout(timer)},[missionNotice])
  const [cosmeticNotice,setCosmeticNotice]=useState('')
  const adaptiveQuality=useRef(new ArenaAdaptiveQuality())
  const [qualityInfo,setQualityInfo]=useState<ReturnType<ArenaAdaptiveQuality['snapshot']>>({mode:'auto',quality:'high',changes:0,reason:'initial'})
  const [qualityMode,setQualityMode]=useState<ArenaQualityMode>('auto'),[quality,setQuality]=useState<ArenaQuality>('high'),[appliedQuality,setAppliedQuality]=useState<ArenaQuality|null>(null)
  useEffect(()=>{if(!cosmeticNotice)return;const timer=setTimeout(()=>setCosmeticNotice(''),5500);return()=>clearTimeout(timer)},[cosmeticNotice])
  const minimumMass=useRef(8)
  const profile=useRef<ArenaPerformance|null>(null),live=useRef(false),snapshotAt=useRef(0)
  const [summary,setSummary]=useState<ArenaPerformanceSummary|null>(null),[showReport,setShowReport]=useState(false)
  const [memory,setMemory]=useState<{state:'idle'|'busy'|'done'|'unavailable';mib?:number}>({state:'idle'})
  const [localId,setLocalId]=useState(''),[appearance,setAppearance]=useState<SnakeAppearance>('aurora')
  const [rainHint,setRainHint]=useState<ReturnType<typeof lightRainHint>|null>(null)
  const [rareHint,setRareHint]=useState<ReturnType<typeof rareResourceHint>|null>(null)
  const [capacity,setCapacity]=useState<number|null>(null)
  const [status,setStatus]=useState('loading'),[score,setScore]=useState(0),[mass,setMass]=useState(0),[players,setPlayers]=useState(0)
  const [boosting,setBoosting]=useState(false),[boostHeld,setBoostHeld]=useState(false)
  const [boostConfig,setBoostConfig]=useState({boostMinMass:8,boostMassPerSecond:2,boostMultiplier:1.6})
  const [leaders,setLeaders]=useState<ArenaRank[]>([]),[result,setResult]=useState<ArenaData|null>(null),[error,setError]=useState('')
  const [fps,setFps]=useState(0),[rtt,setRtt]=useState(0),[metrics,setMetrics]=useState<ArenaData['metrics']>()
  const [frameP95,setFrameP95]=useState<number>(),[wasmMB,setWasmMB]=useState<number>(),[loadMs,setLoadMs]=useState<number>()
  const localArenaUrl=useSyncExternalStore(subscribeLocation,localArenaAddress,()=> '')
  const holdBoost=useCallback((held:boolean)=>{setBoostHeld(held);frame.current?.contentWindow?.postMessage({channel:SNAKE_CHANNEL,version:1,type:'boost',held},location.origin)},[])
  useEffect(()=>{
    if(localArenaAddress())return
    const loadingAt=performance.now(),arenaFrame=frame.current
    const receive=(event:MessageEvent)=>{
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return
      const data=readArenaMessage(event.data);if(!data)return
      if(data.type==='ready'){
        trackSnakeFunnel({event:'game_ready'})
        try{const saved=localStorage.getItem('snake-quality-mode');if(isArenaQualityMode(saved)){adaptiveQuality.current.select(saved,performance.now());setQualityMode(saved)}}catch{}
        setQuality(adaptiveQuality.current.quality);setQualityInfo(adaptiveQuality.current.snapshot());arenaFrame?.contentWindow?.postMessage({channel:SNAKE_CHANNEL,version:1,type:'quality',quality:adaptiveQuality.current.quality},location.origin)
        try{const saved=localStorage.getItem('snake-appearance');if(isSnakeAppearance(saved))appearanceRef.current=saved}catch{}
        setAppearance(appearanceRef.current);arenaFrame?.contentWindow?.postMessage({channel:SNAKE_CHANNEL,version:1,type:'appearance',appearance:appearanceRef.current},location.origin)
        setStatus('ready');setLoadMs(performance.now()-loadingAt)
      }
      if(data.type==='welcome'){
        trackSnakeFunnel({event:'game_started'})
        progressRef.current=null;setProgress(null);setMissionNotice('');authenticatedRef.current=data.authenticated===true;accountXpRef.current=data.accountXp??null
        playerId.current=data.id??'';setLocalId(data.id??'');setCapacity(data.config?.maxPlayers??null)
        minimumMass.current=data.config?.boostMinMass??8
        if(data.config)setBoostConfig({boostMinMass:data.config.boostMinMass??8,boostMassPerSecond:data.config.boostMassPerSecond??2,boostMultiplier:data.config.boostMultiplier??1.6})
        holdBoost(false);setStatus('playing');setError('');setResult(null)
      }
      if(data.type==='persistence'&&data.accountXp!==undefined){
        const previous=accountXpRef.current;accountXpRef.current=data.accountXp
        const cosmetic=cosmeticUnlockNotice(previous,data.accountXp);if(cosmetic)setCosmeticNotice(cosmetic)
        const notice=accountLevelCelebration(previous,data.accountXp);if(notice)setMissionNotice(notice)
      }
      if(data.type==='snapshot'){
        const me=data.players?.find(p=>p.id===playerId.current)
        const next=readSnakeProgress(me?.practiceProgress)
        if(next){if(progressRef.current&&progressRef.current.life!==next.life)setMissionNotice('');const notice=missionCelebration(progressRef.current,next,!authenticatedRef.current);if(notice)setMissionNotice(notice);progressRef.current=next;setProgress(next)}
        setRareHint(me?.alive&&data.specialResource?rareResourceHint(data.tick??0,data.food??[],data.specialResource,typeof me.x==='number'&&typeof me.y==='number'?{x:me.x,y:me.y}:undefined):null)
        setRainHint(me?.alive&&data.lightRain?lightRainHint(data.tick??0,data.lightRain,data.food??[],typeof me.x==='number'&&typeof me.y==='number'?{x:me.x,y:me.y}:undefined):null)
        live.current=!!me?.alive;snapshotAt.current=performance.now();if(!live.current)profile.current?.pause()
        if(me){if(me.alive&&isSnakeAppearance(me.appearance)&&me.appearance!==appearanceRef.current){appearanceRef.current=me.appearance;setAppearance(me.appearance)}setScore(me.score);setMass(me.mass);setBoosting(me.alive&&me.boosting===true);if(!me.alive||me.mass<=minimumMass.current)holdBoost(false);if(me.alive){setStatus('playing');setResult(null);setError('')}}
        setPlayers(data.players?.length??0);setLeaders(data.leaderboard??[]);setMetrics(data.metrics)
      }
      if(data.type==='result'){trackSnakeFunnel({event:'game_finished'});live.current=false;adaptiveQuality.current.pause();holdBoost(false);setBoosting(false);profile.current?.pause();setResult(data);setStatus('dead')}
      if(data.type==='disconnect'){adaptiveQuality.current.pause();progressRef.current=null;setProgress(null);setMissionNotice('');setRareHint(null);setRainHint(null);live.current=false;holdBoost(false);setBoosting(false);profile.current?.pause();setStatus('ready');setError('');setPlayers(0);setLeaders([])}
      if(data.type==='error'){setError(data.code==='appearance_locked'?'Ese aspecto todavía requiere XP guardada de tu cuenta. Elige uno disponible.':data.code==='socket_unavailable'?'Servidor de arena no disponible. Abre la vista local en el puerto 3090.':`No se pudo completar la acción (${data.code??'carga'}).`);if(data.code==='webgl_load_failed')setStatus('failed')}
      if(data.type==='fps'){
        const now=performance.now(),active=live.current&&document.visibilityState==='visible'&&now-snapshotAt.current<1500
        setFps(data.fps??0);setFrameP95(data.frameMsP95);setWasmMB(data.wasmAllocatedMB);if(data.quality)setAppliedQuality(data.quality)
        const previous=adaptiveQuality.current.quality,next=adaptiveQuality.current.observe(data,now,active)
        if(next!==previous){setQuality(next);setQualityInfo(adaptiveQuality.current.snapshot());arenaFrame?.contentWindow?.postMessage({channel:SNAKE_CHANNEL,version:1,type:'quality',quality:next},location.origin)}
        if(profile.current)setSummary(profile.current.observe(data,now,active))
      }
      if(data.type==='rtt')setRtt(data.ms??0)
    }
    const release=()=>holdBoost(false)
    const visibility=()=>{profile.current?.pause();adaptiveQuality.current.pause();if(document.hidden)release()}
    window.addEventListener('message',receive);window.addEventListener('blur',release);document.addEventListener('visibilitychange',visibility)
    if(frame.current)frame.current.src=`/games/snake-arena/${SNAKE_BUILD}/index.html`
    const timeout=setTimeout(()=>setStatus(s=>{if(s==='loading'){setError('La carga está tardando. Comprueba la build local y vuelve a abrir la página.');return 'failed'}return s}),90000)
    return()=>{window.removeEventListener('message',receive);window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',visibility);clearTimeout(timeout);arenaFrame?.contentWindow?.postMessage({channel:SNAKE_CHANNEL,version:1,type:'boost',held:false},location.origin)}
  },[holdBoost])
  const send=(type:'join'|'restart')=>{holdBoost(false);setBoosting(false);setError('');void practice.begin(type,appearanceRef.current);frame.current?.focus({preventScroll:true})}
  const chooseAppearance=useCallback((value:SnakeAppearance)=>{appearanceRef.current=value;setAppearance(value);try{localStorage.setItem('snake-appearance',value)}catch{};frame.current?.contentWindow?.postMessage({channel:SNAKE_CHANNEL,version:1,type:'appearance',appearance:value},location.origin)},[])
  const chooseQuality=useCallback((mode:ArenaQualityMode)=>{const next=adaptiveQuality.current.select(mode,performance.now());setQualityMode(mode);setQuality(next);setQualityInfo(adaptiveQuality.current.snapshot());try{localStorage.setItem('snake-quality-mode',mode)}catch{};frame.current?.contentWindow?.postMessage({channel:SNAKE_CHANNEL,version:1,type:'quality',quality:next},location.origin)},[])
  useEffect(()=>{
    if(practice.accountState==='loading'||status==='loading'||status==='playing')return
    const reset=setTimeout(()=>{if(!canUseAppearance(appearanceRef.current,practice.account?.xp??null))chooseAppearance('aurora')},0)
    return()=>clearTimeout(reset)
  },[practice.account?.userId,practice.account?.xp,practice.accountState,status,chooseAppearance])
  const beginProfile=()=>{profile.current=new ArenaPerformance();setSummary(profile.current.summary());setShowReport(false)}
  const measureMemory=async()=>{
    const api=(performance as Performance&{measureUserAgentSpecificMemory?:()=>Promise<{bytes:number}>}).measureUserAgentSpecificMemory
    if(!api||!window.isSecureContext||!window.crossOriginIsolated){setMemory({state:'unavailable'});return}
    setMemory({state:'busy'})
    try{const value=await api.call(performance);if(!Number.isFinite(value.bytes)||value.bytes<0)throw new Error('Invalid memory');setMemory({state:'done',mib:value.bytes/1048576})}catch{setMemory({state:'unavailable'})}
  }
  return <section className="space-y-4" aria-label="SnakeArena multiplayer">
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-teal-400/20 bg-gradient-to-br from-[#10333a] to-[#08121e] px-5 py-4 text-white shadow-lg shadow-teal-950/20">
      <p aria-live="polite" className="flex flex-wrap items-center gap-5"><span className="text-xs text-teal-100/70">Puntaje <strong className="ml-2 text-2xl font-semibold tabular-nums text-teal-200" data-testid="snake-score">{score}</strong></span><span className="text-sm text-teal-100/80">Tamaño <strong className="ml-1 tabular-nums text-white">{mass}</strong></span><span className="text-sm text-teal-100/80">Jugadores <span className="ml-1 tabular-nums text-white" data-testid="snake-players">{players}</span>{capacity!==null&&`/${capacity}`}</span></p>
      {localArenaUrl?<a href={localArenaUrl} className="rounded-xl bg-teal-300 px-5 py-3 font-semibold text-[#07101a] hover:bg-teal-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300">Abrir arena multijugador</a>:<button type="button" disabled={practice.busy||status==='loading'||status==='playing'||status==='failed'} className="rounded-xl bg-teal-300 px-5 py-3 font-semibold text-[#07101a] shadow-md shadow-teal-400/10 transition hover:bg-teal-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300 disabled:opacity-40" onClick={()=>send(status==='dead'?'restart':'join')}>{practice.busy?'Conectando…':status==='dead'?'Jugar de nuevo':status==='playing'?'En partida':'Entrar a la arena'}</button>}
    </div>
    <details open={status!=='playing'} className="rounded-2xl border border-teal-400/20 bg-[#091b29] text-white">
      <summary className="cursor-pointer px-4 py-3 text-sm text-teal-100">Tu criatura · {SNAKE_APPEARANCES.find(s=>s.id===appearance)?.name}</summary>
    <SnakeCosmetics appearance={appearance} choose={chooseAppearance} disabled={practice.busy||status==='playing'||status==='loading'||status==='failed'} accountXp={practice.account?.xp??null} accountState={practice.accountState} />
    </details>
    {cosmeticNotice&&<p role="status" className="rounded-xl border border-violet-300/30 bg-[#25203d] px-4 py-3 text-sm text-violet-100">{cosmeticNotice}</p>}
    {!localArenaUrl&&<SnakeQuality mode={qualityMode} quality={quality} applied={appliedQuality} onChange={chooseQuality} disabled={status==='loading'||status==='failed'} />}
    {!localArenaUrl&&status!=='playing'&&<SnakeMissions progress={progress} notice={missionNotice} active={false} accountXp={practice.account?.xp} xpState={practice.xpState} pendingXp={practice.pendingXp} />}
    {!localArenaUrl&&<SnakeDailyMissions progress={practice.account?.daily??null} state={practice.dailyState} active={status==='playing'} refresh={practice.refresh} />}
    {rainHint&&status==='playing'&&<SnakeLightRain hint={rainHint} />}
    {rareHint&&status==='playing'&&<div className="flex items-center gap-3 rounded-xl border border-sky-300/25 bg-[#0b2033] px-4 py-3 text-sky-100" aria-label="Recurso especial">
      <span aria-hidden="true" className="text-3xl text-sky-200">◆</span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Núcleo estelar {rareHint.active&&<span aria-label="Dirección del núcleo" className="ml-2 text-lg">{rareHint.direction}</span>}</p><p className="text-xs text-sky-100/75">{rareHint.active?`Busca el diamante azul · desaparece en ${rareHint.seconds} s`:`Próximo núcleo en ${rareHint.seconds} s`} · +{rareHint.mass} masa · +{rareHint.score} puntos</p></div>
    </div>}
    <div className="relative overflow-hidden rounded-2xl border border-teal-400/20 bg-[#07101a] shadow-xl shadow-teal-950/15" style={{height:'clamp(360px, calc(100dvh - 280px), 680px)',minHeight:360}}>
      <iframe ref={frame} title="SnakeArena · Unity" sandbox="allow-scripts allow-same-origin" className="h-full w-full border-0" />
      {status==='ready'&&!localArenaUrl&&<p className="pointer-events-none absolute left-4 top-4 rounded-lg bg-[#07101a]/80 px-3 py-2 text-sm text-white">Vista previa · {SNAKE_APPEARANCES.find(s=>s.id===appearance)?.name}</p>}
      {status==='loading'&&!localArenaUrl&&<p className="pointer-events-none absolute bottom-4 left-4 text-sm text-white" role="status">Cargando Unity…</p>}
      {localArenaUrl&&<div className="absolute inset-0 grid place-items-center p-6 text-center text-teal-100"><div className="max-w-sm space-y-4"><h2 className="text-2xl font-semibold">Tu próxima partida está en la arena</h2><p className="text-sm text-teal-100/70">Abre la vista multijugador para conectar con los demás jugadores.</p><a href={localArenaUrl} className="inline-block rounded-xl bg-teal-300 px-5 py-3 font-semibold text-[#07101a] hover:bg-teal-200">Abrir arena multijugador</a></div></div>}
      {status==='playing'&&!localArenaUrl&&<div className="pointer-events-none absolute left-3 right-3 top-3 max-w-sm"><SnakeMissions progress={progress} notice={missionNotice} active accountXp={practice.account?.xp} xpState={practice.xpState} pendingXp={practice.pendingXp} /></div>}
      {leaders.length>0&&<ol aria-label="Ranking de la sala" className="pointer-events-none absolute right-3 top-3 rounded-lg bg-[#07101a]/80 px-3 py-2 text-xs text-white">{leaders.slice(0,5).map(p=><li key={p.id} className={p.id===localId?'text-teal-300':'text-violet-200'}>{p.rank}. {p.name} · {p.score}</li>)}</ol>}
      {status==='playing'&&!localArenaUrl&&<div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-3">
        <span className="pointer-events-none rounded-lg bg-[#07101a]/85 px-3 py-2 text-xs text-teal-100">{boosting?'Acelerando':mass<=boostConfig.boostMinMass?'Recoge luz para acelerar':'Mantén clic izquierdo o Boost'}</span>
        <button type="button" aria-label="Mantener boost: consume masa" aria-pressed={boostHeld||boosting} disabled={mass<=boostConfig.boostMinMass}
          onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);holdBoost(true)}} onPointerUp={()=>holdBoost(false)} onPointerCancel={()=>holdBoost(false)} onLostPointerCapture={()=>holdBoost(false)} onBlur={()=>holdBoost(false)}
          onKeyDown={event=>{if(event.code==='Space'||event.code==='Enter'){event.preventDefault();holdBoost(true)}}} onKeyUp={event=>{if(event.code==='Space'||event.code==='Enter')holdBoost(false)}}
          className="pointer-events-auto touch-none select-none rounded-full border border-teal-200/50 bg-[#103b46]/95 px-6 py-5 font-semibold text-teal-100 shadow-lg shadow-teal-400/20 aria-pressed:bg-teal-300 aria-pressed:text-[#07101a] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-teal-300">Boost</button>
      </div>}
      {result&&status==='dead'&&<div className="absolute inset-0 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-sm space-y-4 rounded-2xl border border-teal-800 bg-[#0b1e29] p-6 text-white"><h2 className="text-xl font-semibold">Fin de partida</h2><dl className="grid grid-cols-2 gap-2 text-sm"><dt>Puntaje</dt><dd>{result.score}</dd><dt>Posición al morir</dt><dd>{result.rank}</dd><dt>Eliminaciones</dt><dd>{result.kills}</dd><dt>Tiempo</dt><dd>{result.survivedSeconds} s</dd><dt>Tamaño máximo</dt><dd>{result.maxSize}</dd><dt>{practice.account?'Récord personal':'Mejor de esta conexión'}</dt><dd>{result.personalBest}</dd></dl><p role="status" className="text-sm text-teal-200">{practice.saveState==='saved'?'Guardada en tu historial':practice.saveState==='saving'?'Guardando partida…':practice.saveState==='retrying'?'Guardado pendiente. Reintentaremos automáticamente.':'Práctica de invitado: inicia sesión para guardar futuras partidas.'}</p><button type="button" className="w-full rounded-lg bg-teal-300 px-4 py-3 font-semibold text-[#07101a]" onClick={()=>send('restart')}>Volver a la arena</button></div></div>}
    </div>
    {result&&status==='dead'&&!localArenaUrl&&<SnakeResultSponsor />}
    {result&&status==='dead'&&!localArenaUrl&&<SnakeTournamentInvitation />}
    {practice.notice&&<p role="status" className="text-sm text-teal-700 dark:text-teal-200">{practice.notice}</p>}
    {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
    <p className="text-sm text-muted-foreground">Dirige con el mouse o arrastra con el dedo. Recoge orbes de colores para crecer. La arena de práctica es circular: evita su borde rojo. Al morir una criatura, deja orbes blancos con brillo turquesa a lo largo del cuerpo; recógelos para ganar masa antes de que desaparezcan a los 45 segundos. Evita los cuerpos de otras criaturas y el borde rojo. En práctica, la lluvia de luces añade grupos dorados durante 15 s; cada luz da la masa y los puntos habituales, y cuenta para tus misiones. Sigue su flecha antes de que desaparezcan. Tu criatura lleva una marca blanca sobre la cabeza. En práctica, el diamante azul es un núcleo estelar: da 10 de masa (hasta el máximo) y 50 puntos; la flecha indica dónde buscarlo y el contador cuánto queda. Mantén clic izquierdo o el botón Boost para acelerar un {Math.round((boostConfig.boostMultiplier-1)*100)} %: consume {boostConfig.boostMassPerSecond} de masa/s y se detiene en tamaño {boostConfig.boostMinMass}. Suelta para conservar masa.</p>
    {!localArenaUrl&&<div className="rounded-xl border border-teal-400/20 bg-[#0b1e29] p-4 text-teal-100">
      {practice.account?<details><summary className="cursor-pointer text-sm font-semibold">Tu práctica · {practice.account.name} · Nivel {Math.floor(practice.account.xp/100)+1} · {practice.account.xp} XP · Récord {practice.account.best}</summary><p className="mt-2 text-xs text-teal-100/60">XP y nivel privados de tu cuenta: se guardan al completar cada misión. Historial de tus últimas 20 partidas. Un corte breve permite recuperar tu criatura durante 15 s; seguirá moviéndose y podrá morir.</p><button type="button" className="my-3 rounded border border-teal-400/30 px-3 py-2 text-xs" onClick={practice.refresh}>Actualizar historial</button>{practice.account.history.length?<ol className="space-y-2 text-sm" aria-label="Historial de práctica">{practice.account.history.map(run=><li key={run.id} className="flex flex-wrap justify-between gap-2 border-t border-teal-300/10 pt-2"><span>{new Date(run.ended_at).toLocaleString('es-CL')}</span><span>{run.score} puntos · {run.survived_seconds} s</span></li>)}</ol>:<p className="text-sm">Tu primera partida guardada aparecerá aquí.</p>}</details>:<p className="text-sm">{practice.accountState==='loading'?'Consultando tu cuenta…':practice.accountState==='unavailable'?'Tu historial no está disponible ahora.':'Juegas como invitado.'} <a className="font-semibold text-teal-300 underline underline-offset-4" href="/sign-in?next=%2Fplay%2Fsnake-arena">Inicia sesión para guardar XP, nivel, récord e historial</a></p>}
    </div>}
    {!localArenaUrl&&<SnakePracticeLeaderboard userId={practice.account?.userId??null} latestRunId={practice.account?.history[0]?.id??''} active={status==='playing'} />}
    <details className="space-y-2 text-xs text-muted-foreground"><summary>Métricas de desarrollo</summary><p>FPS {fps} · Frame p95 {frameP95?.toFixed(1)??'—'} ms · RTT {rtt} ms · Tick {metrics?.tickMs?.toFixed(2)??'—'} ms · Snapshot {metrics?.snapshotBytes??0} B · Entidades {metrics?.entities??0}</p><p>Carga Unity {loadMs===undefined?'—':(loadMs/1000).toFixed(2)} s · WASM reservado {wasmMB?.toFixed(0)??'—'} MiB</p><p>Muestras de render de 2 s. La carga incluye la caché disponible; WASM reservado no equivale a memoria total del navegador.</p>
      <div className="flex flex-wrap gap-2">{practice.account&&<button type="button" disabled={status!=='playing'||practice.busy} className="rounded border px-3 py-2 disabled:opacity-40" onClick={practice.testDrop}>Probar corte de conexión</button>}<button type="button" disabled={status!=='playing'} onClick={beginProfile} className="rounded border px-3 py-2 disabled:opacity-40">{summary?'Reiniciar medición de 3 minutos':'Medir 3 minutos de juego'}</button><button type="button" disabled={memory.state==='busy'||status==='loading'} onClick={measureMemory} className="rounded border px-3 py-2 disabled:opacity-40">{memory.state==='busy'?'Midiendo memoria…':'Medir memoria de la aplicación'}</button>{summary&&<button type="button" onClick={()=>setShowReport(s=>!s)} className="rounded border px-3 py-2">{showReport?'Ocultar informe':'Ver informe'}</button>}</div>
      {summary&&<p data-testid="snake-performance-summary">{summary.state==='complete'?'Medición completada':'Midiendo'} · {summary.seconds.toFixed(0)}/180 s activos · {summary.samples} ventanas · FPS medio {summary.fpsMean?.toFixed(1)??'—'} · mínimo {summary.fpsMin??'—'} · peor p95 de ventana {summary.worstWindowP95Ms?.toFixed(1)??'—'} ms · bajo 55 FPS: {summary.below55Seconds.toFixed(0)} s · interrupciones {summary.interruptions}</p>}
      {summary&&<p>Se excluyen muerte, pestaña oculta, pérdida de snapshots y ventanas incompletas. No es un p95 global ni una medida de latencia del control.</p>}
      {memory.state==='done'&&<p>Memoria estimada de la aplicación: {memory.mib?.toFixed(1)} MiB. Depende de la API del navegador; no es toda la memoria del proceso ni de GPU.</p>}
      {memory.state==='unavailable'&&<p>Estimación de memoria no disponible en este navegador/origen. La reserva WASM sigue siendo una medida distinta.</p>}
      {showReport&&summary&&<pre data-testid="snake-performance-report" className="max-h-64 overflow-auto rounded border p-3">{JSON.stringify({build:SNAKE_BUILD,render:summary,quality:{...qualityInfo,applied:appliedQuality},loadSeconds:loadMs===undefined?null:loadMs/1000,cache:'uncontrolled unless fresh origin and HTTP transfer verified',applicationMemory:memory,environment:typeof navigator==='undefined'?'':navigator.userAgent},null,2)}</pre>}
    </details>
  </section>
}
