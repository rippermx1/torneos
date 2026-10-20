import {readLightRain,type LightRain} from './snake-light-rain'
import builds from './runtime-builds.json'
import {readSnakeProgress,type SnakeProgress} from './snake-arena-missions'
import {readDailyProgress,type DailyProgress} from './snake-daily-missions'
import {isArenaQuality,type ArenaQuality} from './snake-arena-quality'
export const SNAKE_CHANNEL='torneos.snake-arena'
export const SNAKE_BUILD=builds['snake-arena']
export type ArenaRank={id:string;name:string;score:number;rank:number}
export type ArenaResult={score:number;rank:number;kills:number;survivedSeconds:number;maxSize:number;personalBest:number;reason:string}
export type ArenaResource={id:number;x:number;y:number;kind?:string;expiresTick?:number}
export type SpecialResource={nextSpawnTick:number;score:number;mass:number;simulationHz:number}
export function rareResourceHint(tick:number,food:ArenaResource[],special:SpecialResource,me?:{x:number;y:number}){
  const rare=food.find(f=>f.kind==='rare')
  const seconds=Math.max(0,Math.ceil(((rare?.expiresTick??special.nextSpawnTick)-tick)/special.simulationHz))
  const direction=rare&&me?['→','↗','↑','↖','←','↙','↓','↘'][(Math.round(Math.atan2(rare.y-me.y,rare.x-me.x)*4/Math.PI)+8)%8]:''
  return {active:!!rare,seconds,direction,mass:special.mass,score:special.score}
}
export type ArenaData={v:number;type:string;id?:string;tick?:number;food?:ArenaResource[];specialResource?:SpecialResource;lightRain?:LightRain;authenticated?:boolean;resumed?:boolean;recoverable?:boolean;saveState?:string;state?:string;best?:number;config?:{maxPlayers:number;boostMinMass?:number;boostMassPerSecond?:number;boostMultiplier?:number};players?:{id:string;alive:boolean;appearance?:string;score:number;mass:number;x?:number;y?:number;rarePickups?:number;practiceProgress?:SnakeProgress;boosting?:boolean}[];leaderboard?:ArenaRank[];metrics?:{tickMs:number;snapshotBytes:number;entities:number;ccu:number};code?:string;fps?:number;frameMsP95?:number;wasmAllocatedMB?:number;ms?:number;quality?:ArenaQuality} & Partial<ArenaResult>
export type AccountProgress={accountXp?:number;pendingXp?:number;xpState?:string;daily?:DailyProgress;dailyState?:string}
export function readArenaMessage(value:unknown):(ArenaData&AccountProgress)|null {
  if(!value || typeof value!=='object')return null
  const m=value as {channel?:unknown;version?:unknown;build?:unknown;data?:unknown}
  if(m.channel!==SNAKE_CHANNEL||m.version!==1||m.build!==SNAKE_BUILD||!m.data||typeof m.data!=='object')return null
  const d=m.data as ArenaData&AccountProgress
  if(d.quality!==undefined&&!isArenaQuality(d.quality))return null
  if([d.accountXp,d.pendingXp].some(n=>n!==undefined&&(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>1_000_000_000)))return null
  if(d.xpState!==undefined&&!['saving','saved','retrying'].includes(d.xpState))return null
  if(d.daily!==undefined&&!readDailyProgress(d.daily))return null
  if(d.dailyState!==undefined&&!['saving','saved','retrying'].includes(d.dailyState))return null
  if(d.v!==1||!['ready','welcome','snapshot','result','error','disconnect','fps','rtt','authenticated','persistence'].includes(d.type))return null
  if(d.type==='snapshot' && (!Array.isArray(d.players)||d.players.some(p=>!p||typeof p.boosting!=='boolean'&&p.boosting!==undefined)))return null
  if(d.type==='snapshot' && d.players?.some(p=>p.practiceProgress!==undefined&&!readSnakeProgress(p.practiceProgress)))return null
  if(d.lightRain!==undefined&&!readLightRain(d.lightRain))return null
  if(d.type==='result' && !['score','rank','kills','survivedSeconds','maxSize','personalBest'].every(k=>typeof d[k as keyof ArenaResult]==='number' && Number.isFinite(d[k as keyof ArenaResult])))return null
  if(d.type==='fps' && [d.fps,d.frameMsP95,d.wasmAllocatedMB].some(n=>n!==undefined && (typeof n!=='number'||!Number.isFinite(n)||n<0)))return null
  return d
}
