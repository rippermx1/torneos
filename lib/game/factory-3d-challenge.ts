import {applyColonyCommand,type ColonyCommand,type ColonyReceipt,type ColonyState} from './factory-3d-domain'
import frozenRules from '../../games/factory-empire/UnityProject/Assets/FactoryEmpire3D/Resources/factory-3d-rules-challenge.json'
import config from '../../games/factory-empire/UnityProject/Assets/FactoryEmpire3D/Resources/factory-3d-challenge.json'
import {readSharing} from './factory-3d-community'

export const challengeConfig=config
export const challengeContent={challenge:config,rules:frozenRules}
export interface ChallengeReceipt extends ColonyReceipt {
  entryId:string; edition:string; startedAtMs:number; endsAtMs:number; closed:boolean; rulesHash:string; scoreMilli:string
}
export interface ChallengeEntry extends ChallengeReceipt {alias:string; rank:number|null}
export interface ChallengeStatus {accountId:string; serverTimeMs:number; entry:ChallengeEntry|null}
export interface ChallengeBoard {
  edition:string; serverTimeMs:number; durationMs:number; seed:number; rulesHash:string; final:boolean; closing:number; active:number; finished:number;
  items:{id:string;name:string;rank:number;scoreMilli:string;rateMilli:string;closedAtMs:number}[];nextOffset:number|null;prizeEligible:false
}
export interface ChallengeStore {
  load(commandId:string,hash:string):Promise<{receipt?:ChallengeReceipt;state?:ColonyState;revision?:number;serverTimeMs?:number;entryId?:string;edition?:string;startedAtMs?:number;endsAtMs?:number;rulesHash?:string}>
  commit(commandId:string,hash:string,revision:number,receipt:ChallengeReceipt):Promise<{receipt?:ChallengeReceipt;conflict?:boolean}>
}
export type ChallengeStart={commandId:string;action:{kind:'start';alias:string}}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const challengeId=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value)
export function readChallengeStart(input:unknown):ChallengeStart|null {
  if(!input||typeof input!=='object'||Array.isArray(input))return null
  const v=input as Record<string,unknown>,a=v.action as Record<string,unknown>|undefined
  if(Object.keys(v).sort().join(',')!=='action,commandId'||!challengeId(v.commandId)||!a||typeof a!=='object'||Object.keys(a).sort().join(',')!=='alias,kind'||a.kind!=='start')return null
  const shared=readSharing({visible:true,alias:a.alias})
  return shared?.alias?{commandId:v.commandId.toLowerCase(),action:{kind:'start',alias:shared.alias}}:null
}
export function readChallengeQuery(url:URL){
  if([...url.searchParams.keys()].some(k=>!['edition','offset'].includes(k))||['edition','offset'].some(k=>url.searchParams.getAll(k).length>1))return null
  const edition=url.searchParams.get('edition'),offset=url.searchParams.get('offset')??'0'
  if(edition){const date=new Date(edition+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(edition)||edition<'2026-01-01'||edition>'9998-12-31'||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==edition)return null}
  if(!/^(0|[1-9]\d{0,3})$/.test(offset)||Number(offset)>1000||Number(offset)%20)return null
  return {edition:edition??null,offset:Number(offset)}
}
// The caller injects a server timestamp and the edition's persisted deadline.
// A completed challenge is finalized in SQL; no late action enters this engine.
export function applyChallengeCommand(state:ColonyState,command:ColonyCommand,now:number,endsAtMs:number,instanceId:string){
  if(state.mode!=='normalized-challenge'||!Number.isSafeInteger(endsAtMs)||now>=endsAtMs)throw new Error('challenge_closed')
  return applyColonyCommand(state,command,now,instanceId)
}
export async function persistChallenge(store:ChallengeStore,command:ColonyCommand,rulesHash:string,hash:string,instanceId:()=>string){
  for(let n=0;n<6;n++){
    const loaded=await store.load(command.commandId,hash)
    if(loaded.receipt)return loaded.receipt
    if(!loaded.state||loaded.state.revision!==loaded.revision||!Number.isSafeInteger(loaded.serverTimeMs)||!Number.isSafeInteger(loaded.startedAtMs)||!Number.isSafeInteger(loaded.endsAtMs)||(loaded.endsAtMs! - loaded.startedAtMs!) !== config.durationMs||loaded.rulesHash!==rulesHash||!challengeId(loaded.entryId))throw new Error('challenge_storage_incompatible')
    const base=applyChallengeCommand(loaded.state,command,loaded.serverTimeMs!,loaded.endsAtMs!,instanceId())
    const receipt:ChallengeReceipt={...base,entryId:loaded.entryId!,edition:loaded.edition!,startedAtMs:loaded.startedAtMs!,endsAtMs:loaded.endsAtMs!,closed:false,rulesHash,scoreMilli:base.state.historical,message:base.accepted?'Desafío guardado por el servidor.':base.message}
    const committed=await store.commit(command.commandId,hash,loaded.revision!,receipt)
    if(committed.receipt)return committed.receipt
    if(!committed.conflict)throw new Error('challenge_unavailable')
  }
  throw new Error('challenge_busy')
}
