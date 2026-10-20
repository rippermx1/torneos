import {once} from 'node:events'
import {performance,monitorEventLoopDelay} from 'node:perf_hooks'
import type {AddressInfo} from 'node:net'
import {validateConfig} from './config.js'
import {createService} from './service.js'
import {insideArena} from './geometry.js'
const config=validateConfig(JSON.parse(process.argv[2])),seed=Number(process.argv[3]??1)
let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296}
let measuring=false,began=0,cpuStart=process.cpuUsage(),peakRss=0,maxBufferedBytes=0,overBudget=0
const step:number[]=[],tick:number[]=[],interval:number[]=[],snapshots:number[]=[],ccu:number[]=[],alive:number[]=[],entities:number[]=[],roomCounts:number[]=[]
const delay=monitorEventLoopDelay({resolution:10})
const events:Record<string,number>={}
let maxDeathOrbsPerRoom=0,outsideResourcesObserved=0
const service=createService(config,{origins:['http://snake-benchmark.local'],random,
  log:(event)=>{if(measuring)events[event]=(events[event]??0)+1},
  onTick:s=>{if(measuring){step.push(s.stepMs);tick.push(s.totalMs);interval.push(s.intervalMs);if(s.totalMs>1000/config.simulationHz)overBudget++}},
  onSnapshots:s=>{if(measuring){snapshots.push(s.durationMs);maxBufferedBytes=Math.max(maxBufferedBytes,s.maxBufferedBytes)}}})
service.server.listen(0,'127.0.0.1');await once(service.server,'listening')
process.send?.({type:'ready',port:(service.server.address() as AddressInfo).port,pid:process.pid})
const sample=setInterval(()=>{if(!measuring)return;peakRss=Math.max(peakRss,process.memoryUsage().rss);ccu.push(service.connections.size);roomCounts.push(service.rooms.size);let live=0,total=0;for(const room of service.rooms.values()){total+=room.food.length;maxDeathOrbsPerRoom=Math.max(maxDeathOrbsPerRoom,room.food.filter(f=>f.kind==='death').length);outsideResourcesObserved+=room.food.filter(f=>!insideArena(config,f,-1e-9)).length;for(const p of room.players.values())if(p.alive){live++;total+=p.body.length}}alive.push(live);entities.push(total)},1000)
function distribution(values:number[]){const sorted=[...values].sort((a,b)=>a-b);return {samples:values.length,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,min:sorted[0]??null,p95:sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]??null,max:sorted.at(-1)??null}}
process.on('message',async message=>{
  const m=message as {type:string}
  if(m.type==='start'&&!measuring){measuring=true;began=performance.now();cpuStart=process.cpuUsage();peakRss=process.memoryUsage().rss;delay.enable();delay.reset();process.send?.({type:'started'})}
  if(m.type==='report'&&measuring){
    const seconds=(performance.now()-began)/1000,cpu=process.cpuUsage(cpuStart);measuring=false;delay.disable();peakRss=Math.max(peakRss,process.memoryUsage().rss)
    process.send?.({type:'report',seconds,config,ticks:tick.length,actualSimulationHz:tick.length/seconds,snapshotBroadcasts:snapshots.length,actualSnapshotHz:snapshots.length/seconds,tickMs:distribution(tick),roomStepMs:distribution(step),tickIntervalMs:distribution(interval),snapshotFanoutMs:distribution(snapshots),ticksOver40ms:overBudget,peakBufferedBytes:maxBufferedBytes,peakRssMiB:peakRss/1048576,cpuPercentOneCore:(cpu.user+cpu.system)/(seconds*10000),eventLoopDelayMs:{mean:delay.mean/1e6,p95:delay.percentile(95)/1e6,max:delay.max/1e6},connectedClients:distribution(ccu),rooms:distribution(roomCounts),alivePlayers:distribution(alive),entities:distribution(entities),maxDeathOrbsPerRoom,outsideResourcesObserved,events})
  }
  if(m.type==='close'){clearInterval(sample);await service.close();process.send?.({type:'closed',connections:service.connections.size,rooms:service.rooms.size});process.disconnect()}
})
process.on('disconnect',()=>{clearInterval(sample);void service.close()})
