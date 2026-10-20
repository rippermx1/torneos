import test from 'node:test'
import assert from 'node:assert/strict'
import {once} from 'node:events'
import type {AddressInfo} from 'node:net'
import WebSocket from 'ws'
import {defaults,validateConfig} from '../config.js'
import {Room,DEATH_ORBS,type Player} from '../room.js'
import {insideArena,edgeDistance} from '../geometry.js'
import {FREE_RULES} from '../tournament.js'
import {botDirection,botBoost} from '../bot-client.js'
import {createService} from '../service.js'
type GuestMessage={type:'welcome'|'result'}|(Omit<ReturnType<Room['snapshot']>,'type'>&{type:'snapshot'})
const config=validateConfig({...defaults,width:150,height:150,arenaShape:'circle',deathOrbs:true,resourceCount:1000})
function random(){let seed=9;return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function victim(p:Player,mass=12){Object.assign(p,{x:150,y:75,angle:0,target:0,mass,body:Array.from({length:mass},(_,i)=>({x:150-i*.65,y:75}))})}
test('practice circle validates shape and flags without changing frozen tournament rules',()=>{
  assert.throws(()=>validateConfig({...defaults,arenaShape:'ellipse'}));assert.throws(()=>validateConfig({...defaults,arenaShape:'circle',height:120}));assert.throws(()=>validateConfig({...defaults,deathOrbs:'true'}))
  assert.equal(FREE_RULES.arenaShape,undefined);assert.equal(FREE_RULES.deathOrbs,undefined)
  const frozen=new Room('frozen',FREE_RULES,random()),p=frozen.add('P','Player');victim(p);frozen.step()
  assert.equal(p.alive,false);assert.equal(frozen.food.length,240);assert.ok(frozen.food.every(f=>!f.kind))
})
test('all 1000 ordinary lights, whole spawn bodies and event resources stay inside the circular boundary',()=>{
  const room=new Room('circle',{...config,rareResources:true,lightRain:true},random())
  for(let i=0;i<16;i++){const p=room.add(String(i),'Creature');assert.ok(p.body.every(b=>insideArena(config,b,config.radius)))}
  assert.equal(room.food.length,1000);assert.ok(room.food.every(f=>insideArena(config,f,3)))
  const quadrants=new Set(room.food.map(f=>(f.x<75?'L':'R')+(f.y<75?'B':'T')));assert.equal(quadrants.size,4)
  // Centre-pilot remains alive long enough to exercise rare and rain schedules.
  for(let i=0;i<300;i++){for(const p of room.players.values()){p.x=75;p.y=75;p.body=[{x:75,y:75}];p.alive=p.id==='0'}room.step();assert.ok(room.food.every(f=>insideArena(config,f,0)))}
  assert.ok(room.food.some(f=>f.kind==='rain'));assert.ok(room.food.some(f=>f.kind==='rare'))
})
test('a corner inside the old square is fatal, while a point just inside the circle is safe',()=>{
  const room=new Room('corner',config,random()),p=room.add('P','Player');Object.assign(p,{x:140,y:140,body:[{x:140,y:140}]});room.step();assert.equal(p.result?.reason,'boundary')
  room.restart(p.id);Object.assign(p,{x:75,y:2,angle:Math.PI/2,target:Math.PI/2,body:[{x:75,y:2}]});room.step();assert.equal(p.alive,true)
  assert.ok(room.food.filter(f=>f.kind==='death').every(f=>insideArena(config,f,config.radius+.4-1e-9)))
})
test('bots and people leave the same remaining mass spread along their body exactly once, not peak mass',()=>{
  for(const name of ['Bot 1','Human']){
    const room=new Room(name,config,random()),p=room.add('P',name);victim(p,23);p.maxSize=120;p.score=99999
    room.step();const drops=room.food.filter(f=>f.kind==='death');assert.equal(drops.length,11);assert.equal(p.alive,false)
    assert.ok(drops.every(f=>f.expiresTick===1+45*config.simulationHz));assert.ok(drops.every(f=>insideArena(config,f,.65)))
    assert.ok(Math.max(...drops.map(f=>f.x))-Math.min(...drops.map(f=>f.x))>10)
    const ids=drops.map(f=>f.id);room.step();assert.deepEqual(room.food.filter(f=>f.kind==='death').map(f=>f.id),ids)
    assert.equal(room.food.filter(f=>!f.kind).length,1000);room.remove(p.id);room.step();assert.deepEqual(room.food.filter(f=>f.kind==='death').map(f=>f.id),ids)
  }
})
test('head and body collisions leave collectible drops and dead creatures cannot collect them',()=>{
  const room=new Room('collision',config,random()),a=room.add('A','A'),b=room.add('B','B')
  Object.assign(a,{x:74.5,y:75,angle:0,target:0,body:[{x:74.5,y:75}]});Object.assign(b,{x:75.5,y:75,angle:Math.PI,target:Math.PI,body:[{x:75.5,y:75}]})
  room.step();assert.equal(a.result?.reason,'head_collision');assert.equal(b.result?.reason,'head_collision');assert.equal(room.food.filter(f=>f.kind==='death').length,12);assert.equal(a.score+b.score,0)
  const bodyRoom=new Room('body',config,random()),c=bodyRoom.add('C','C'),d=bodyRoom.add('D','D')
  Object.assign(c,{x:70,y:75,body:[{x:70,y:75}]});Object.assign(d,{x:75,y:75,body:Array.from({length:12},(_,i)=>({x:75-i*.65,y:75}))});bodyRoom.step()
  assert.equal(c.result?.reason,'body_collision');assert.equal(d.kills,1);assert.ok(bodyRoom.food.some(f=>f.kind==='death'))
})
test('death lights reward ordinary growth and missions once, cap mass, expire before collection and stay room bounded',()=>{
  const room=new Room('collection',config,random()),p=room.add('P','P');room.food=[];Object.assign(p,{x:75,y:75,body:[{x:75,y:75}],mass:119})
  room.food=[{id:9000,x:75.28,y:75,kind:'death',expiresTick:5},{id:9001,x:75.28,y:75,kind:'death',expiresTick:1}];room.step()
  assert.equal(p.mass,120);assert.equal(p.score,10);assert.equal(p.ordinaryPickups,1);assert.equal(p.body.length,120);assert.ok(!room.food.some(f=>f.id>=9000));room.step();assert.equal(p.score,10)
  victim(p,120);room.step();const expiredIds=room.food.filter(f=>f.kind==='death').map(f=>f.id)
  room.tick=room.food.find(f=>f.kind==='death')!.expiresTick!-1;room.step();assert.ok(!room.food.some(f=>expiredIds.includes(f.id)))
  for(let i=0;i<10;i++){assert.equal(room.restart(p.id),true);victim(p,120);room.step();assert.ok(room.food.filter(f=>f.kind==='death').length<=DEATH_ORBS.maxPerRoom)}
  assert.equal(room.food.filter(f=>f.kind==='death').length,256);assert.equal(room.food.filter(f=>!f.kind).length,1000);assert.equal(new Set(room.food.map(f=>f.id)).size,room.food.length)
})
test('observed circle edge changes bot steering and blocks unsafe boost even inside the old square',()=>{
  const room=new Room('steering',config,random()),p=room.add('P','P');Object.assign(p,{x:125,y:125,angle:Math.PI/4,mass:20})
  const world={players:[p],food:[{id:1,x:135,y:135}],tick:1},angle=botDirection(p,world,config)
  assert.ok(Math.abs(angle-p.angle)>.5);assert.equal(botBoost(p,world,config,p.angle),false);assert.ok(edgeDistance(config,{x:140,y:140})<0)
})
test('a shared death light can be collected once and boost debt reduces the mass returned on death',()=>{
  const room=new Room('exclusive',config,random()),a=room.add('A','A'),b=room.add('B','B')
  Object.assign(a,{x:74,y:75,angle:Math.PI/2,target:Math.PI/2,body:[{x:74,y:75}]});Object.assign(b,{x:76,y:75,angle:Math.PI/2,target:Math.PI/2,body:[{x:76,y:75}]})
  room.food=[{id:9000,x:75,y:75.28,kind:'death',expiresTick:10}];room.step();assert.equal(a.score+b.score,10);assert.equal(a.mass+b.mass,26);assert.equal(a.ordinaryPickups+b.ordinaryPickups,1)
  room.remove(b.id);victim(a);a.boostDebt=.96;room.input(a.id,1,0,true);room.step();assert.equal(a.mass,11);assert.equal(room.food.filter(f=>f.kind==='death').length,5)
})
test('real guest sockets receive death drops, consume their IDs and grow from server state',{timeout:10000},async()=>{
  const service=createService(config,{origins:['http://death.test'],manualTick:true,random:random()});service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
  const ws=new WebSocket(`ws://127.0.0.1:${(service.server.address() as AddressInfo).port}/snake-arena/socket`,{origin:'http://death.test'}),messages:GuestMessage[]=[]
  ws.on('message',raw=>messages.push(JSON.parse(raw.toString()) as GuestMessage))
  const wait=async(predicate:()=>boolean)=>{const end=Date.now()+2000;while(!predicate()){if(Date.now()>end)throw new Error('Missing socket state');await new Promise(r=>setTimeout(r,10))}}
  try{
    await once(ws,'open');ws.send(JSON.stringify({v:1,type:'join',name:'Human'}));await wait(()=>messages.some(m=>m.type==='welcome'))
    const room=[...service.rooms.values()][0],p=[...room.players.values()][0];victim(p,24);service.tick();service.snapshots();await wait(()=>messages.some(m=>m.type==='result'))
    await wait(()=>messages.some(m=>m.type==='snapshot'&&m.food.some(f=>f.kind==='death')))
    const drops=room.food.filter(f=>f.kind==='death');assert.equal(drops.length,12)
    ws.send(JSON.stringify({v:1,type:'restart'}));await wait(()=>p.alive)
    const target=drops[5];Object.assign(p,{x:target.x-.28,y:target.y,angle:0,target:0,body:[{x:target.x-.28,y:target.y}]});const before=p.mass
    ws.send(JSON.stringify({v:1,type:'input',seq:1,angle:0,boost:false}));await wait(()=>p.ack===1);service.tick();service.snapshots()
    await wait(()=>messages.some(m=>m.type==='snapshot'&&m.players.some(a=>a.id===p.id&&a.score>=10)))
    assert.ok(!room.food.some(f=>f.id===target.id));assert.ok(p.mass>before);assert.ok(p.score>=10)
  }finally{ws.close();await once(ws,'close');await service.close()}
})
