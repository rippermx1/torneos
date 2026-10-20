import {test} from 'node:test'
import assert from 'node:assert/strict'
import {defaults,validateConfig} from '../config.js'
import {Room} from '../room.js'
import {FREE_RULES} from '../tournament.js'
const config={...defaults,rareResources:true,practiceMissions:true}
test('confirmed consumption grants each mission once; boost and repeated snapshots cannot grant XP',()=>{
  const room=new Room('missions',config,()=>.5),p=room.add('A','A')
  for(let i=0;i<5;i++){room.food=[{id:900+i,x:p.x+.28,y:p.y}];room.step()}
  assert.equal(p.sessionXp,25);assert.equal(p.mass,22)
  room.food=[{id:999,x:p.x+.28,y:p.y,kind:'rare',expiresTick:300}];room.step()
  const progress=room.snapshot().players[0].practiceProgress!
  assert.equal(progress.xp,120);assert.equal(progress.earned,120);assert.ok(progress.missions.every(m=>m.complete))
  room.food=[];room.input(p.id,1,0,true);room.step();room.snapshot();room.snapshot()
  assert.equal(p.sessionXp,120);assert.equal(p.missionEarned,120)
  p.mass=10;room.step();assert.equal(room.snapshot().players[0].practiceProgress?.missions[1].complete,true)
  p.x=101;room.step();assert.equal(p.alive,false);assert.equal(room.snapshot().players[0].practiceProgress?.xp,120)
  assert.ok(room.restart(p.id));const fresh=room.snapshot().players[0].practiceProgress!
  assert.equal(fresh.life,2);assert.equal(fresh.xp,120);assert.equal(fresh.earned,0);assert.ok(fresh.missions.every(m=>!m.complete))
  room.food=[{id:1000,x:p.x+.28,y:p.y,kind:'rare',expiresTick:300}];room.step();assert.equal(p.sessionXp,180)
})
test('dead players cannot earn missions; disabled and frozen tournament snapshots have no progression',()=>{
  const room=new Room('dead',config,()=>.5),p=room.add('A','A');p.x=100
  room.food=[{id:999,x:100.28,y:p.y,kind:'rare',expiresTick:300}];room.step()
  assert.equal(p.sessionXp,0);assert.equal(p.rarePickups,0)
  const frozen=new Room('frozen',FREE_RULES,()=>.5);frozen.add('T','T');assert.equal(frozen.snapshot().players[0].practiceProgress,undefined)
  assert.throws(()=>validateConfig({...config,practiceMissions:'true'}));assert.throws(()=>validateConfig({...config,rareResources:false}));assert.throws(()=>validateConfig({...config,maxMass:20}))
})
