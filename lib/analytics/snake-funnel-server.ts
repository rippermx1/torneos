import 'server-only'
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises'
import path from 'node:path'
import {FUNNEL_RETENTION,FUNNEL_TTL,type FunnelStep,type FunnelEvent,type FunnelState} from './snake-funnel'
export const FUNNEL_COOKIE='tp_snake_journey'
type Session={id:string;at:number}
const config=()=>({directory:process.env.WEB_FUNNEL_DIR,secret:process.env.WEB_FUNNEL_SECRET})
export function funnelEnabled(){const c=config();return process.env.NEXT_PUBLIC_SNAKE_FUNNEL==='1'&&!!c.directory&&!!c.secret&&c.secret.length>=32}
const mac=(value:string,secret:string)=>createHmac('sha256',secret).update(value).digest('hex')
export function newFunnelSession(now=Date.now()){return {id:randomUUID(),at:now}}
export function signFunnelSession(session:Session){const secret=config().secret!;const text=`${session.id}.${session.at}`;return `${text}.${mac(text,secret)}`}
export function funnelSession(request:Request,now=Date.now()):Session|null{
  const secret=config().secret;if(!secret||secret.length<32)return null
  const value=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(FUNNEL_COOKIE+'='))?.slice(FUNNEL_COOKIE.length+1)
  if(!value)return null
  const parts=value.split('.');if(parts.length!==3||!/^[0-9a-f-]{36}$/.test(parts[0])||!/^\d{13}$/.test(parts[1])||!/^[0-9a-f]{64}$/.test(parts[2]))return null
  const at=Number(parts[1]);if(at>now||now-at>=FUNNEL_TTL)return null
  const expected=mac(parts[0]+'.'+parts[1],secret)
  if(!timingSafeEqual(Buffer.from(parts[2],'hex'),Buffer.from(expected,'hex')))return null
  return {id:parts[0],at}
}
export function funnelOrigin(request:Request){
  const origin=request.headers.get('origin')
  const allowed=[process.env.APP_URL,...(process.env.SNAKE_PRACTICE_ORIGINS??'').split(',')].filter(Boolean)
  return !!origin&&allowed.some(value=>{try{return new URL(value!).origin===origin}catch{return false}})
}
const file=()=>path.join(config().directory!,'snake-funnel.json')
export async function readFunnelState():Promise<FunnelState>{
  try{const text=await readFile(file(),'utf8');if(text.length>2_000_000)throw new Error('Funnel capacity exceeded');const state=JSON.parse(text) as FunnelState;if(state.version!==1||!state.journeys||typeof state.journeys!=='object'||Array.isArray(state.journeys)||Object.keys(state.journeys).length>1000)throw new Error('Invalid funnel data');return state}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {version:1,updatedAt:0,journeys:{}};throw error}
}
// A single pilot Node process shares this queue across independently bundled route handlers.
const shared=globalThis as typeof globalThis&{snakeFunnelWrites?:Promise<unknown>}
export function recordFunnel(session:Session,event:FunnelStep,extra:Partial<FunnelEvent>={},now=Date.now()){
  const write=(shared.snakeFunnelWrites??Promise.resolve()).catch(()=>{}).then(async()=>{
    const state=await readFunnelState()
    for(const [id,j] of Object.entries(state.journeys))if(j.startedAt<now-FUNNEL_RETENTION)delete state.journeys[id]
    if(!state.journeys[session.id]){if(event!=='practice_view')return false;if(Object.keys(state.journeys).length>=1000)throw new Error('Funnel capacity exceeded');state.journeys[session.id]={startedAt:session.at,steps:{}}}
    const j=state.journeys[session.id];if(j.steps[event]!==undefined)return true
    j.steps[event]=now;if(event==='tournaments_click'&&extra.surface)j.surface=extra.surface;if(event==='catalog_view'&&extra.availability)j.availability=extra.availability
    state.updatedAt=Math.max(state.updatedAt,now);await mkdir(config().directory!,{recursive:true})
    const temp=file()+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify(state)+'\n',{mode:0o600});await rename(temp,file())}finally{await unlink(temp).catch(()=>{})}return true
  });shared.snakeFunnelWrites=write;return write
}
export async function recordConfirmedSnakeRegistration(request:Request,registeredAt:()=>Promise<string|null>){
  if(!funnelEnabled())return
  const session=funnelSession(request);if(!session)return
  try{const timestamp=Date.parse(await registeredAt()??'');if(!Number.isFinite(timestamp)||timestamp<session.at||timestamp>Date.now())return;await recordFunnel(session,'registration_confirmed',{},timestamp)}catch{console.error('[snake-funnel] registration metric unavailable')}
}
