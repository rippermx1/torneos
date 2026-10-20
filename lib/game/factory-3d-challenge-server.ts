import {createHash,randomUUID} from 'node:crypto'
import {createAdminClient} from '@/lib/supabase/server'
import {communityAccount,CommunityError} from './factory-3d-community-server'
import {getAllowedOrigins} from '@/lib/env'
import {challengeContent,challengeConfig,challengeId,readChallengeStart,persistChallenge,type ChallengeStore} from './factory-3d-challenge'
import {readColonyCommand} from './factory-3d-domain'
import {checkRateLimit,rateLimitResponse} from '@/lib/security/rate-limit'

export const challengeRulesHash=createHash('sha256').update(JSON.stringify(challengeContent)).digest('hex')
export class ChallengeError extends Error {constructor(public code:string,public status=503){super(code)}}
export const challengeReply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
export const challengeFailure=(e:unknown)=>challengeReply({code:e instanceof ChallengeError||e instanceof CommunityError?e.code:'challenge_unavailable'},e instanceof ChallengeError||e instanceof CommunityError?e.status:503)
export async function challengeRpc(admin:ReturnType<typeof createAdminClient>,name:string,args:Record<string,unknown>){
  const {data,error}=await (admin.rpc as unknown as (name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message:string}|null}>)(name,args)
  if(error){
    const known=['command_payload_conflict','incompatible_rules','challenge_not_found'].find(c=>error.message.includes(c))
    throw new ChallengeError(known??'challenge_unavailable',known==='challenge_not_found'?404:known?409:503)
  }
  return data
}
export async function challengePost(request:Request){
  if(!getAllowedOrigins().includes(request.headers.get('origin')??'')||request.headers.get('sec-fetch-site')==='cross-site')return challengeReply({code:'origin_rejected'},403)
  if(!request.headers.get('content-type')?.startsWith('application/json'))return challengeReply({code:'invalid_command'},415)
  const reader=request.body?.getReader();if(!reader)return challengeReply({code:'invalid_command'},400)
  let text='',bytes=0;const decoder=new TextDecoder()
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096){await reader.cancel();return challengeReply({code:'command_too_large'},413)}text+=decoder.decode(value,{stream:true})}text+=decoder.decode()}catch{return challengeReply({code:'invalid_command'},400)}
  let input:unknown;try{input=JSON.parse(text)}catch{return challengeReply({code:'invalid_command'},400)}
  const start=readChallengeStart(input),v=input as Record<string,unknown>|null
  const entryId=v&&typeof v==='object'?v.entryId:null
  const command=challengeId(entryId)&&Object.keys(v!).sort().join(',')==='action,commandId,entryId'?readColonyCommand({commandId:v!.commandId,action:v!.action}):null
  if(!start&&!command)return challengeReply({code:'invalid_command'},400)
  try{
    const {id,admin}=await communityAccount()
    if(request.headers.get('x-factory-account')!==id)return challengeReply({code:'account_changed'},403)
    const limit=await checkRateLimit({key:`factory-challenge:${id}`,limit:360,windowMs:60000,onError:'deny'})
    if(!limit.ok){const r=rateLimitResponse(limit);r.headers.set('Cache-Control','no-store');return r}
    if(start){
      const hash=createHash('sha256').update(JSON.stringify(start.action)).digest('hex')
      const receipt=await challengeRpc(admin,'factory_3d_challenge_start',{p_user:id,p_command:start.commandId,p_action_hash:hash,p_alias:start.action.alias,p_content:challengeContent,p_rules_hash:challengeRulesHash})
      return challengeReply({...receipt as object,accountId:id})
    }
    const action=Object.fromEntries(Object.entries(command!.action).sort(([a],[b])=>a.localeCompare(b)))
    const hash=createHash('sha256').update(JSON.stringify({entryId,action})).digest('hex')
    const args={p_user:id,p_entry:entryId,p_action_hash:hash}
    const store:ChallengeStore={load:async(commandId)=>await challengeRpc(admin,'factory_3d_challenge_load',{...args,p_command:commandId,p_rules_hash:challengeRulesHash}) as Awaited<ReturnType<ChallengeStore['load']>>,commit:async(commandId,_hash,revision,receipt)=>await challengeRpc(admin,'factory_3d_challenge_commit',{...args,p_command:commandId,p_expected:revision,p_receipt:receipt}) as Awaited<ReturnType<ChallengeStore['commit']>>}
    const receipt=await persistChallenge(store,command!,challengeRulesHash,hash,()=>randomUUID().replaceAll('-',''))
    return challengeReply({...receipt,accountId:id})
  }catch(e){return challengeFailure(e)}
}
export function projectChallengeBoard(raw:unknown,offset:number):object {
  if(!raw||typeof raw!=='object')throw new ChallengeError('challenge_unavailable')
  const d=raw as Record<string,unknown>
  if(!Array.isArray(d.items)||d.items.length>21||typeof d.edition!=='string'||typeof d.serverTimeMs!=='number'||!Number.isSafeInteger(d.serverTimeMs)||typeof d.final!=='boolean'||!['active','finished','closing'].every(k=>Number.isSafeInteger(d[k])&&Number(d[k])>=0))throw new ChallengeError('challenge_unavailable')
  const items=d.items.slice(0,20).map(raw=>{
    const i=raw as Record<string,unknown>
    if(!i||!challengeId(i.id)||typeof i.name!=='string'||i.name.length>64||!['scoreMilli','rateMilli'].every(k=>typeof i[k]==='string'&&/^\d{1,60}$/.test(i[k] as string))||!Number.isSafeInteger(i.rank)||Number(i.rank)<1||!Number.isSafeInteger(i.closedAtMs))throw new ChallengeError('challenge_unavailable')
    return {id:i.id,name:i.name,rank:i.rank,scoreMilli:i.scoreMilli,rateMilli:i.rateMilli,closedAtMs:i.closedAtMs}
  })
  const rulesHash=d.rulesHash??challengeRulesHash,seed=d.seed??challengeConfig.seed
  if(typeof rulesHash!=='string'||!/^[0-9a-f]{64}$/.test(rulesHash)||!Number.isSafeInteger(seed))throw new ChallengeError('challenge_unavailable')
  return {edition:d.edition,serverTimeMs:d.serverTimeMs,final:d.final,active:d.active,finished:d.finished,closing:d.closing,items,nextOffset:d.items.length>20&&offset+20<=1000?offset+20:null,durationMs:challengeConfig.durationMs,seed,rulesHash,prizeEligible:false}
}
