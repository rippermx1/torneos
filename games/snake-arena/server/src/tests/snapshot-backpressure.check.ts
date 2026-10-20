import test from 'node:test'
import assert from 'node:assert/strict'
import {once} from 'node:events'
import {performance} from 'node:perf_hooks'
import type {AddressInfo} from 'node:net'
import WebSocket from 'ws'
import {defaults} from '../config.js'
import {createService} from '../service.js'
test('a blocked connection skips obsolete world frames, preserves results, resumes fresh state and still times out',{timeout:5000},async()=>{
  const service=createService(defaults,{origins:['http://buffer.test'],manualTick:true});service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
  const ws=new WebSocket(`ws://127.0.0.1:${(service.server.address() as AddressInfo).port}/snake-arena/socket`,{origin:'http://buffer.test'}),messages:Record<string,unknown>[]=[]
  ws.on('message',raw=>messages.push(JSON.parse(raw.toString())))
  const wait=async(predicate:()=>boolean)=>{const end=Date.now()+1000;while(!predicate()){if(Date.now()>end)throw new Error('Socket condition timed out');await new Promise(r=>setTimeout(r,10))}}
  try{
    await once(ws,'open');ws.send(JSON.stringify({v:1,type:'join',name:'Human'}));await wait(()=>messages.some(m=>m.type==='welcome'))
    const c=[...service.connections][0],room=c.room!,p=room.players.get(c.id)!;let buffered=150000
    Object.defineProperty(c.socket,'bufferedAmount',{configurable:true,get:()=>buffered});const snapshots=messages.filter(m=>m.type==='snapshot').length
    p.x=-1;service.tick();for(let i=0;i<10;i++)service.snapshots();await wait(()=>messages.some(m=>m.type==='result'))
    assert.equal(messages.filter(m=>m.type==='snapshot').length,snapshots);assert.ok(c.snapshotBlockedAt!==undefined)
    buffered=0;service.tick();service.snapshots();await wait(()=>messages.filter(m=>m.type==='snapshot').length===snapshots+1)
    assert.equal(messages.at(-1)?.tick,room.tick);assert.equal(c.snapshotBlockedAt,undefined)
    buffered=150000;c.snapshotBlockedAt=performance.now()-5001;const closed=once(ws,'close');service.snapshots();const [code,reason]=await closed;assert.equal(code,1013);assert.equal(reason.toString(),'slow_client')
  }finally{ws.terminate();await service.close()}
})
