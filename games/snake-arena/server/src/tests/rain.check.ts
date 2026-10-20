import {test} from 'node:test'
import assert from 'node:assert/strict'
import {defaults,validateConfig} from '../config.js'
import {Room,LIGHT_RAIN} from '../room.js'
import {FREE_RULES} from '../tournament.js'
const config={...defaults,lightRain:true,rareResources:true,practiceMissions:true}
function arena(){const room=new Room('rain',config,()=>.5),p=room.add('A','A');room.food=[];p.body=[{x:p.x,y:p.y}];return {room,p}}
test('light rain is opt-in and never changes frozen tournament rules',()=>{
  assert.throws(()=>validateConfig({...defaults,lightRain:'yes'}))
  for(const c of [defaults,FREE_RULES]){const room=new Room('plain',c,()=>.5);room.add('A','A');room.tick=199;room.step();assert.equal(room.snapshot().lightRain,undefined);assert.ok(!room.food.some(f=>f.kind==='rain'))}
})
test('rain uses room ticks, bounded safe groups, permanent food refill and expires before collection',()=>{
  const {room,p}=arena();room.tick=198;room.step();assert.equal(room.food.filter(f=>f.kind==='rain').length,0)
  room.step();const rain=room.food.filter(f=>f.kind==='rain'),state=room.snapshot().lightRain!
  assert.ok(rain.length>=8&&rain.length<=24);assert.equal(state.endsTick,575);assert.equal(state.nextSpawnTick,1325)
  assert.equal(new Set(rain.map(f=>f.id)).size,rain.length);assert.equal(room.food.filter(f=>!f.kind).length,config.resourceCount)
  for(const f of rain){assert.ok(f.x>=5&&f.x<=95&&f.y>=5&&f.y<=95);assert.ok(Math.hypot(f.x-p.x,f.y-p.y)>config.radius*4)}
  const expired=rain[0],score=p.score;p.x=expired.x-.28;p.y=expired.y;p.body=[{x:p.x,y:p.y}];room.food=[expired];room.tick=574;room.step()
  assert.equal(p.score,score);assert.equal(room.snapshot().lightRain?.endsTick,null);assert.ok(!room.food.some(f=>f.kind==='rain'));assert.equal(room.food.filter(f=>!f.kind).length,config.resourceCount)
})
test('rain pickups award ordinary growth, score and missions; consuming them preserves baseline food',()=>{
  const {room,p}=arena();room.tick=199;room.step();const rain=room.food.find(f=>f.kind==='rain')!
  p.x=rain.x-.28;p.y=rain.y;p.body=[{x:p.x,y:p.y}];room.food=room.food.filter(f=>f.kind==='rain')
  room.step();assert.ok(p.ordinaryPickups>=1);assert.equal(p.score,p.ordinaryPickups*10);assert.equal(p.mass,12+p.ordinaryPickups*2);assert.equal(p.rarePickups,0)
  assert.equal(room.food.filter(f=>!f.kind).length,config.resourceCount)
  for(let i=0;i<5;i++){room.food=[{id:900+i,x:p.x+.28,y:p.y,kind:'rain',expiresTick:575}];room.step()}
  assert.equal(room.snapshot().players[0].practiceProgress?.missions[0].complete,true)
  assert.ok(p.sessionXp>=25);assert.equal(room.snapshot().lightRain?.remaining,0);assert.equal(room.snapshot().lightRain?.endsTick,null)
})
test('no live creature postpones rain; crowded retries and repeated cycles stay bounded',()=>{
  const {room,p}=arena();p.alive=false;room.tick=199;room.step();assert.equal(room.snapshot().lightRain?.endsTick,null)
  p.alive=true;p.x=2;p.y=2;p.body=[{x:2,y:2}];room.step();assert.equal(room.food.filter(f=>f.kind==='rain').length,0);assert.equal(room.snapshot().lightRain?.nextSpawnTick,226)
  p.x=50;p.y=50;p.body=[{x:50,y:50}];room.tick=225;room.step();assert.ok(room.snapshot().lightRain!.remaining>0)
  const next=room.snapshot().lightRain!.nextSpawnTick;room.tick=next-1;room.step();assert.ok(room.snapshot().lightRain!.remaining<=LIGHT_RAIN.clusters*LIGHT_RAIN.perCluster)
})
test('one shared rain light rewards only one survivor, caps mass and cannot be collected after death',()=>{
  const room=new Room('shared',config,Math.random),a=room.add('A','A'),b=room.add('B','B')
  Object.assign(a,{x:49,y:50,angle:Math.PI/2,target:Math.PI/2,mass:config.maxMass,body:[{x:49,y:50}]})
  Object.assign(b,{x:51,y:50,angle:Math.PI/2,target:Math.PI/2,body:[{x:51,y:50}]})
  room.food=[{id:999,x:50,y:50,kind:'rain',expiresTick:300}];room.step()
  assert.equal(a.score+b.score,10);assert.equal(a.ordinaryPickups+b.ordinaryPickups,1);assert.equal(a.mass,config.maxMass)
  a.x=100;room.food=[{id:1000,x:100.28,y:50.28,kind:'rain',expiresTick:300}];const before=a.score;room.step();assert.equal(a.alive,false);assert.equal(a.score,before)
})
