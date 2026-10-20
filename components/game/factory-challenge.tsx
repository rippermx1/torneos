'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import builds from '@/lib/game/runtime-builds.json'
import {readFactory3dEvent} from '@/lib/game/factory-3d'
import {readColonyCommand,type ColonyAction,type ColonyCommand} from '@/lib/game/factory-3d-domain'
import {AccountColonyCommands,ColonyHttpError} from '@/lib/game/factory-3d-client'
import {ChallengeClock} from '@/lib/game/factory-3d-challenge-client'
import {readChallengeStart,type ChallengeEntry,type ChallengeReceipt,type ChallengeStatus,type ChallengeBoard} from '@/lib/game/factory-3d-challenge'
import {communityAmount} from '@/lib/game/factory-3d-community'
import styles from './factory-challenge.module.css'

const base='/play/factory-empire/challenge'
const date=(ms:number)=>new Date(ms).toLocaleString('es-CL',{dateStyle:'medium',timeStyle:'short'})
const time=(ms:number)=>{const n=Math.ceil(ms/1000);return [Math.floor(n/3600),Math.floor(n%3600/60),n%60].map(v=>String(v).padStart(2,'0')).join(':')}
async function session():Promise<ChallengeStatus|null>{const r=await fetch(base+'/session',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(r.status===401)return null;if(!r.ok)throw new Error();return r.json()}

function ChallengeGame({entry,accountId,serverTimeMs,onClose}:{entry:ChallengeEntry;accountId:string;serverTimeMs:number;onClose:()=>void}){
  const frame=useRef<HTMLIFrameElement>(null),retry=useRef<()=>void>(()=>{}),build=builds['factory-empire']
  const [current,setCurrent]=useState<ChallengeReceipt>(entry),[remaining,setRemaining]=useState(Math.max(0,entry.endsAtMs-serverTimeMs)),[message,setMessage]=useState('Cargando el desafío…'),[failed,setFailed]=useState(false),[waiting,setWaiting]=useState(true),[expanded,setExpanded]=useState(false)
  const clock=useRef<ChallengeClock|null>(null)
  useEffect(()=>{
    let active=true,ready=false,busy=false,blocked=false,expired=false,closed=entry.closed,commands:AccountColonyCommands<ChallengeReceipt&{accountId:string}>|undefined
    clock.current=new ChallengeClock(entry.endsAtMs,serverTimeMs,performance.now())
    const send=(method:string,payload='',type='server')=>frame.current?.contentWindow?.postMessage({channel:'torneos.factory-empire',version:2,build,type,method,payload},location.origin)
    const expire=()=>{expired=true;send('OnChallengeExpired','','challenge-ui')}
    const request=async(command:ColonyCommand)=>{
      const r=await fetch(base+'/session',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Factory-Account':accountId},body:JSON.stringify({...command,entryId:entry.entryId}),signal:AbortSignal.timeout(15000)})
      const d=await r.json();if(!r.ok)throw new ColonyHttpError(r.status,d.code??'challenge_unavailable')
      if(d.entryId!==entry.entryId)throw new Error('Respuesta de otra partida.')
      return d as ChallengeReceipt&{accountId:string}
    }
    const apply=(r:ChallengeReceipt)=>{
      if(!active)return
      clock.current?.confirm(r.endsAtMs,r.serverTimeMs,performance.now());closed=closed||r.closed
      setCurrent(old=>r.state.revision>=old.state.revision?r:old);setRemaining(closed?0:clock.current!.remaining(performance.now()))
      send('OnServerState',JSON.stringify(r));if(expired||closed)expire()
      setMessage(r.message);setFailed(false);blocked=false
      if(r.closed)onClose()
    }
    const error=(e:unknown)=>{if(!active)return;blocked=true;setFailed(true);const auth=e instanceof ColonyHttpError&&[401,403].includes(e.status);const text=auth?'La sesión cambió. Vuelve a tu cuenta original para recuperar la acción.':'No se pudo confirmar. Reintenta para recuperar la misma acción; el reloj del desafío continúa.';setMessage(text);send('OnServerError',text)}
    try{commands=new AccountColonyCommands(accountId,sessionStorage,request,`challenge-command.v1:${entry.entryId}`)}catch(e){error(e)}
    async function execute(action:ColonyAction={kind:'sync'}){
      if(!ready||busy||!commands)return
      busy=true;setWaiting(true);send('OnServerWaiting','Confirmando desafío…')
      try{
        if(commands.hasPending){apply(await commands.retry());apply(await commands.submit({kind:'sync'}))}
        else apply(await commands.submit(action))
      }catch(e){error(e)}finally{busy=false;if(active)setWaiting(false)}
    }
    retry.current=()=>{void execute()}
    const receive=(e:MessageEvent)=>{
      if(e.origin!==location.origin||e.source!==frame.current?.contentWindow)return
      const d=readFactory3dEvent(e.data,build);if(!d)return
      if(d.type==='ready'){ready=true;if(clock.current!.remaining(performance.now())===0||closed)expire();void execute()}
      if(d.type==='error')setMessage(d.payload)
      if(d.type==='intent'&&!busy&&!blocked&&!expired&&!closed){
        try{const raw=JSON.parse(d.payload),keys:Record<string,string[]>={mine:['kind'],build:['kind','definitionId','x','z','orientation'],move:['kind','instanceId','x','z','orientation'],upgrade:['kind','instanceId'],technology:['kind','technologyId'],expand:['kind','x','z']};if(!Object.hasOwn(keys,raw.kind))return;const parsed=readColonyCommand({commandId:crypto.randomUUID(),action:Object.fromEntries(keys[raw.kind].map(k=>[k,raw[k]]))});if(parsed)void execute(parsed.action)}catch{setMessage('No se pudo leer la acción. Consulta el estado antes de continuar.')}
      }
    }
    window.addEventListener('message',receive)
    const tick=setInterval(()=>{if(!active||closed)return;const left=clock.current!.remaining(performance.now());setRemaining(left);if(left===0&&!expired){expire();if(ready&&!blocked)void execute()}},250)
    const poll=setInterval(()=>{if(!document.hidden&&!blocked&&ready&&!closed)void execute()},5000)
    const visibility=()=>{if(!document.hidden&&ready&&!blocked&&!closed)void execute()}
    document.addEventListener('visibilitychange',visibility)
    return()=>{active=false;window.removeEventListener('message',receive);document.removeEventListener('visibilitychange',visibility);clearInterval(tick);clearInterval(poll)}
    // The initial clock belongs to this entry; parent refreshes do not remount it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[entry.entryId,accountId,build])
  useEffect(()=>{const old=document.body.style.overflow;if(expanded)document.body.style.overflow='hidden';const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false)};window.addEventListener('keydown',escape);return()=>{document.body.style.overflow=old;window.removeEventListener('keydown',escape)}},[expanded])
  const locked=waiting||failed||current.closed||remaining===0
  const ui=(method:string,payload='')=>frame.current?.contentWindow?.postMessage({channel:'torneos.factory-empire',version:2,build,type:'challenge-ui',method,payload},location.origin)
  return <section className={expanded?styles.expanded:styles.gamePanel} aria-label="Tu partida del desafío">
    <div className={styles.gameHeader}><div><span className={styles.eyebrow}>{current.closed?'RESULTADO CERRADO':'TU DESAFÍO · '+entry.edition+' UTC'}</span><h2>{entry.alias}</h2></div><div className={styles.clock} role="timer" aria-label="Tiempo restante">{time(remaining)}</div></div>
    <dl className={styles.metrics}><div><dt>Ferrita extraída · puntaje</dt><dd>{communityAmount(current.scoreMilli)}</dd></div><div><dt>Producción confirmada</dt><dd>{communityAmount(current.rateMilli)} /s</dd></div><div><dt>Disponible para invertir</dt><dd>{communityAmount(current.state.balance)}</dd></div></dl>
    <p className={styles.muted}>Finaliza: <time dateTime={new Date(current.endsAtMs).toISOString()}>{date(current.endsAtMs)}</time>. La producción continúa hasta ese instante aunque cierres el juego.</p>
    <div className={styles.actions}><button className={`${styles.button} ${styles.primary}`} disabled={locked} onClick={()=>ui('OnChallengeMine')}>Extraer ferrita</button><button className={styles.button} disabled={locked} onClick={()=>ui('OnChallengeBuild','mining-drone')}>Colocar drone</button><button className={styles.button} onClick={()=>setExpanded(x=>!x)} aria-pressed={expanded}>{expanded?'Salir de vista ampliada':'Ampliar desafío'}</button>{failed&&<button className={styles.button} onClick={()=>retry.current()}>Reintentar acción</button>}</div>
    <p className={styles.status} role="status">{current.closed?'Tu partida finalizó. Puedes recorrerla; las acciones están bloqueadas.':remaining===0?'Plazo cumplido. Consultando el resultado confirmado…':message}</p>
    <div className={styles.viewer}><iframe ref={frame} src={`/games/factory-empire/${build}/index.html?persistence=challenge`} title="Factory Empire · desafío normalizado de 24 horas" sandbox="allow-scripts allow-same-origin"/></div>
    {!expanded&&<p className={styles.muted}>Reúne 15 ferritas para tu primer drone y elige su celda en el mapa. Selecciona una máquina para mejorarla; rueda para zoom, Mayús + arrastrar para cámara. La campaña y esta industria se conservan por separado.</p>}
  </section>
}

export function FactoryChallenge(){
  const [owner,setOwner]=useState<ChallengeStatus|null>(null),[ownerLoading,setOwnerLoading]=useState(true),[ownerError,setOwnerError]=useState(''),[alias,setAlias]=useState(''),[consent,setConsent]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState('')
  const [board,setBoard]=useState<ChallengeBoard|null>(null),[edition,setEdition]=useState(''),[offset,setOffset]=useState(0),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true),[boardError,setBoardError]=useState('')
  const readOwner=useCallback(async()=>{setOwnerLoading(true);try{setOwner(await session());setOwnerError('')}catch{setOwnerError('No pudimos consultar tu desafío. Tu campaña permanece guardada.')}finally{setOwnerLoading(false)}},[])
  useEffect(()=>{let active=true;void session().then(d=>{if(active)setOwner(d)}).catch(()=>{if(active)setOwnerError('No pudimos consultar tu desafío.')}).finally(()=>{if(active)setOwnerLoading(false)});return()=>{active=false}},[])
  useEffect(()=>{const controller=new AbortController();let active=true;async function load(){setLoading(true);setBoardError('');try{const r=await fetch(base+'/data?offset='+offset+(edition?'&edition='+edition:''),{cache:'no-store',signal:controller.signal});if(!r.ok)throw new Error();const d=await r.json();if(active)setBoard(d)}catch{if(active){setBoard(null);setBoardError('No pudimos consultar los resultados. Reintenta en unos momentos.')}}finally{if(active)setLoading(false)}}void load();return()=>{active=false;controller.abort()}},[edition,offset,refresh])
  const onClose=useCallback(()=>{setRefresh(n=>n+1);void session().then(setOwner).catch(()=>{})},[])
  async function start(){
    if(!owner||saving||!consent)return
    setSaving(true);setNotice('Preparando tu partida de 24 horas…')
    const key=`torneos.factory-empire.challenge-start.v1:${owner.accountId}`
    try{
      const raw=sessionStorage.getItem(key),command=raw?readChallengeStart(JSON.parse(raw)):readChallengeStart({commandId:crypto.randomUUID(),action:{kind:'start',alias}})
      if(!command)throw new Error('Inicio pendiente incompatible.');sessionStorage.setItem(key,JSON.stringify(command))
      const r=await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json','X-Factory-Account':owner.accountId},body:JSON.stringify(command),signal:AbortSignal.timeout(15000)}),d=await r.json()
      if(!r.ok||d.accountId!==owner.accountId||d.commandId!==command.commandId)throw new Error()
      sessionStorage.removeItem(key);setOwner(await session());setNotice('Desafío iniciado o recuperado. Solo tienes una partida por edición.');setRefresh(n=>n+1)
    }catch{setNotice('No se pudo confirmar el inicio. Reintenta: se recuperará la misma partida y su plazo original.')}finally{setSaving(false)}
  }
  const canStart=owner&&(!owner.entry||owner.entry.closed&&owner.entry.edition<new Date(owner.serverTimeMs).toISOString().slice(0,10))
  return <div className={styles.page}>
    <section className={styles.panel} aria-labelledby="challenge-owner"><h2 id="challenge-owner">Tu desafío</h2>
      {ownerLoading?<p role="status">Consultando tu partida…</p>:ownerError?<><p role="alert">{ownerError}</p><button className={styles.button} onClick={()=>void readOwner()}>Reintentar consulta</button></>:!owner?<Link className={styles.button} href="/sign-in?next=%2Fplay%2Ffactory-empire%2Fchallenge">Inicia sesión para participar</Link>:<>
        {owner.entry&&<p className={styles.muted}>Edición {owner.entry.edition} UTC · {owner.entry.closed?'Partida finalizada':'En curso'}{owner.entry.rank!==null?' · Puesto compartido '+owner.entry.rank:''}. <button className={styles.button} onClick={()=>{setEdition(owner.entry!.edition);setOffset(0);setRefresh(n=>n+1)}}>Ver resultados de mi edición</button></p>}
        {canStart?<form className={styles.form} onSubmit={e=>{e.preventDefault();void start()}}><label>Nombre público para el desafío<input className={styles.input} value={alias} onChange={e=>setAlias(e.target.value)} required minLength={3} maxLength={32} placeholder="Ej. Industria Aurora" disabled={saving}/></label><label className={styles.consent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={saving}/><span>Quiero iniciar mis 24 horas y mostrar este nombre y mi resultado en la clasificación gratuita.</span></label><button className={`${styles.button} ${styles.primary}`} disabled={!consent||saving||!board}>Empezar mis 24 horas</button></form>:owner.entry?.closed?<p className={styles.muted}>Esta edición admite una sola partida por cuenta. Puedes empezar una nueva cuando abra la siguiente edición.</p>:null}
        <button className={styles.button} disabled={saving} onClick={()=>void readOwner()}>Consultar mi partida</button>
      </>}
      <p role="status" className={styles.status}>{notice}</p></section>
    {owner?.entry&&<ChallengeGame key={owner.accountId+':'+owner.entry.entryId} entry={owner.entry} accountId={owner.accountId} serverTimeMs={owner.serverTimeMs} onClose={onClose}/>}
    <section className={styles.panel} aria-labelledby="challenge-results"><div className={styles.gameHeader}><h2 id="challenge-results">Resultados de 24 horas</h2><button className={styles.button} disabled={loading} onClick={()=>setRefresh(n=>n+1)}>Actualizar resultados</button></div><div className={styles.filters}><label>Edición UTC<input className={styles.input} type="date" value={edition||board?.edition||''} onChange={e=>{setEdition(e.target.value);setOffset(0)}}/></label><button className={styles.button} onClick={()=>{setEdition('');setOffset(0);setRefresh(n=>n+1)}}>Edición actual</button></div>
      <p className={styles.muted}>Cada jugador tiene 24 horas completas desde su inicio. Solo aparecen partidas finalizadas. La clasificación es provisional mientras otros jugadores completan esta edición.</p>
      <div className={styles.status} role="status">{loading?'Consultando resultados…':boardError||(!board?.items.length?'Todavía no hay partidas finalizadas en esta edición.':`${board.final?'Clasificación definitiva':'Clasificación provisional'} · ${board.finished} finalizadas · ${board.active} en curso`)}{!loading&&!!board?.closing&&` · ${board.closing} pendientes de cierre`}</div>
      {!!board?.items.length&&<ol className={styles.results}>{board.items.map(i=><li key={i.id} className={styles.result}><span className={styles.rank} aria-label={'Puesto '+i.rank}>{i.rank}</span><div><h3>{i.name}</h3><p className={styles.muted}>Finalizó {date(i.closedAtMs)}</p></div><dl><div><dt>Ferrita extraída</dt><dd>{communityAmount(i.scoreMilli)}</dd></div><div><dt>Producción final</dt><dd>{communityAmount(i.rateMilli)} /s</dd></div></dl></li>)}</ol>}
      <div className={styles.actions}>{offset>0&&<button className={styles.button} disabled={loading} onClick={()=>setOffset(Math.max(0,offset-20))}>Página anterior</button>}{board?.nextOffset!==null&&board?.nextOffset!==undefined&&<button className={styles.button} disabled={loading} onClick={()=>setOffset(board.nextOffset!)}>Más resultados</button>}</div>
    </section>
  </div>
}
