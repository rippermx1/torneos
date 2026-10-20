import {test} from 'node:test'
import assert from 'node:assert/strict'
import {defaults,validateConfig} from '../config.js'
import {Room} from '../room.js'
function arena(){const room=new Room('boost',defaults,()=>.5),p=room.add('A','A');room.food=Array.from({length:defaults.resourceCount},(_,i)=>({id:i+1,x:5,y:5}));return {room,p}}
test('boost spends mass, trims tail, preserves score/max size and stops at floor',()=>{
 const {room,p}=arena(),x=p.x;p.score=70
 for(let i=0;i<50;i++){room.input('A',i,0,true);room.step()}
 assert.equal(p.mass,8);assert.equal(p.body.length,8);assert.equal(p.boosting,false);assert.equal(p.score,70);assert.equal(p.maxSize,12)
 assert.ok(p.x-x>defaults.baseSpeed*2);const stopped=p.x
 room.input('A',50,0,true);room.step();assert.ok(Math.abs(p.x-stopped-defaults.baseSpeed/25)<1e-9)
 const snap=room.snapshot().players[0];assert.equal(snap.boosting,false);assert.ok(!('boostDebt' in snap)&&!('inputAt' in snap)&&!('wantsBoost' in snap))
})
test('release, stale sequence and expired input cannot retain boost; taps still pay',()=>{
 const {room,p}=arena();room.input('A',1,0,true);room.step();assert.equal(p.boosting,true)
 room.input('A',2,0,false);assert.equal(room.input('A',1,0,true),false);room.step();assert.equal(p.boosting,false)
 for(let i=3;i<53;i++){room.input('A',i,0,i%2===0);room.step()}
 assert.equal(p.mass,10)
 room.input('A',53,0,true);for(let i=0;i<10;i++)room.step();assert.equal(p.boosting,false)
})
test('death/restart clears intent/debt; food restores ability without trusting client mass',()=>{
 const {room,p}=arena();p.mass=8;p.body.length=8;room.input('A',1,0,true)
 room.food=[{id:999,x:p.x+defaults.baseSpeed/25,y:p.y}];room.step();assert.equal(p.mass,10)
 room.input('A',2,0,true);room.step();assert.equal(p.boosting,true)
 p.x=-1;room.step();assert.equal(p.alive,false);assert.equal(p.boosting,false)
 assert.equal(room.restart('A'),true);room.food=[];room.step();assert.equal(p.boosting,false);assert.equal(p.mass,12);assert.equal(p.boostDebt,0)
})
test('boost config bounds preserve collision step and mass floor',()=>{
 for(const bad of [{boostMultiplier:1},{boostMultiplier:3},{boostMassPerSecond:Infinity},{boostMinMass:12},{boostMinMass:7.5},{boostInputTimeout:0},{baseSpeed:10}])assert.throws(()=>validateConfig(bad))
 assert.equal(validateConfig({}).boostMultiplier,1.6)
})
