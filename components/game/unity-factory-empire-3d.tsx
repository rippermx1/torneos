'use client'

import {useEffect, useRef, useState} from 'react'
import builds from '@/lib/game/runtime-builds.json'
import {readFactory3dEvent} from '@/lib/game/factory-3d'
import {AccountColonyCommands,recoverAccountColony,ColonyHttpError,type AccountColonyReceipt} from '@/lib/game/factory-3d-client'
import {readColonyCommand,type ColonyAction,type ColonyCommand} from '@/lib/game/factory-3d-domain'
import styles from './unity-factory-empire.module.css'

type PrestigePreview={historical:string;gain:string;cores:string;bonusPercent:string;nextThreshold:string;count:number;machines:number;technologies:number;sectors:number;achievements:number}
function readPrestigePreview(payload:string):PrestigePreview|null {
  const p=JSON.parse(payload) as PrestigePreview
  if(!p||!['historical','gain','cores','bonusPercent','nextThreshold'].every(k=>typeof p[k as keyof PrestigePreview]==='string'&&/^\d{1,64}$/.test(String(p[k as keyof PrestigePreview])))||!['count','machines','technologies','sectors','achievements'].every(k=>Number.isSafeInteger(p[k as keyof PrestigePreview])&&Number(p[k as keyof PrestigePreview])>=0))return null
  return p
}
const ferrita=(milli:string)=>(BigInt(milli)/BigInt(1000)).toLocaleString('es-CL')

export function UnityFactoryEmpire3D() {
  const frame = useRef<HTMLIFrameElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [status, setStatus] = useState('Cargando Factory Empire 3D…')
  const [mode,setMode]=useState<'local'|'account'>('local')
  const [failed,setFailed]=useState(false)
  const [signIn,setSignIn]=useState(false)
  const retry=useRef<()=>void>(()=>{})
  const [prestige,setPrestige]=useState<PrestigePreview|null>(null)
  const prestigeDialog=useRef<HTMLDialogElement>(null)
  const guiProfile=useRef<HTMLSelectElement>(null)
  const build = builds['factory-empire']
  const sendUi=(method:'OpenPrestige'|'ConfirmPrestige'|'OnGuiProfile',payload='')=>frame.current?.contentWindow?.postMessage({channel:'torneos.factory-empire',version:2,build,type:'ui',method,payload},location.origin)
  useEffect(()=>{try{const saved=localStorage.getItem('torneos.factory-empire.gui-profile');if(guiProfile.current&&['auto','desktop','mobile'].includes(saved??''))guiProfile.current.value=saved!}catch{/* A profile preference is optional when storage is blocked. */}},[])
  useEffect(()=>{if(prestige&&!prestigeDialog.current?.open)prestigeDialog.current?.showModal()},[prestige])
  useEffect(() => {
    let ready=false,disposed=false,busy=false,blocked=false,commands:AccountColonyCommands|undefined
    const send=(method:string,payload:string)=>frame.current?.contentWindow?.postMessage({channel:'torneos.factory-empire',version:2,build,type:'server',method,payload},location.origin)
    async function request(command:ColonyCommand):Promise<AccountColonyReceipt>{
      const response=await fetch('/play/factory-empire/server',{method:'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',...(commands?{'X-Factory-Account':commands.accountId}:{})},body:JSON.stringify(command)})
      const data=await response.json();if(!response.ok)throw new ColonyHttpError(response.status,data.code??'storage_unavailable');return data
    }
    const apply=(r:AccountColonyReceipt)=>{if(disposed)return;blocked=false;send('OnServerState',JSON.stringify(r));setStatus(r.message);setFailed(false);setSignIn(false)}
    const error=(e:unknown)=>{if(disposed)return;blocked=true;const login=e instanceof ColonyHttpError&&[401,403].includes(e.status);setSignIn(login);setFailed(true);const message=login?'Inicia sesión con tu cuenta de jugador para recuperar la colonia.':'No se pudo confirmar la acción. Reintenta; tu partida local sigue separada.';setStatus(message);send('OnServerError',message)}
    async function execute(action?:ColonyAction){
      if(busy||!ready||mode!=='account')return;busy=true;send('OnServerWaiting','Confirmando con el servidor…')
      try {
        if(!commands){const loaded=await recoverAccountColony(sessionStorage,request);commands=new AccountColonyCommands(loaded.accountId,sessionStorage,request);apply(loaded);if(commands.hasPending){await commands.retry();apply(await commands.submit({kind:'sync'}));}}
        else if(commands.hasPending){await commands.retry();apply(await commands.submit({kind:'sync'}));}
        else apply(await commands.submit(action??{kind:'sync'}))
      }catch(e){error(e)}finally{busy=false}
    }
    retry.current=()=>{void execute()}
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return
      const d = readFactory3dEvent(event.data, build)
      if (!d) return
      if (d.type === 'ready') {
        ready = true
        // Reapply after native Start: the template can detect input before the
        // HUD exists, while this receipt guarantees that it has been created.
        frame.current?.contentWindow?.postMessage({channel:'torneos.factory-empire',version:2,build,type:'ui',method:'OnGuiProfile',payload:guiProfile.current?.value??'auto'},location.origin)
        if(mode==='account')void execute();else setStatus('Colonia 3D · práctica local · sin clasificación competitiva')
      }
      if (d.type === 'error') setStatus(d.payload)
      if(d.type==='prestige-preview'){try{const p=readPrestigePreview(d.payload);if(p)setPrestige(p)}catch{setStatus('No se pudo revisar el legado.')}}
      if(d.type==='prestige-complete'){setPrestige(null);setStatus(d.payload)}
      if(d.type==='intent'&&mode==='account'){
        try {
          const raw=JSON.parse(d.payload),keys:Record<string,string[]>={mine:['kind'],build:['kind','definitionId','x','z','orientation'],move:['kind','instanceId','x','z','orientation'],upgrade:['kind','instanceId'],technology:['kind','technologyId'],expand:['kind','x','z'],prestige:['kind','expectedGain','expectedPrestiges']}
          if(!Object.hasOwn(keys,raw.kind))throw new Error('Intención inválida.')
          const parsed=readColonyCommand({commandId:crypto.randomUUID(),action:Object.fromEntries(keys[raw.kind].map(k=>[k,raw[k]]))})
          if(!parsed)throw new Error('Intención inválida.')
          if(!busy&&!blocked)void execute(parsed.action)
        }catch(e){error(e)}
      }
    }
    window.addEventListener('message', receive)
    // A cached WebGL iframe can boot before React hydrates its parent. Register
    // the correlated receiver before navigating the initially blank iframe.
    if(frame.current)frame.current.src=`/games/factory-empire/${build}/index.html${mode==='account'?'?persistence=account':''}`
    const timeout = setTimeout(() => {if (!ready) setStatus('La carga está tardando. Recarga para reintentar.')}, 90000)
    const poll=setInterval(()=>{if(!blocked&&!document.hidden&&commands&&!commands.hasPending)void execute({kind:'sync'})},5000)
    return () => {disposed=true;window.removeEventListener('message', receive); clearTimeout(timeout);clearInterval(poll)}
  }, [build,mode])
  useEffect(() => {
    const previous = document.body.style.overflow
    if (expanded) document.body.style.overflow = 'hidden'
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape') setExpanded(false)}
    window.addEventListener('keydown', escape)
    return () => {document.body.style.overflow = previous; window.removeEventListener('keydown', escape)}
  }, [expanded])
  return <section aria-label="Factory Empire 3D" className={expanded ? styles.expanded : styles.player}>
    {prestige&&<dialog ref={prestigeDialog} className={styles.prestigeDialog} aria-labelledby="prestige-title" onCancel={()=>setPrestige(null)}>
      <p className={styles.prestigeEyebrow}>LEGADO DE NEREIDA · {mode==='account'?'TU CUENTA':'PARTIDA LOCAL'}</p>
      <h2 id="prestige-title">Comienza una colonia más potente</h2>
      <p>Has extraído {ferrita(prestige.historical)} ferritas históricas.</p>
      <div className={styles.prestigeReward}><strong>+{prestige.gain} núcleos</strong><span>{prestige.cores} obtenidos · +{prestige.bonusPercent}% permanente actual</span></div>
      <p>Cada núcleo añade +1% a la producción de tus máquinas. Próximo núcleo acumulado: {ferrita(prestige.nextThreshold)} ferritas históricas.</p>
      <p><strong>Se reinician:</strong> saldo, extracción del ciclo, {prestige.machines} máquinas con sus mejoras, {prestige.technologies} tecnologías y los sectores comprados. Vuelves al sector inicial.</p>
      <p><strong>Conservas:</strong> extracción histórica, núcleos permanentes y tus {prestige.achievements} logros ganados. Ascensiones realizadas: {prestige.count}.</p>
      {prestige.gain==='0'&&<p>Continúa extrayendo para conseguir un nuevo núcleo.</p>}
      <div className={styles.prestigeActions}><button className={styles.tool} onClick={()=>setPrestige(null)} autoFocus>Seguir con mi colonia</button><button className={styles.prestigeConfirm} disabled={prestige.gain==='0'} onClick={()=>{sendUi('ConfirmPrestige',JSON.stringify({expectedGain:prestige.gain,expectedPrestiges:prestige.count}));setPrestige(null)}}>Confirmar ascensión y reiniciar</button></div>
    </dialog>}
    <div className={`${styles.toolbar} ${styles.colonyToolbar}`}><span role="status">{status}</span>{mode==='account'&&failed&&<button className={styles.tool} onClick={()=>retry.current()}>Reintentar guardado</button>}{signIn&&<a className={styles.tool} href="/sign-in?next=%2Fplay%2Ffactory-empire">Iniciar sesión</a>}<button className={styles.tool} onClick={()=>{setFailed(false);setSignIn(false);setStatus('Cargando colonia…');setMode(mode==='local'?'account':'local')}}>{mode==='local'?'Jugar con mi cuenta':'Volver a partida local'}</button><button className={styles.tool} onClick={()=>sendUi('OpenPrestige')}>Legado</button><label className={styles.profile}>Interfaz <select ref={guiProfile} defaultValue="auto" onChange={event=>{const profile=event.target.value;try{localStorage.setItem('torneos.factory-empire.gui-profile',profile)}catch{/* Keep the selected interface for this session. */}sendUi('OnGuiProfile',profile)}}><option value="auto">Automática según dispositivo</option><option value="desktop">Escritorio · ratón y teclado</option><option value="mobile">Móvil · controles táctiles</option></select></label><button className={styles.tool} aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Salir de vista ampliada' : 'Ampliar juego'}</button></div>

    <div className={`${styles.game} ${styles.colonyGame}`}><iframe key={mode} ref={frame} src="about:blank" title="Factory Empire 3D · colonia minera" sandbox="allow-scripts allow-same-origin" className="h-full w-full border-0" /></div>
    {!expanded && <p className="text-xs text-muted-foreground">Extraer: mantén pulsada la veta o usa Auto. Construir: elige máquina y ubicación, ajusta con flechas o W/A/S/D, gira con R y pulsa Confirmar. Cámara: derecho orbita, central o Mayús desplaza, rueda acerca; Q/E gira, Re Pág/Av Pág inclina e Inicio centra. En móvil, arrastra para desplazar y usa dos dedos para girar y zoom. Cámara abre los botones y permite elegir arrastre orbital. Tab recorre botones, Enter los activa, N selecciona la siguiente máquina, Inicio centra y Esc cancela.</p>}
  </section>
}
