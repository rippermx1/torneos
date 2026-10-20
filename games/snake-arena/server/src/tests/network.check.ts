import {test} from 'node:test'
import assert from 'node:assert/strict'
import {once} from 'node:events'
import type {AddressInfo} from 'node:net'
import WebSocket from 'ws'
import {defaults} from '../config.js'
import {createService} from '../service.js'
type Message={type:string;id:string;players:{id:string;x:number;score:number;mass:number;alive:boolean}[];food:{id:number}[];score:number;reason:string;code:string}

test('real practice sockets ignore forged mission claims and publish only confirmed XP',{timeout:10000},async()=>{
  const service=createService({...defaults,rareResources:true,practiceMissions:true},{origins:['http://snake.test'],manualTick:true});service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
  try{
    const a=await client((service.server.address() as AddressInfo).port);a.send({type:'join',name:'Missions',xp:999,practiceProgress:{xp:999,earned:120}})
    const w=await a.wait('welcome'),room=[...service.rooms.values()][0],p=room.players.get(w.id)!
    a.send({type:'input',seq:1,angle:0,xp:999,ordinaryPickups:99,rarePickups:99,life:99});a.send({type:'ping',nonce:1});await a.wait('pong')
    assert.equal(p.sessionXp,0);assert.equal(p.ordinaryPickups,0);assert.equal(p.rarePickups,0)
    room.food=[{id:999,x:p.x+.28,y:p.y,kind:'rare',expiresTick:300}];service.tick();service.snapshots()
    const snap=await a.wait('snapshot',m=>m.players.some(p=>p.score===50))
    const publicPlayer=snap.players[0] as typeof snap.players[number]&{practiceProgress:{xp:number;earned:number;life:number}}
    assert.equal(publicPlayer.practiceProgress.xp,60);assert.equal(publicPlayer.practiceProgress.earned,60);assert.equal(publicPlayer.practiceProgress.life,1)
    p.x=101;service.tick();await a.wait('result');a.messages.length=0;a.send({type:'restart',xp:999,earned:120});a.send({type:'ping',nonce:2});await a.wait('pong');service.snapshots()
    const restarted=await a.wait('snapshot',m=>m.players.some(p=>p.alive)),fresh=restarted.players[0] as typeof publicPlayer
    assert.equal(fresh.practiceProgress.xp,60);assert.equal(fresh.practiceProgress.earned,0);assert.equal(fresh.practiceProgress.life,2);a.ws.close()
  }finally{await service.close()}
})
test('cosmetic choice is whitelisted, shared with peers, changes between lives and cannot change gameplay',{timeout:10000},async()=>{
  const service=createService(defaults,{origins:['http://snake.test'],manualTick:true});service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
  try{
    const port=(service.server.address() as AddressInfo).port,a=await client(port),b=await client(port)
    a.send({type:'join',name:'Solar',appearance:'javascript:fake'});assert.equal((await a.wait('error')).code,'invalid_appearance');assert.equal(service.rooms.size,0)
    a.send({type:'join',name:'Solar',appearance:'solar',mass:999,score:999});const w=await a.wait('welcome');b.send({type:'join',name:'Observer',appearance:'nebula'});await b.wait('welcome')
    service.snapshots();const snap=await b.wait('snapshot',m=>m.players.length===2)
    const observed=snap.players.find(p=>p.id===w.id) as typeof snap.players[number]&{appearance:string}
    assert.equal(observed.appearance,'solar');assert.equal(observed.mass,defaults.initialMass);assert.equal(observed.score,0)
    const room=[...service.rooms.values()][0],p=room.players.get(w.id)!
    a.send({type:'input',seq:1,angle:0,appearance:'nebula',boost:false});a.send({type:'restart',appearance:'nebula'});await a.wait('error',m=>m.code==='restart_unavailable');assert.equal(p.appearance,'solar')
    p.x=101;service.tick();await a.wait('result');a.send({type:'restart',appearance:'invalid'});await a.wait('error',m=>m.code==='invalid_appearance');assert.equal(p.alive,false)
    b.messages.length=0;a.send({type:'restart',appearance:'aurora'});a.send({type:'ping',nonce:1});await a.wait('pong');service.snapshots()
    const after=await b.wait('snapshot',m=>m.players.some(p=>p.id===w.id&&p.alive));assert.equal((after.players.find(p=>p.id===w.id) as typeof observed).appearance,'aurora');assert.equal(p.mass,defaults.initialMass);a.ws.close();b.ws.close()
  }finally{await service.close()}
})
test('rare reward reaches real sockets only after server consumption, ignoring forged pickup/mass/score',{timeout:10000},async()=>{
  const service=createService({...defaults,rareResources:true},{origins:['http://snake.test'],manualTick:true});service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
  try{
    const a=await client((service.server.address() as AddressInfo).port);a.send({type:'join',name:'Rare'})
    const w=await a.wait('welcome'),room=[...service.rooms.values()][0],p=room.players.get(w.id)!
    room.food=[];a.send({type:'input',seq:1,angle:0,rarePickups:99,mass:999,score:999,kind:'rare'});a.send({type:'ping',nonce:1});await a.wait('pong')
    assert.equal(p.rarePickups,0);assert.equal(p.score,0);assert.equal(p.mass,12)
    room.food=[{id:9999,x:p.x+defaults.baseSpeed/defaults.simulationHz,y:p.y,kind:'rare',expiresTick:300}]
    a.messages.length=0;service.tick();service.snapshots()
    const snap=await a.wait('snapshot',m=>m.players.some(p=>p.id===w.id&&p.score===50))
    assert.equal(snap.players.find(p=>p.id===w.id)?.mass,22);assert.equal(p.rarePickups,1);assert.ok(!snap.food.some(f=>f.id===9999));a.ws.close()
  }finally{await service.close()}
})
async function client(port:number){
  const ws=new WebSocket(`ws://127.0.0.1:${port}/snake-arena/socket`,{origin:'http://snake.test'}),messages:Message[]=[]
  ws.on('message',raw=>messages.push(JSON.parse(raw.toString())));await once(ws,'open')
  function send(data:Record<string,unknown>){ws.send(JSON.stringify({v:1,...data}))}
  async function wait(type:string,predicate:(m:Message)=>boolean=()=>true){const deadline=Date.now()+3000;while(Date.now()<deadline){const m=messages.find(m=>m.type===type&&predicate(m));if(m)return m;await new Promise(resolve=>setTimeout(resolve,10))}throw new Error(`Missing ${type}`)}
  return {ws,messages,send,wait}
}
test('real sockets A/B: join, visible world, movement, growth, collision, result, restart, disconnect and rejoin',{timeout:15000},async()=>{
  const service=createService(defaults,{origins:['http://snake.test'],manualTick:true});service.server.listen(0,'127.0.0.1');await once(service.server,'listening');const port=(service.server.address() as AddressInfo).port
  try{
    const a=await client(port),b=await client(port);a.send({type:'join',name:'A'});b.send({type:'join',name:'B'})
    const aw=await a.wait('welcome'),bw=await b.wait('welcome');service.snapshots()
    const as=await a.wait('snapshot',m=>m.players.length===2),bs=await b.wait('snapshot',m=>m.players.length===2)
    assert.ok(as.players.some(p=>p.id===bw.id));assert.ok(bs.players.some(p=>p.id===aw.id));assert.deepEqual(as.food,bs.food)
    const room=[...service.rooms.values()][0],ap=room.players.get(aw.id)!,bp=room.players.get(bw.id)!
    // Server fixtures make consumption and collision deterministic; clients still use real sockets.
    Object.assign(ap,{x:30,y:30,angle:0,target:0,body:[{x:30,y:30},{x:29.35,y:30}]});Object.assign(bp,{x:70,y:70,angle:0,target:0,body:[{x:70,y:70},{x:69.35,y:70}]})
    room.food=[{id:90000,x:30+defaults.baseSpeed/defaults.simulationHz,y:30}]
    a.messages.length=0;b.messages.length=0;a.send({type:'input',seq:1,angle:0,x:99,score:999999,mass:99999});await new Promise(resolve=>setTimeout(resolve,20))
    service.tick();service.snapshots();const moved=await b.wait('snapshot',m=>m.players.some(p=>p.id===aw.id&&p.score===10));assert.equal(moved.players.find(p=>p.id===aw.id)?.mass,14);assert.ok(ap.x<31);assert.equal(ap.ack,1);assert.ok(!moved.food.some(f=>f.id===90000));assert.deepEqual((await a.wait('snapshot')).food,moved.food)
    a.send({type:'input',seq:0,angle:Math.PI});a.send({v:2,type:'input',seq:2,angle:0});await a.wait('error',m=>m.code==='invalid_version');assert.equal(ap.target,0)
    a.send({type:'input',seq:2,angle:Math.fround(Math.PI)});await new Promise(resolve=>setTimeout(resolve,20));assert.equal(ap.ack,2);assert.ok(Math.abs(ap.target)<=Math.PI)
    Object.assign(ap,{x:50,y:50,angle:0,target:0,body:[{x:50,y:50}]});Object.assign(bp,{x:52,y:50,angle:0,target:0,body:[{x:52,y:50},{x:51.35,y:50},{x:50.7,y:50}]})
    a.messages.length=0;b.messages.length=0;service.tick();service.snapshots();const result=await a.wait('result');assert.equal(result.score,10);assert.equal(result.reason,'body_collision');assert.ok((await b.wait('snapshot')).players.some(p=>p.id===aw.id&&!p.alive));assert.equal(bp.kills,1)
    a.send({type:'restart'});await a.wait('snapshot',m=>m.players.some(p=>p.id===aw.id&&p.alive&&p.score===0))
    b.ws.close();await once(b.ws,'close');await new Promise(resolve=>setTimeout(resolve,20));a.messages.length=0;service.snapshots();assert.equal((await a.wait('snapshot')).players.length,1)
    const b2=await client(port);b2.send({type:'join',name:'B rejoin'});assert.notEqual((await b2.wait('welcome')).id,bw.id);b2.ws.close();a.ws.close()
  }finally{await service.close()}
})
test('capacity creates another independent room and rate limit closes abusive client',{timeout:10000},async()=>{
  const service=createService({...defaults,maxPlayers:1,maxRooms:2},{origins:['http://snake.test'],manualTick:true});service.server.listen(0,'127.0.0.1');await once(service.server,'listening');const port=(service.server.address() as AddressInfo).port
  try{const a=await client(port),b=await client(port);a.send({type:'join',name:'A'});b.send({type:'join',name:'B'});await a.wait('welcome');await b.wait('welcome');assert.equal(service.rooms.size,2);const closed=once(a.ws,'close');for(let i=0;i<65;i++)a.send({type:'ping',nonce:i});const [code]=await closed;assert.equal(code,1008);b.ws.close()}finally{await service.close()}
})
test('foreign origin and oversize messages cannot enter or retain a socket',{timeout:10000},async()=>{
  const service=createService(defaults,{origins:['http://snake.test']});service.server.listen(0,'127.0.0.1');await once(service.server,'listening');const port=(service.server.address() as AddressInfo).port
  try{const foreign=new WebSocket(`ws://127.0.0.1:${port}/snake-arena/socket`,{origin:'https://foreign.invalid'});foreign.on('error',()=>{});await new Promise<void>(resolve=>foreign.once('close',()=>resolve()));assert.equal(service.connections.size,0);const a=await client(port),closed=once(a.ws,'close');a.ws.send('x'.repeat(2048));assert.equal((await closed)[0],1009)}finally{await service.close()}
})
test('16 real sockets share the configured room and receive server snapshots',{timeout:15000},async()=>{
  const service=createService(defaults,{origins:['http://snake.test'],manualTick:true});service.server.listen(0,'127.0.0.1');await once(service.server,'listening');const port=(service.server.address() as AddressInfo).port
  try{
    const clients=await Promise.all(Array.from({length:16},()=>client(port)))
    const welcome=await Promise.all(clients.map(async(c,i)=>{c.send({type:'join',name:`Sim ${i}`});return c.wait('welcome')}))
    assert.equal(service.rooms.size,1);assert.equal(service.connections.size,16)
    const room=[...service.rooms.values()][0]
    welcome.forEach((w,i)=>{const p=room.players.get(w.id)!;Object.assign(p,{x:12.5+(i%4)*25,y:12.5+Math.floor(i/4)*25,body:[{x:12.5+(i%4)*25,y:12.5+Math.floor(i/4)*25}]})})
    for(let tick=0;tick<20;tick++)service.tick()
    service.snapshots()
    await Promise.all(clients.map(async c=>{const m=await c.wait('snapshot',m=>m.players.length===16&&m.players.every(p=>p.alive));assert.equal(m.food.length,defaults.resourceCount)}))
    clients.forEach(c=>c.ws.close())
  }finally{await service.close()}
})

test('socket boost validates boolean, rejects stale intent and ignores forged mass/speed',{timeout:10000},async()=>{
 const service=createService(defaults,{origins:['http://snake.test'],manualTick:true});service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
 try{const a=await client((service.server.address() as AddressInfo).port);a.send({type:'join',name:'Boost'});const w=await a.wait('welcome'),room=[...service.rooms.values()][0],p=room.players.get(w.id)!;room.food=[]
 a.send({type:'input',seq:1,angle:0,boost:'true'});await a.wait('error');assert.equal(p.ack,-1)
 a.send({type:'input',seq:2,angle:0,boost:true,mass:999,speed:999,score:999});await new Promise(r=>setTimeout(r,20));const x=p.x;service.tick();assert.equal(p.boosting,true);assert.ok(Math.abs(p.x-x-defaults.baseSpeed*defaults.boostMultiplier/25)<1e-9);assert.equal(p.mass,12);assert.equal(p.score,0)
 a.send({type:'input',seq:3,angle:0});a.send({type:'input',seq:2,angle:0,boost:true});await new Promise(r=>setTimeout(r,20));service.tick();assert.equal(p.boosting,false);a.ws.close()
 }finally{await service.close()}
})
