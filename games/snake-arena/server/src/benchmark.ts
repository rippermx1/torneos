import fs from 'node:fs'
import {performance} from 'node:perf_hooks'
import {Room} from './room.js'
import {defaults} from './config.js'
const room=new Room('simulated-16',defaults)
for(let i=0;i<16;i++){
  const p=room.add(String(i),`Sim ${i}`),cx=12.5+(i%4)*25,cy=12.5+Math.floor(i/4)*25
  Object.assign(p,{x:cx+4,y:cy,angle:Math.PI/2,target:Math.PI/2,body:Array.from({length:12},(_,n)=>({x:cx+4,y:cy-n*defaults.radius}))})
}
const durations:number[]=[],snapshots:number[]=[]
for(let tick=0;tick<500;tick++){
  const time=tick/defaults.simulationHz
  for(const p of room.players.values())room.input(p.id,tick,Math.atan2(Math.sin(Math.PI/2+time*defaults.baseSpeed/4),Math.cos(Math.PI/2+time*defaults.baseSpeed/4)))
  const start=performance.now();room.step();durations.push(performance.now()-start)
  if(tick%3===0)snapshots.push(Buffer.byteLength(JSON.stringify(room.snapshot())))
}
durations.sort((a,b)=>a-b)
const report={kind:'synthetic_server_only',players:16,ticks:500,simulationHz:25,aliveAfter:[...room.players.values()].filter(p=>p.alive).length,tickMs:{median:durations[250],p95:durations[475],max:durations[499]},snapshotBytes:{mean:Math.round(snapshots.reduce((a,b)=>a+b,0)/snapshots.length),max:Math.max(...snapshots)},notMeasured:['browser FPS','mobile memory','32/64 CCU','human fun']}
console.log(JSON.stringify(report,null,2));if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n')
if(report.aliveAfter!==16)process.exitCode=1
