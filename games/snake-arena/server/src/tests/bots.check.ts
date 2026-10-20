import {test} from 'node:test'
import assert from 'node:assert/strict'
import {once} from 'node:events'
import type {AddressInfo} from 'node:net'
import {defaults} from '../config.js'
import {Room} from '../room.js'
import {BotFleet,botDirection,botBoost,TimingHistogram} from '../bot-client.js'
import {createService} from '../service.js'
const wait=async(predicate:()=>boolean)=>{const until=Date.now()+5000;while(!predicate()){if(Date.now()>until)throw new Error('Bot condition timed out');await new Promise(r=>setTimeout(r,20))}}
test('bot reports preserve server close codes instead of leaving a silent empty simulation',{timeout:10000},async()=>{
  const service=createService(defaults,{origins:['http://bots.test']});service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
  const fleet=new BotFleet(`ws://127.0.0.1:${(service.server.address() as AddressInfo).port}/snake-arena/socket`,'http://bots.test',2)
  try{
    fleet.start();fleet.beginMeasurement();await wait(()=>fleet.stats.welcomed===2)
    for(const c of service.connections)c.socket.close(1013,'slow_client')
    await wait(()=>fleet.stats.unexpectedCloses===2&&fleet.open===0)
    assert.deepEqual(fleet.report().closeCodes,{'1013:slow_client':2})
  }finally{await fleet.close();await service.close()}
})
test('steering seeks food while avoiding the wall and observed foreign bodies',()=>{
  const room=new Room('steering',defaults),me=room.add('bot','Bot')
  Object.assign(me,{x:50,y:50,angle:0,body:[{x:50,y:50}]});room.food=[{id:1,x:65,y:50}]
  assert.equal(botDirection(me,{players:[me],food:room.food,tick:1},defaults),0)
  const other={...me,id:'other',body:[{x:54,y:50},{x:55,y:50},{x:56,y:50}]}
  assert.ok(Math.abs(botDirection(me,{players:[me,other],food:room.food,tick:1},defaults))>=.5)
  me.x=97;room.food=[{id:2,x:99,y:50}]
  const angle=botDirection(me,{players:[me],food:room.food,tick:1},defaults)
  assert.ok(Number.isFinite(angle)&&Math.abs(angle)<=Math.PI);assert.ok(Math.cos(angle)<.5)
})
test('bounded timing histogram reports bucket limits and overflow explicitly',()=>{
  const h=new TimingHistogram();h.add(NaN);h.add(-1);h.add(.4);h.add(100.2);h.add(6000)
  assert.deepEqual(h.report(),{samples:3,meanMs:(.4+100.2+6000)/3,minMs:.4,maxMs:6000,p95UpperBucketMs:null,p95Overflow:true,bucketMs:1,overflowAbove5000Ms:1})
})
test('real bot sockets move with input only, receive results, restart and release rooms',{timeout:10000},async()=>{
  const service=createService(defaults,{origins:['http://bots.test']});service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
  const fleet=new BotFleet(`ws://127.0.0.1:${(service.server.address() as AddressInfo).port}/snake-arena/socket`,'http://bots.test',4)
  const packets:Record<string,unknown>[]=[]
  try{
    fleet.start();fleet.beginMeasurement();await wait(()=>fleet.stats.welcomed===4)
    for(const c of service.connections)c.socket.on('message',raw=>packets.push(JSON.parse(raw.toString())))
    await wait(()=>fleet.stats.inputs>=8&&fleet.stats.acknowledgedInputs>0)
    const room=[...service.rooms.values()][0],player=[...room.players.values()][0];player.x=-5
    await wait(()=>fleet.stats.results>0&&fleet.stats.restarts>0&&player.alive)
    const inputs=packets.filter(m=>m.type==='input');assert.ok(inputs.length>0)
    assert.ok(inputs.every(m=>Object.keys(m).sort().join(',')==='angle,boost,seq,type,v' && typeof m.boost==='boolean'))
    assert.equal(fleet.report().unexpectedCloses,0);assert.equal(fleet.report().parseErrors,0)
    await fleet.close();await wait(()=>service.connections.size===0&&service.rooms.size===0)
  }finally{await fleet.close();await service.close()}
})

test('bots boost only with spare mass and a safe resource approach',()=>{
 const room=new Room('boost-bot',defaults),me=room.add('bot','Bot');Object.assign(me,{x:50,y:50,angle:0,body:[{x:50,y:50}]});const world={players:[me],food:[{id:1,x:61,y:50}],tick:1}
 assert.equal(botBoost(me,world,defaults,0),true);me.mass=10;assert.equal(botBoost(me,world,defaults,0),false);me.mass=12;me.x=90;assert.equal(botBoost(me,world,defaults,0),false)
})
