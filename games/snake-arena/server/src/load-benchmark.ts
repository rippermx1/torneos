import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {fork,type ChildProcess} from 'node:child_process'
import {performance} from 'node:perf_hooks'
import {defaults,loadConfig} from './config.js'
import {BotFleet} from './bot-client.js'
import {DEATH_ORBS} from './room.js'
const output=path.resolve(process.argv[2]??'load-report.json'),seconds=Number(process.argv[3]??60)
if(!Number.isFinite(seconds)||seconds<5||seconds>180)throw new Error('Use 5–180 measured seconds per scenario')
const selected=process.env.SNAKE_BENCHMARK_CLIENTS?Number(process.env.SNAKE_BENCHMARK_CLIENTS):undefined
if(selected!==undefined&&(!Number.isInteger(selected)||selected<1||selected>64))throw new Error('Use 1–64 benchmark clients')
const baseConfig=process.env.SNAKE_BENCHMARK_CONFIG?loadConfig(process.env.SNAKE_BENCHMARK_CONFIG):defaults
const scenarios=selected===undefined?[{clients:32,perRoom:16},{clients:64,perRoom:16},{clients:32,perRoom:32},{clients:64,perRoom:64}]:[{clients:selected,perRoom:baseConfig.maxPlayers}]
const report={kind:'simulated_real_websocket_clients',date:new Date().toISOString(),environment:{node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,logicalCpus:os.availableParallelism()},secondsPerScenario:seconds,warmupSeconds:5,seed:9,notMeasured:['Unity/browser FPS','mobile memory','internet/LAN latency','human fun or retention'],externalPcLoad:'uncontrolled; child server and headless bot process measured separately',scenarios:[] as unknown[]}
function receive(child:ChildProcess,type:string,timeoutMs=10000){return new Promise<Record<string,unknown>>((resolve,reject)=>{const timeout=setTimeout(()=>done(new Error(`Worker timeout: ${type}`)),timeoutMs);const message=(m:unknown)=>{if((m as {type?:string}).type===type)done(null,m as Record<string,unknown>)};const exit=(code:unknown)=>done(new Error(`Worker exited ${code}`));function done(error:Error|null,value?:Record<string,unknown>){clearTimeout(timeout);child.off('message',message);child.off('exit',exit);if(error)reject(error);else resolve(value!)}child.on('message',message);child.once('exit',exit)})}
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))
let activeChild:ChildProcess|undefined,activeFleet:BotFleet|undefined,cancelled=false
process.on('SIGINT',()=>{cancelled=true;void activeFleet?.close();activeChild?.kill();process.exitCode=130})
try{
  for(const scenario of scenarios){
    console.log(JSON.stringify({event:'scenario_start',...scenario,seconds}))
    const config={...baseConfig,maxPlayers:scenario.perRoom,maxRooms:Math.ceil(scenario.clients/scenario.perRoom)}
    const child=activeChild=fork(new URL('./load-worker.js',import.meta.url),[JSON.stringify(config),'9'],{stdio:['ignore','inherit','inherit','ipc']})
    const ready=await receive(child,'ready'),fleet=activeFleet=new BotFleet(`ws://127.0.0.1:${ready.port}/snake-arena/socket`,'http://snake-benchmark.local',scenario.clients,9)
    fleet.start();const joinDeadline=performance.now()+30000
    while(fleet.stats.welcomed<scenario.clients){if(cancelled||performance.now()>joinDeadline||fleet.stats.unexpectedCloses)throw new Error(`Only ${fleet.stats.welcomed}/${scenario.clients} joined`);await wait(50)}
    await wait(5000)
    const startPromise=receive(child,'started');child.send({type:'start'});await startPromise;fleet.beginMeasurement();const began=performance.now(),cpuStart=process.cpuUsage();let peakRss=process.memoryUsage().rss
    while(performance.now()-began<seconds*1000){if(cancelled)throw new Error('Cancelled');await wait(Math.min(1000,seconds*1000-(performance.now()-began)));peakRss=Math.max(peakRss,process.memoryUsage().rss)}
    const elapsed=(performance.now()-began)/1000,cpu=process.cpuUsage(cpuStart),serverPromise=receive(child,'report');child.send({type:'report'});const server=await serverPromise,clients=fleet.report()
    await fleet.close();const closedPromise=receive(child,'closed');child.send({type:'close'});const cleanup=await closedPromise
    const result={...scenario,server,client:{...clients,seconds:elapsed,receivedMiBPerSecond:clients.receivedBytes/1048576/elapsed,perClientKiBPerSecond:clients.receivedBytes/1024/elapsed/scenario.clients,actualSnapshotsPerClientHz:clients.snapshots/elapsed/scenario.clients,cpuPercentOneCore:(cpu.user+cpu.system)/(elapsed*10000),peakRssMiB:peakRss/1048576},cleanup,transportPass:clients.welcomed===scenario.clients&&clients.open===scenario.clients&&clients.unexpectedCloses===0&&clients.parseErrors===0&&clients.errors===(clients.codes.restart_unavailable??0)&&clients.inputs>0&&clients.acknowledgedInputs>0&&clients.snapshots>0&&cleanup.connections===0&&cleanup.rooms===0}
    const events=server.events as Record<string,number>
    const gameplayPass=!config.deathOrbs||((events.death_orbs_spawned??0)>0&&(events.death_orb_collected??0)>0&&(server.maxDeathOrbsPerRoom as number)<=DEATH_ORBS.maxPerRoom&&server.outsideResourcesObserved===0)
    report.scenarios.push({...result,gameplayPass});fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({event:'scenario_complete',clients:scenario.clients,perRoom:scenario.perRoom,transportPass:result.transportPass,gameplayPass,tickP95:(server.tickMs as {p95:number}).p95,simulationHz:server.actualSimulationHz,MiBPerSecond:result.client.receivedMiBPerSecond}));activeChild=undefined;activeFleet=undefined;if(!result.transportPass||!gameplayPass)process.exitCode=1
  }
}finally{await activeFleet?.close();activeChild?.kill()}
