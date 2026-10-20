import type {FinalRow,MatchDefinition} from './tournament.js'
export interface TournamentStore {
  pending():Promise<string[]>;claim(id:string,worker:string):Promise<MatchDefinition|null>
  heartbeat(id:string,worker:string):Promise<boolean>;recover():Promise<void>
  finish(id:string,worker:string,rows:FinalRow[]):Promise<void>
}
export function restTournamentStore(url:string,key:string):TournamentStore{
  if(!url||!key)throw new Error('Arena requires server Supabase credentials')
  async function request(path:string,body?:unknown){
    const response=await fetch(url.replace(/\/$/,'')+'/rest/v1/'+path,{method:body===undefined?'GET':'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(4000)})
    if(!response.ok)throw new Error(`arena_store_${response.status}`)
    const text=await response.text();return text?JSON.parse(text):null
  }
  return {
    pending:async()=> (await request('snake_tournaments?status=eq.open&select=id&order=starts_at&limit=32') as {id:string}[]).map(t=>t.id),
    claim:(id,worker)=>request('rpc/snake_claim',{p_tournament:id,p_worker:worker}),
    heartbeat:(id,worker)=>request('rpc/snake_heartbeat',{p_tournament:id,p_worker:worker}),
    recover:()=>request('rpc/snake_recover',{}),
    finish:(id,worker,rows)=>request('rpc/snake_finish',{p_tournament:id,p_worker:worker,p_results:rows})
  }
}
