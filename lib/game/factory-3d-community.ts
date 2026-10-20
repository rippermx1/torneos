import {colonyRate,validateColony,type ColonyState} from './factory-3d-domain'
export const publicColonyId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type CommunityOrder='production'|'history'
export interface PublicColony {id:string;name:string;productionMilli:string;historicalMilli:string;cores:string;prestiges:number;machines:number;snapshotAt:string;publishedAt:string;revision:number}
export interface ColonyVisit {colony:PublicColony;state:ColonyState}
export function readCommunityQuery(url:URL) {
  if([...url.searchParams.keys()].some(k=>!['id','order','offset'].includes(k))||[...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1))return null
  const id=url.searchParams.get('id'),order=url.searchParams.get('order')??'production',offset=url.searchParams.get('offset')??'0'
  if((id&&!publicColonyId.test(id))||(id!==null&&!id)||!['production','history'].includes(order)||!/^\d{1,4}$/.test(offset)||Number(offset)>1000||(id&&Number(offset)!==0))return null
  return {id,order:order as CommunityOrder,offset:Number(offset)}
}
export function readSharing(value:unknown):{visible:boolean;alias?:string}|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null
  const v=value as Record<string,unknown>,keys=Object.keys(v).sort().join(',')
  if(v.visible===false&&keys==='visible')return {visible:false}
  if(v.visible!==true||keys!=='alias,visible'||typeof v.alias!=='string')return null
  const alias=v.alias.trim().normalize('NFC')
  return /^[\p{L}\p{N} _.-]{3,32}$/u.test(alias)?{visible:true,alias}:null
}
function summary(value:unknown):PublicColony {
  if(!value||typeof value!=='object')throw new Error('Invalid publication')
  const p=value as Record<string,unknown>
  if(typeof p.id!=='string'||!publicColonyId.test(p.id)||typeof p.name!=='string'||!readSharing({visible:true,alias:p.name})||!['productionMilli','historicalMilli','cores'].every(k=>typeof p[k]==='string'&&/^\d{1,60}$/.test(p[k] as string))||!['prestiges','machines','revision'].every(k=>Number.isSafeInteger(p[k])&&Number(p[k])>=0)||!['snapshotAt','publishedAt'].every(k=>typeof p[k]==='string'&&Number.isFinite(Date.parse(p[k] as string))))throw new Error('Invalid publication')
  return {id:p.id,name:p.name,productionMilli:p.productionMilli as string,historicalMilli:p.historicalMilli as string,cores:p.cores as string,prestiges:p.prestiges as number,machines:p.machines as number,snapshotAt:p.snapshotAt as string,publishedAt:p.publishedAt as string,revision:p.revision as number}
}
export function publicDirectory(value:unknown,offset:number) {
  const items=(value as {items?:unknown[]})?.items
  if(!Array.isArray(items)||items.length>26)throw new Error('Invalid directory')
  return {items:items.slice(0,25).map(summary),nextOffset:items.length>25&&offset+25<=1000?offset+25:null,prizeEligible:false as const}
}
export function publicVisit(value:unknown):ColonyVisit|null {
  const items=(value as {items?:unknown[]})?.items
  if(!Array.isArray(items)||items.length>1)throw new Error('Invalid visit')
  if(items.length===0)return null
  const colony=summary(items[0]),s=(items[0] as {state:ColonyState}).state
  validateColony(s)
  if(colonyRate(s).toString()!==colony.productionMilli||s.historical!==colony.historicalMilli||s.revision!==colony.revision||s.structures.length!==colony.machines||colony.cores!==(s.coresAwarded??'0')||colony.prestiges!==(s.prestigeCount??0))throw new Error('Invalid metrics')
  // Explicit projection: never return account/world IDs, balance or click timestamps.
  const state:ColonyState={schema:4,seed:s.seed,rulesVersion:s.rulesVersion,worldId:colony.id,mode:'account-practice',balance:'0',extracted:'0',historical:s.historical,revision:s.revision,lastSettledMs:Date.parse(colony.snapshotAt),lastManualMs:0,remainder:0,sectors:[...s.sectors],structures:s.structures.map((b,i)=>({instanceId:`public-machine-${i}`,definitionId:b.definitionId,cellX:b.cellX,cellZ:b.cellZ,orientation:b.orientation,level:b.level})),technologies:[...s.technologies],coresAwarded:s.coresAwarded??'0',prestigeCount:s.prestigeCount??0,earnedAchievements:[...(s.earnedAchievements??[])]}
  return {colony,state}
}
export function communityAmount(milli:string) {
  const n=BigInt(milli),fraction=(n%BigInt(1000)).toString().padStart(3,'0').replace(/0+$/,'')
  return (n/BigInt(1000)).toLocaleString('es-CL')+(fraction?','+fraction:'')
}
