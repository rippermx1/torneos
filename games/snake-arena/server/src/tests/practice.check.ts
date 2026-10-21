import {test} from 'node:test'
import assert from 'node:assert/strict'
import {once} from 'node:events'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {AddressInfo} from 'node:net'
import WebSocket from 'ws'
import {PracticeSessions,type SaveState} from '../practice-sessions.js'
import {signPracticeTicket,verifyPracticeTicket} from '../practice-ticket.js'
import {defaults} from '../config.js'
import {Room,type Result} from '../room.js'
import {createService} from '../service.js'
import type {PracticeReward,PracticeRun} from '../practice-store.js'
type PracticeProgress=ReturnType<PracticeSessions['progress']>
type PracticeMessage=
  |({type:'welcome';id:string;ack:number;authenticated:boolean;resumed:boolean}&Partial<PracticeProgress>)
  |({type:'persistence'}&PracticeProgress)
  |({type:'result';saveState:SaveState}&Result)
  |(Omit<ReturnType<Room['snapshot']>,'type'>&{type:'snapshot';accountXp?:never})
  |{type:'error';code:string}
  |{type:'authenticated'}
const secret='practice-test-secret-longer-than-32-characters',origin='http://practice.test',user=randomUUID()
function token(now:number,userId=user){return signPracticeTicket({purpose:'snake-practice-v1',userId,name:'Cuenta',origin,nonce:randomUUID(),issuedAt:now,expiresAt:now+30000,leaseUntil:now+300000},secret)}
const settle=()=>new Promise(resolve=>setTimeout(resolve,20))
test('practice ticket verifies purpose, signature, origin, expiry and one-use nonce',()=>{
  const now=100000,value=token(now),manager=new PracticeSessions(secret,{best:async()=>0,save:async()=>{}},()=>now)
  assert.ok(verifyPracticeTicket(value,secret,origin,now));assert.equal(verifyPracticeTicket(value,secret,'https://foreign.test',now),null);assert.equal(verifyPracticeTicket(value,secret,origin,now+30000),null)
  assert.equal(verifyPracticeTicket(value+'x',secret,origin,now),null);assert.ok(manager.consume(value,origin));assert.equal(manager.consume(value,origin),null)
  const payload=JSON.parse(Buffer.from(value.split('.')[0],'base64url').toString());payload.purpose='snake-tournament';assert.equal(verifyPracticeTicket(signPracticeTicket(payload,secret),secret,origin,now),null)
})
test('detached creature continues, boost stops, result persists once and grace expiration records disconnect',async()=>{
  let now=100000;const writes:unknown[]=[];const manager=new PracticeSessions(secret,{best:async()=>12,save:async r=>{writes.push(r)}},()=>now),room=new Room('room',defaults,()=>.5),p=room.add('p','Cuenta')
  const s=manager.attach(manager.consume(token(now),origin)!,room,'p',12);p.wantsBoost=true;p.boosting=true;manager.detach(s);assert.equal(p.boosting,false);assert.equal(p.wantsBoost,false)
  const x=p.x;room.step();assert.notEqual(p.x,x);now+=15001;manager.tick(session=>session.room.remove(session.playerId));await settle()
  assert.equal(manager.sessions.size,0);assert.equal(writes.length,1);assert.equal((writes[0] as {reason:string}).reason,'disconnect');assert.equal(s.saveState,'saved');manager.tick(()=>{});assert.equal(writes.length,1)
})
test('unconfirmed save retries identical round and survives authority process reconstruction',async()=>{
  const now=100000;let available=false;const writes:{id:string}[]=[],directory=mkdtempSync(join(tmpdir(),'snake-sa11-'))
  const store={best:async()=>0,save:async(run:{id:string})=>{writes.push(run);if(!available)throw new Error('offline')}}
  try{
    const manager=new PracticeSessions(secret,store,()=>now,()=>{},15000,directory),room=new Room('room',defaults,()=>.5),p=room.add('p','Cuenta'),s=manager.attach(manager.consume(token(now),origin)!,room,'p',0)
    Object.assign(p,{x:99.9,y:50,angle:0,target:0,body:[{x:99.9,y:50}]});room.step();manager.tick(()=>{});await settle();assert.equal(s.saveState,'retrying');assert.equal(manager.pendingCount,1)
    const recovered=new PracticeSessions(secret,store,()=>now,()=>{},15000,directory);assert.equal(recovered.pendingCount,1);available=true;recovered.flush();await settle();assert.equal(recovered.pendingCount,0);assert.equal(writes.length,2);assert.equal(writes[0].id,writes[1].id)
  }finally{rmSync(directory,{recursive:true,force:true})}
})
async function client(port:number){const ws=new WebSocket(`ws://127.0.0.1:${port}/snake-arena/socket`,{origin}),messages:PracticeMessage[]=[];ws.on('message',raw=>messages.push(JSON.parse(raw.toString()) as PracticeMessage));await once(ws,'open');return {ws,messages,send:(data:Record<string,unknown>)=>ws.send(JSON.stringify({v:1,...data})),wait:async<T extends PracticeMessage['type']>(type:T)=>{for(let i=0;i<150;i++){const found=messages.find((m):m is Extract<PracticeMessage,{type:T}>=>m.type===type);if(found)return found;await settle()}throw new Error('Missing '+type)}}}
test('real authenticated sockets resume same id/ack, replace duplicate tab, isolate owners, recover death and persist restart separately',{timeout:15000},async()=>{
  const now=100000,writes:PracticeRun[]=[],rewards=new Map<string,PracticeReward>(),manager=new PracticeSessions(secret,{best:async()=>500,xp:async()=>80,saveReward:async r=>{rewards.set(r.round_id+r.mission_id,r);return 80+[...rewards.values()].filter(r=>r.user_id===user).reduce((n,r)=>n+r.xp,0)},save:async r=>{writes.push(r)}},()=>now),service=createService({...defaults,rareResources:true,practiceMissions:true},{origins:[origin],manualTick:true,practice:manager});service.server.listen(0,'127.0.0.1');await once(service.server,'listening');const port=(service.server.address() as AddressInfo).port
  try{
    const a=await client(port);a.send({type:'join',ticket:token(now),appearance:'solar',userId:randomUUID(),score:999999});const w=await a.wait('welcome');assert.equal(w.authenticated,true);assert.equal(manager.get(user)?.playerId,w.id)
    assert.equal(w.accountXp,80);assert.equal(w.xpState,'saved')
    a.send({type:'input',seq:77,angle:0,boost:true,accountXp:999999});await settle();const room=[...service.rooms.values()][0],p=room.players.get(w.id)!;assert.equal(p.ack,77);assert.equal(p.appearance,'solar')
    room.food=[{id:999,x:p.x+defaults.baseSpeed*defaults.boostMultiplier/defaults.simulationHz,y:p.y,kind:'rare',expiresTick:300}];service.tick();assert.equal(p.sessionXp,60);const missionLife=p.life
    await settle();service.tick();await settle();const confirmedXp=80+[...rewards.values()].reduce((n,r)=>n+r.xp,0),rewardCount=rewards.size,sessionXp=p.sessionXp;assert.equal(manager.get(user)!.accountXp,confirmedXp);assert.ok(rewardCount>=1)
    const persisted=()=>a.messages.some(m=>m.type==='persistence'&&m.accountXp===confirmedXp&&m.xpState==='saved')
    // Server state can settle before its WebSocket frame reaches the client.
    // Wait for that exact saved acknowledgement; keep the assertion and deadline.
    for(let attempt=0;attempt<150&&!persisted();attempt++)await settle()
    assert.ok(persisted())
    assert.ok(a.messages.filter(m=>m.type==='snapshot').every(m=>m.accountXp===undefined))
    a.ws.close(4003,'test');await once(a.ws,'close');await settle();assert.equal(room.players.size,1);assert.equal(p.wantsBoost,false)
    const b=await client(port);b.send({type:'join',ticket:token(now),appearance:'nebula',resumeOnly:true});const bw=await b.wait('welcome');assert.equal(bw.id,w.id);assert.equal(bw.ack,77);assert.equal(bw.resumed,true);assert.equal(p.appearance,'solar');assert.equal(p.sessionXp,sessionXp);assert.equal(p.life,missionLife);assert.equal(p.rarePickups,1)
    assert.equal(bw.accountXp,confirmedXp);assert.equal(rewards.size,rewardCount)
    const closed=once(b.ws,'close'),c=await client(port);c.send({type:'join',ticket:token(now)});assert.equal((await c.wait('welcome')).id,w.id);assert.equal((await closed)[0],4001);await settle();assert.equal(manager.get(user)?.detachedUntil,null)
    const foreign=await client(port);foreign.send({type:'join',ticket:token(now,randomUUID()),resumeOnly:true});assert.equal((await foreign.wait('error')).code,'resume_expired')
    c.ws.close(4003,'test');await once(c.ws,'close');await settle();Object.assign(p,{x:99.9,y:50,angle:0,target:0,body:[{x:99.9,y:50}],score:10});service.tick();await settle();assert.equal(writes.length,1)
    const d=await client(port);d.send({type:'join',ticket:token(now),resumeOnly:true});await d.wait('welcome');service.tick();const result=await d.wait('result');assert.equal(result.personalBest,500);assert.equal(result.saveState,'saved');assert.equal(result.score,10)
    d.send({type:'restart'});await settle();Object.assign(p,{x:99.9,y:50,angle:0,target:0,body:[{x:99.9,y:50}],score:20});service.tick();await settle();assert.equal(writes.length,2);assert.notEqual(writes[0].id,writes[1].id)
    d.ws.close();foreign.ws.close()
  }finally{await service.close()}
})
test('late resume cannot silently start another life; expired admission and wrong-account renewal are rejected',{timeout:10000},async()=>{
  let now=100000;const manager=new PracticeSessions(secret,{best:async()=>0,save:async()=>{}},()=>now),service=createService(defaults,{origins:[origin],manualTick:true,practice:manager});service.server.listen(0,'127.0.0.1');await once(service.server,'listening');const port=(service.server.address() as AddressInfo).port
  try{const a=await client(port);a.send({type:'join',ticket:token(now)});await a.wait('welcome');a.ws.close();await once(a.ws,'close');await settle();now+=15001
    const b=await client(port);b.send({type:'join',ticket:token(now),resumeOnly:true});assert.equal((await b.wait('error')).code,'resume_expired');assert.equal(service.rooms.size,0)
    const c=await client(port);c.send({type:'join',ticket:token(now)});await c.wait('welcome');c.send({type:'authenticate',ticket:token(now,randomUUID())});assert.equal((await c.wait('error')).code,'authentication_required');b.ws.close();c.ws.close()
  }finally{await service.close()}
})
test('concurrent admissions for one owner never create two creatures',{timeout:10000},async()=>{
  const now=100000,manager=new PracticeSessions(secret,{best:async()=>{await settle();return 0},save:async()=>{}},()=>now),service=createService(defaults,{origins:[origin],manualTick:true,practice:manager});service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
  try{const port=(service.server.address() as AddressInfo).port,[a,b]=await Promise.all([client(port),client(port)]);a.send({type:'join',ticket:token(now)});b.send({type:'join',ticket:token(now)});const [aw,bw]=await Promise.all([a.wait('welcome'),b.wait('welcome')]);assert.equal(aw.id,bw.id);assert.equal(manager.sessions.size,1);assert.equal([...service.rooms.values()].reduce((n,r)=>n+r.players.size,0),1);a.ws.close();b.ws.close()}finally{await service.close()}
})
