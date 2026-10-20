import {beforeEach,describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import type {ColonyReceipt} from '../factory-3d-domain'
const f=vi.hoisted(()=>({user:{id:'account-A',email_confirmed_at:'2026-10-04'},authError:null as null|{name:string;status:number},anonymous:false,banned:false,player:true,profileError:false,storageError:'',limitOk:true,limitUnavailable:false,limits:[] as unknown[],calls:[] as {name:string;args:Record<string,unknown>}[],receipts:new Map<string,{hash:unknown;receipt:ColonyReceipt}>(),state:null as ColonyReceipt['state']|null,clock:100000}))
vi.mock('@/lib/env',()=>({getAllowedOrigins:()=>['http://local.test']}))
vi.mock('@/lib/security/rate-limit',()=>({checkRateLimit:async(o:unknown)=>{f.limits.push(o);return {ok:f.limitOk,unavailable:f.limitUnavailable}},rateLimitResponse:(r:{unavailable:boolean})=>Response.json({code:r.unavailable?'RATE_LIMIT_UNAVAILABLE':'rate_limited'},{status:r.unavailable?503:429})}))
vi.mock('@/lib/supabase/server',()=>({
  createClient:async()=>({auth:{getUser:async()=>({data:{user:f.anonymous?null:f.user},error:f.authError})}}),
  createAdminClient:()=>({
    from:(table:string)=>{const q={select:()=>q,eq:(column:string)=>{if(column!==(table==='profiles'?'id':'profile_id'))throw new Error('Incorrect account identity column');return q},single:async()=>({data:{is_banned:f.banned},error:f.profileError?{message:'private-profile'}:null}),then:(resolve:(r:unknown)=>unknown)=>resolve({data:f.player?[{role:'user'}]:[{role:'admin'}],error:null})};if(table!=='profiles'&&table!=='profile_roles')throw new Error('Unexpected table');return q},
    rpc:async(name:string,args:Record<string,unknown>)=>{
      f.calls.push({name,args});if(f.storageError)return {data:null,error:{message:f.storageError}}
      const key=args.p_user+':'+args.p_command,stored=f.receipts.get(key)
      if(stored&&stored.hash!==args.p_action_hash)return {data:null,error:{message:'command_payload_conflict: private-data'}}
      if(stored)return {data:{receipt:stored.receipt},error:null}
      if(name==='factory_3d_load')return {data:{state:f.state,revision:f.state?.revision??0,serverTimeMs:f.clock},error:null}
      const receipt=args.p_receipt as ColonyReceipt;f.state=receipt.state;f.receipts.set(key,{hash:args.p_action_hash,receipt});return {data:{receipt},error:null}
    },
  }),
}))
import {POST} from '@/app/(public)/play/factory-empire/server/route'
const command=(kind='mine')=>({commandId:randomUUID(),action:{kind}})
const request=(body:unknown=command(),headers:Record<string,string>={})=>new Request('http://local.test/play/factory-empire/server',{method:'POST',headers:{origin:'http://local.test','content-type':'application/json','x-factory-account':f.user.id,...headers},body:JSON.stringify(body)})
beforeEach(()=>{f.user={id:'account-A',email_confirmed_at:'2026-10-04'};f.authError=null;f.anonymous=false;f.banned=false;f.player=true;f.profileError=false;f.storageError='';f.limitOk=true;f.limitUnavailable=false;f.limits=[];f.calls=[];f.receipts.clear();f.state=null;f.clock=100000})
describe('Account persistence HTTP boundary',()=>{
  it.each([{origin:''},{origin:'https://evil.example'},{'sec-fetch-site':'cross-site'}] as Record<string,string>[])('rejects foreign or missing origin %j',async headers=>{expect((await POST(request(command(),headers))).status).toBe(403);expect(f.calls).toEqual([])})
  it('requires JSON and rejects additional state/money/account/time',async()=>{
    expect((await POST(request(command(),{'content-type':'text/plain'}))).status).toBe(415)
    for(const body of [{...command(),userId:'other'},{...command(),state:{balance:'90000'}},{commandId:randomUUID(),action:{kind:'mine',timestamp:1e15}},{commandId:randomUUID(),action:{kind:'mine',balance:'90000'}}])expect((await POST(request(body))).status).toBe(400)
    expect(f.calls).toEqual([])
  })
  it('bounds a chunked body before authentication or persistence',async()=>{
    const chunks=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(' '.repeat(4097)));c.close()}})
    const r=new Request('http://local.test/play/factory-empire/server',{method:'POST',headers:{origin:'http://local.test','content-type':'application/json'},body:chunks,duplex:'half'} as RequestInit)
    expect((await POST(r)).status).toBe(413);expect(f.calls).toEqual([])
  })
  it('treats a broken request stream as invalid input',async()=>{
    const r=new Request('http://local.test/play/factory-empire/server',{method:'POST',headers:{origin:'http://local.test','content-type':'application/json'},body:new ReadableStream({start(c){c.error(new Error('lost connection'))}}),duplex:'half'} as RequestInit)
    expect((await POST(r)).status).toBe(400)
  })
  it('requires a verified account and player role',async()=>{
    f.anonymous=true;expect((await POST(request())).status).toBe(401);f.anonymous=false
    f.user.email_confirmed_at='';expect((await POST(request())).status).toBe(403);f.user.email_confirmed_at='confirmed'
    f.player=false;expect((await POST(request())).status).toBe(403);f.player=true
    f.banned=true;expect((await POST(request())).status).toBe(403);expect(f.calls).toEqual([])
  })
  it('fails closed when Auth or profile lookup is unavailable',async()=>{
    f.authError={name:'AuthRetryableFetchError',status:503};expect((await POST(request())).status).toBe(503)
    f.authError=null;f.profileError=true;expect((await POST(request())).status).toBe(503);expect(f.calls).toEqual([])
  })
  it('uses session identity and database time, with no-store responses',async()=>{
    const response=await POST(request()),data=await response.json()
    expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store')
    expect(data).toMatchObject({accountId:'account-A',serverTimeMs:100000,prizeEligible:false,state:{balance:'1000',mode:'account-practice'}})
    expect(f.calls.every(c=>c.args.p_user==='account-A')).toBe(true)
    expect(f.limits).toEqual([{key:'factory-3d:account-A',limit:360,windowMs:60000,onError:'deny'}])
  })
  it('allows only the initial sync without an account identity precondition',async()=>{
    expect((await POST(request(command('sync'),{'x-factory-account':''}))).status).toBe(200)
    f.calls=[];expect((await POST(request(command(),{'x-factory-account':''}))).status).toBe(403);expect(f.calls).toEqual([])
  })
  it('never applies account A pending commands to a changed account B',async()=>{
    f.user.id='account-B'
    const r=await POST(request(command(),{'x-factory-account':'account-A'}));expect(r.status).toBe(403);expect(await r.json()).toEqual({code:'account_changed'});expect(f.calls).toEqual([])
  })
  it('denies mutations when the account quota is exhausted or unavailable',async()=>{
    f.limitOk=false;expect((await POST(request())).status).toBe(429);f.limitUnavailable=true;expect((await POST(request())).status).toBe(503);expect(f.calls).toEqual([])
  })
  it('returns the original receipt after a lost response and rejects UUID payload reuse',async()=>{
    const c=command(),r=await(await POST(request(c))).json();f.clock+=1000
    expect(await(await POST(request(c))).json()).toEqual(r);expect(f.state?.balance).toBe('1000')
    expect((await POST(request({...c,action:{kind:'sync'}}))).status).toBe(409);expect(f.state?.revision).toBe(1)
  })
  it('does not confirm a save or leak SQL details when persistence fails',async()=>{
    f.storageError='private SQL table details';const r=await POST(request());expect(r.status).toBe(503);expect(await r.json()).toEqual({code:'storage_unavailable'});expect(f.state).toBeNull()
  })
})
