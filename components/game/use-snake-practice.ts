'use client'
import {useCallback,useEffect,useRef,useState,type RefObject} from 'react'
import {canUseAppearance,type SnakeAppearance} from '@/lib/game/snake-arena-cosmetics'
import {SNAKE_CHANNEL,readArenaMessage} from '@/lib/game/snake-arena-client'
import {dailyProgress,readDailyProgress,type DailyProgress} from '@/lib/game/snake-daily-missions'
type Account={userId:string;name:string;best:number;xp:number;daily:DailyProgress;history:{id:string;score:number;ended_at:string;survived_seconds:number}[]}
function mergeDaily(previous:DailyProgress|undefined,next:DailyProgress){
  if(previous?.day===next.day)return dailyProgress(next.serverNow,Object.fromEntries(next.missions.map((m,i)=>[m.id,Math.max(m.value,previous.missions[i].value)])) as {lights:number;growth:number;stars:number})
  return previous&&previous.day>next.day?previous:next
}
export function useSnakePractice(frame:RefObject<HTMLIFrameElement|null>){
  const [xpState,setXpState]=useState('saved'),[pendingXp,setPendingXp]=useState(0)
  const [dailyState,setDailyState]=useState('saved')
  const [account,setAccount]=useState<Account|null>(null),[accountState,setAccountState]=useState('loading'),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[saveState,setSaveState]=useState('none')
  const saveStateRef=useRef('none')
  const owner=useRef<Account|null>(null),authenticated=useRef(false),active=useRef(false),deadline=useRef(0),epoch=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null),disposed=useRef(false),attempt=useRef(false)
  const post=useCallback((type:string,data:Record<string,unknown>={})=>frame.current?.contentWindow?.postMessage({channel:SNAKE_CHANNEL,version:1,type,...data},location.origin),[frame])
  const hint=(id?:string)=>{try{if(id)sessionStorage.setItem('snake-practice-resume',JSON.stringify({userId:id,at:Date.now()}));else sessionStorage.removeItem('snake-practice-resume')}catch{}}
  const load=useCallback(async()=>{
    const response=await fetch('/play/snake-arena/account',{cache:'no-store',signal:AbortSignal.timeout(5000)})
    if(response.status===401){owner.current=null;if(!disposed.current){setAccount(null);setAccountState('guest')}return null}
    if(!response.ok)throw new Error('No se pudo consultar tu historial. Intenta nuevamente.')
    const value=await response.json() as Account
    if(!Number.isSafeInteger(value.xp)||value.xp<0||value.xp>1_000_000_000)throw new Error('No se pudo confirmar tu XP.')
    if(!readDailyProgress(value.daily))throw new Error('No se pudo confirmar tus misiones diarias.')
    if(owner.current?.userId===value.userId){value.xp=Math.max(value.xp,owner.current.xp);value.daily=mergeDaily(owner.current.daily,value.daily)}
    owner.current=value
    if(!disposed.current){setAccount(value);setAccountState('signed')};return value
  },[])
  const admission=useCallback(async()=>{
    const response=await fetch('/play/snake-arena/admission',{method:'POST',signal:AbortSignal.timeout(4000)})
    if(!response.ok)throw new Error(response.status===401||response.status===403?'Vuelve a iniciar sesión para guardar tu práctica.':'La conexión con tu cuenta no está disponible.')
    return await response.json() as {ticket:string;userId:string}
  },[])
  const recover=useCallback(async function retry(){
    if(disposed.current||!active.current||!authenticated.current||attempt.current)return
    if(Date.now()>=deadline.current){active.current=false;hint();setBusy(false);setNotice('No se recuperó la conexión a tiempo. Puedes iniciar otra partida.');return}
    const generation=epoch.current;attempt.current=true
    try{const auth=await admission();if(generation!==epoch.current||disposed.current)return;if(auth.userId!==owner.current?.userId)throw new Error('La cuenta cambió. Entra nuevamente a la arena.');post('join',{ticket:auth.ticket,resumeOnly:true})}
    catch(error){if(generation===epoch.current&&!disposed.current)setNotice(error instanceof Error?error.message:'Reconectando…')}
    finally{attempt.current=false;if(generation===epoch.current&&!disposed.current&&active.current)timer.current=setTimeout(retry,750)}
  },[admission,post])
  const begin=useCallback(async(type:'join'|'restart',appearance:SnakeAppearance='aurora')=>{
    if(attempt.current)return
    if(type==='restart'){saveStateRef.current='none';setSaveState('none');post(type,{appearance});return}
    epoch.current++;deadline.current=0;if(timer.current)clearTimeout(timer.current);setBusy(true);setNotice('');attempt.current=true
    try{const a=await load();if(disposed.current)return;if(!canUseAppearance(appearance,a?.xp??null))throw new Error('Ese aspecto requiere XP guardada de tu cuenta. Elige uno disponible e intenta nuevamente.');if(a){const auth=await admission();if(auth.userId!==a.userId)throw new Error('La cuenta cambió. Intenta nuevamente.');authenticated.current=true;post('join',{ticket:auth.ticket,appearance})}else{authenticated.current=false;post('join',{appearance})}active.current=true}
    catch(error){setBusy(false);setNotice(error instanceof Error?error.message:'No se pudo entrar.');setAccountState(owner.current?'signed':'unavailable')}
    finally{attempt.current=false}
  },[admission,load,post])
  const invalidate=useCallback(()=>{epoch.current++},[])
  useEffect(()=>{
    disposed.current=false
    void load().catch(()=>{if(!disposed.current)setAccountState('unavailable')})
    const receive=(event:MessageEvent)=>{
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return
      const data=readArenaMessage(event.data);if(!data)return
      if((data.type==='welcome'||data.type==='persistence')&&data.accountXp!==undefined&&owner.current){
        const value={...owner.current,xp:Math.max(owner.current.xp,data.accountXp),daily:data.daily?mergeDaily(owner.current.daily,data.daily):owner.current.daily};owner.current=value;setAccount(value)
        setXpState(data.xpState??'saved');setPendingXp(data.pendingXp??0)
        setDailyState(data.dailyState??'saved')
      }
      if(data.type==='ready')void load().then(a=>{if(!a||disposed.current)return;try{const old=JSON.parse(sessionStorage.getItem('snake-practice-resume')??'null');if(old?.userId===a.userId&&Date.now()-old.at<15000){authenticated.current=true;active.current=true;deadline.current=Date.now()+12000;setBusy(true);setNotice('Recuperando tu partida…');void recover()}}catch{}}).catch(()=>{})
      if(data.type==='welcome'){epoch.current++;if(timer.current)clearTimeout(timer.current);deadline.current=0;active.current=true;authenticated.current=data.authenticated===true;setBusy(false);setNotice(data.resumed?'Partida recuperada.':'');saveStateRef.current='none';setSaveState('none');if(authenticated.current&&owner.current)hint(owner.current.userId)}
      if(data.type==='snapshot'&&authenticated.current&&owner.current){try{const old=JSON.parse(sessionStorage.getItem('snake-practice-resume')??'null');if(!old||Date.now()-old.at>5000)hint(owner.current.userId)}catch{}}
      if(data.type==='result')setSaveState(data.saveState??'none')
      if(data.type==='persistence'){setSaveState(data.state??'none');if(data.state==='saved'&&saveStateRef.current!=='saved')void load().catch(()=>setNotice('Partida guardada. No se pudo actualizar la lista todavía.'));saveStateRef.current=data.state??'none'}
      if(data.type==='disconnect'){
        if(data.recoverable&&authenticated.current&&active.current){if(!deadline.current)deadline.current=Date.now()+12000;setBusy(true);setNotice('Reconectando… tu criatura sigue en la arena.');if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void recover(),250)}
        else{epoch.current++;active.current=false;hint();if(timer.current)clearTimeout(timer.current);setBusy(false);setNotice(data.code==='session_replaced'?'La partida se abrió en otra pestaña.':data.code==='resume_expired'?'La partida ya no está disponible. Puedes iniciar otra.':'Conexión cerrada. Puedes volver a entrar.')}
      }
      if(data.type==='error'&&['capacity','spawn_busy','practice_store_busy','authentication_required','appearance_locked'].includes(data.code??''))setBusy(false)
    }
    window.addEventListener('message',receive)
    const renew=setInterval(()=>{if(!authenticated.current||!active.current||deadline.current)return;void admission().then(auth=>{if(disposed.current)return;if(auth.userId!==owner.current?.userId){post('leave');return}post('authenticate',{ticket:auth.ticket})}).catch(error=>{if(!disposed.current)setNotice(error.message)})},60000)
    return()=>{disposed.current=true;invalidate();if(timer.current)clearTimeout(timer.current);clearInterval(renew);window.removeEventListener('message',receive)}
  },[admission,frame,load,post,recover,invalidate])
  return {account,accountState,notice,busy,saveState,xpState,pendingXp,dailyState,begin,refresh:()=>void load().catch(()=>setNotice('No se pudo actualizar el historial.')),testDrop:()=>post('drop')}
}
