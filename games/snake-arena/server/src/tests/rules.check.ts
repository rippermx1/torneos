import {test} from 'node:test'
import assert from 'node:assert/strict'
import {defaults,validateConfig} from '../config.js'
import {Room,turn} from '../room.js'
import {Grid} from '../grid.js'
test('configuration rejects nonfinite, unbounded and invalid rates',()=>{
  for(const invalid of [{baseSpeed:Infinity},{maxPlayers:1000},{snapshotHz:40},{initialMass:500},{respawnPolicy:'auto'}])assert.throws(()=>validateConfig({...defaults,...invalid}))
})
test('grid returns adjacent cells, including negative coordinates',()=>{const g=new Grid<{x:number;y:number}>(2);g.add({x:-.1,y:2});assert.equal(g.near(0,2,1).length,1)})
test('turn wraps radians and respects server turn speed',()=>{assert.ok(turn(Math.PI-.05,-Math.PI+.05,.02)>Math.PI-.05);assert.equal(turn(0,Math.PI,.1),.1)})
test('movement, exclusive consumption, growth and resource replenishment are authoritative',()=>{
  const room=new Room('unit',defaults,()=>.5);const p=room.add('A','A')
  room.food=[{id:1,x:p.x+defaults.baseSpeed/defaults.simulationHz,y:p.y}]
  room.step();assert.equal(p.score,10);assert.equal(p.mass,14);assert.equal(p.body.length,14);assert.equal(room.food.length,defaults.resourceCount);assert.equal(p.ack,-1)
  const x=p.x;assert.ok(room.input('A',1,Math.PI));assert.equal(room.input('A',0,0),false);room.step();assert.ok(p.x-x<=defaults.baseSpeed/defaults.simulationHz+.00001)
})
test('boundary death delivers statistics, manual restart keeps connection best',()=>{
  const room=new Room('unit',defaults,()=>.5),p=room.add('A','A');p.x=defaults.width;p.score=40;room.step()
  assert.equal(p.alive,false);assert.equal(p.result?.reason,'boundary');assert.equal(p.result?.personalBest,40)
  assert.equal(room.restart('A'),true);assert.equal(p.score,0);assert.equal(p.personalBest,40);assert.equal(room.restart('A'),false)
})
test('head versus body awards one kill to surviving owner',()=>{
  let rng=0;const room=new Room('unit',defaults,()=>{rng=(rng+.173)%1;return rng});const a=room.add('A','A'),b=room.add('B','B')
  Object.assign(a,{x:50,y:50,angle:0,target:0,body:[{x:50,y:50},{x:49.35,y:50}]})
  Object.assign(b,{x:52,y:50,angle:0,target:0,body:[{x:52,y:50},{x:51.35,y:50},{x:50.7,y:50}]})
  room.step();assert.equal(a.alive,false);assert.equal(b.alive,true);assert.equal(b.kills,1);assert.equal(a.result?.reason,'body_collision')
})
test('simultaneous head collision kills both without a spurious kill',()=>{
  let rng=0;const room=new Room('unit',defaults,()=>{rng=(rng+.173)%1;return rng});const a=room.add('A','A'),b=room.add('B','B')
  Object.assign(a,{x:50,y:50,angle:0,target:0,body:[{x:50,y:50}]})
  Object.assign(b,{x:51,y:50,angle:Math.PI,target:Math.PI,body:[{x:51,y:50}]})
  room.step();assert.equal(a.alive,false);assert.equal(b.alive,false);assert.equal(a.kills+b.kills,0)
})
