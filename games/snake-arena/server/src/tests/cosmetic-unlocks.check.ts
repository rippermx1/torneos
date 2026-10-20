import {test} from 'node:test'
import assert from 'node:assert/strict'
import {once} from 'node:events'
import {randomUUID} from 'node:crypto'
import type {AddressInfo} from 'node:net'
import WebSocket from 'ws'
import {createService} from '../service.js'
import {defaults} from '../config.js'
import {PracticeSessions} from '../practice-sessions.js'
import {signPracticeTicket} from '../practice-ticket.js'
import {canUseAppearance} from '../cosmetics.js'
import type {PracticeReward} from '../practice-store.js'
const secret='cosmetic-test-secret-longer-than-32-characters',origin='http://cosmetic.test',user=randomUUID(),now=100000
function ticket(){return signPracticeTicket({purpose:'snake-practice-v1',userId:user,name:'Cuenta',origin,nonce:randomUUID(),issuedAt:now,expiresAt:now+30000,leaseUntil:now+300000},secret)}
type Packet={type:string;id:string;code:string;accountXp?:number;players?:{id:string;appearance:string;mass:number;score:number;alive:boolean}[]}
async function client(port:number){
  const ws=new WebSocket(`ws://127.0.0.1:${port}/snake-arena/socket`,{origin}),messages:Packet[]=[]
  ws.on('message',raw=>messages.push(JSON.parse(raw.toString())));await once(ws,'open')
  return {ws,messages,send:(data:Record<string,unknown>)=>ws.send(JSON.stringify({v:1,...data})),wait:async(type:string)=>{for(let i=0;i<100;i++){const packet=messages.find(m=>m.type===type);if(packet)return packet;await settle()}throw new Error('Missing '+type)}}
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,10))
test('level thresholds reject unconfirmed and malformed XP while base skins stay open to guests',()=>{
  for(const id of ['aurora','nebula','solar'] as const)assert.equal(canUseAppearance(id,null),true)
  for(const [id,xp] of [['comet',200],['eclipse',400],['prism',700]] as const){assert.equal(canUseAppearance(id,xp-1),false);assert.equal(canUseAppearance(id,xp),true);for(const forged of [null,NaN,Infinity,-1,200.5,1_000_000_001])assert.equal(canUseAppearance(id,forged),false)}
})
test('real guest sockets cannot forge account progression on join or restart and can retry a base aspect',{timeout:10000},async()=>{
  const service=createService(defaults,{origins:[origin],manualTick:true});service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
  try{
    const a=await client((service.server.address() as AddressInfo).port)
    a.send({type:'join',name:'Guest',appearance:'prism',accountXp:999999,xp:999999,level:100});assert.equal((await a.wait('error')).code,'appearance_locked');assert.equal(service.rooms.size,0)
    a.send({type:'join',name:'Guest',appearance:'nebula'});const welcome=await a.wait('welcome'),room=[...service.rooms.values()][0],p=room.players.get(welcome.id)!
    p.x=100;service.tick();assert.equal(p.alive,false);a.messages.length=0
    a.send({type:'restart',appearance:'comet',accountXp:999999});assert.equal((await a.wait('error')).code,'appearance_locked');assert.equal(p.alive,false);assert.equal(p.appearance,'nebula')
    a.messages.length=0;a.send({type:'restart',appearance:'solar'});await a.wait('snapshot');assert.equal(p.alive,true);assert.equal(p.appearance,'solar');a.ws.close()
  }finally{await service.close()}
})
test('admission reads saved XP, denies below threshold and shares only authorized appearance with peers',{timeout:10000},async()=>{
  let xp=199;const manager=new PracticeSessions(secret,{best:async()=>0,xp:async()=>xp,save:async()=>{}},()=>now),service=createService(defaults,{origins:[origin],manualTick:true,practice:manager})
  service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
  try{
    const port=(service.server.address() as AddressInfo).port,a=await client(port)
    a.send({type:'join',ticket:ticket(),appearance:'comet',accountXp:999999});assert.equal((await a.wait('error')).code,'appearance_locked');assert.equal(manager.sessions.size,0)
    xp=200;a.messages.length=0;a.send({type:'join',ticket:ticket(),appearance:'comet'});const welcome=await a.wait('welcome');assert.equal(welcome.accountXp,200)
    const guest=await client(port);guest.send({type:'join',name:'Peer',appearance:'aurora'});await guest.wait('welcome');guest.messages.length=0;service.snapshots();const snapshot=await guest.wait('snapshot')
    assert.equal(snapshot.accountXp,undefined);assert.equal(snapshot.players!.find(p=>p.id===welcome.id)?.appearance,'comet');assert.equal(snapshot.players!.find(p=>p.id===welcome.id)?.mass,defaults.initialMass)
    a.ws.close();guest.ws.close()
  }finally{await service.close()}
})
test('pending/session XP cannot unlock; confirmed mission reward does and a new authority retains entitlement',{timeout:10000},async()=>{
  let time=now,available=false;const rewards=new Map<string,PracticeReward>(),xp=()=>190+[...rewards.values()].reduce((n,r)=>n+r.xp,0)
  const store={best:async()=>0,xp:async()=>xp(),save:async()=>{},saveReward:async(r:PracticeReward)=>{if(!available)throw new Error('offline');rewards.set(r.round_id+r.mission_id,r);return xp()}}
  const manager=new PracticeSessions(secret,store,()=>time),config={...defaults,practiceMissions:true,rareResources:true},service=createService(config,{origins:[origin],manualTick:true,practice:manager})
  service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
  try{
    const a=await client((service.server.address() as AddressInfo).port);a.send({type:'join',ticket:ticket(),appearance:'aurora'});const welcome=await a.wait('welcome'),room=[...service.rooms.values()][0],p=room.players.get(welcome.id)!
    for(let i=0;i<5;i++){room.food=[{id:900+i,x:p.x+.28,y:p.y}];service.tick()}
    await settle();assert.equal(p.sessionXp,25);assert.equal(manager.progress(manager.get(user)!).pendingXp,25);assert.equal(manager.get(user)!.accountXp,190)
    p.x=100;service.tick();a.messages.length=0;a.send({type:'restart',appearance:'comet',accountXp:215});assert.equal((await a.wait('error')).code,'appearance_locked');assert.equal(p.alive,false)
    available=true;time+=2001;manager.flush();await settle();assert.equal(manager.get(user)!.accountXp,215)
    a.messages.length=0;a.send({type:'restart',appearance:'comet'});await a.wait('snapshot');assert.equal(p.appearance,'comet');assert.equal(p.mass,defaults.initialMass);assert.equal(p.score,0);a.ws.close()
  }finally{await service.close()}
  const rebuilt=new PracticeSessions(secret,store,()=>time),fresh=createService(config,{origins:[origin],manualTick:true,practice:rebuilt});fresh.server.listen(0,'127.0.0.1');await once(fresh.server,'listening')
  try{const a=await client((fresh.server.address() as AddressInfo).port);a.send({type:'join',ticket:ticket(),appearance:'comet'});assert.equal((await a.wait('welcome')).accountXp,215);a.ws.close()}finally{await fresh.close()}
})
