import {test} from 'node:test'
import assert from 'node:assert/strict'
import {defaults,validateConfig} from '../config.js'
import {Room,RARE_RESOURCE} from '../room.js'
import {FREE_RULES} from '../tournament.js'
import {botDirection} from '../bot-client.js'
const config={...defaults,rareResources:true}
function arena(){const room=new Room('rare',config,()=>.5),p=room.add('A','A');room.food=[];return {room,p}}
test('rare schedule is bounded, expires, replenishes ordinary food and stays absent from frozen tournament rules',()=>{
  assert.throws(()=>validateConfig({...defaults,rareResources:'true'}))
  const {room,p}=arena();p.body=[{x:p.x,y:p.y}];room.tick=99;room.step()
  const rare=room.food.find(f=>f.kind==='rare')!;assert.ok(rare);assert.equal(rare.expiresTick,400)
  assert.equal(room.food.filter(f=>!f.kind).length,config.resourceCount)
  assert.equal(room.snapshot().specialResource?.nextSpawnTick,600)
  room.tick=399;room.step();assert.ok(!room.food.some(f=>f.id===rare.id));assert.equal(room.food.length,config.resourceCount)
  const tournament=new Room('frozen',FREE_RULES,()=>.5);tournament.add('T','T');tournament.tick=1000;tournament.step()
  assert.ok(!tournament.food.some(f=>f.kind));assert.equal(tournament.snapshot().specialResource,undefined)
})
test('first spawn is near a living creature with body and boundary clearance; crowded attempts are bounded',()=>{
  const {room,p}=arena();room.tick=99;room.step();const rare=room.food.find(f=>f.kind==='rare')!
  assert.ok(Math.hypot(rare.x-p.x,rare.y-p.y)>=8);assert.ok(rare.x>=6&&rare.y>=6)
  p.x=98;p.body=[{x:98,y:50}];room.food=[];room.tick=600;room.step()
  assert.equal(room.food.filter(f=>f.kind==='rare').length,1)
  // Every candidate is outside the arena at this anchor/angle.
  p.x=2;p.alive=true;p.body=[{x:2,y:50}];room.food=[];room.tick=1200;room.step()
  assert.equal(room.food.filter(f=>f.kind==='rare').length,0);assert.equal(room.snapshot().specialResource?.nextSpawnTick,1226)
})
test('rare collection is authoritative, exclusive, caps growth, resets the pickup counter and keeps scoring at max mass',()=>{
  const {room,p}=arena();p.mass=config.maxMass-2;p.body=[{x:p.x,y:p.y}]
  room.food=[{id:900,x:p.x+config.baseSpeed/config.simulationHz,y:p.y,kind:'rare',expiresTick:300}]
  room.step();assert.equal(p.score,50);assert.equal(p.mass,config.maxMass);assert.equal(p.maxSize,config.maxMass);assert.equal(p.body.length,config.maxMass);assert.equal(p.rarePickups,1)
  room.food=[{id:901,x:p.x+config.baseSpeed/config.simulationHz,y:p.y,kind:'rare',expiresTick:300}];room.step()
  assert.equal(p.score,100);assert.equal(p.mass,config.maxMass);assert.equal(p.rarePickups,2)
  assert.equal(room.snapshot().players[0].rarePickups,2)
  p.x=101;room.step();assert.equal(p.result?.score,100);room.restart(p.id);assert.equal(p.rarePickups,0)
  p.x=10;p.body=[{x:10,y:50}]
  const b=room.add('B','B');Object.assign(p,{x:49,y:50,angle:Math.PI/2,target:Math.PI/2,body:[{x:49,y:50}]});Object.assign(b,{x:51,y:50,angle:Math.PI/2,target:Math.PI/2,body:[{x:51,y:50}]})
  room.food=[{id:902,x:50,y:50,kind:'rare',expiresTick:300}];room.step()
  assert.equal(p.score+b.score,50);assert.equal(p.rarePickups+b.rarePickups,1)
})
test('expired rare gives no reward and a dead creature cannot collect',()=>{
  const {room,p}=arena();room.food=[{id:900,x:p.x+.28,y:p.y,kind:'rare',expiresTick:1}];room.step();assert.equal(p.score,0)
  p.x=100;room.food=[{id:901,x:100.28,y:p.y,kind:'rare',expiresTick:300}];room.step();assert.equal(p.alive,false);assert.equal(p.rarePickups,0)
})
test('bots value a nearby rare resource using only its public snapshot',()=>{
  const {room,p}=arena();Object.assign(p,{x:50,y:50,angle:0})
  const food=[{id:1,x:53,y:50},{id:2,x:50,y:55,kind:'rare' as const}]
  assert.ok(botDirection(p,{players:[p],food,tick:1},config)>.5)
})
