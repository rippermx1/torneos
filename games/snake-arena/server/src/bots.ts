import fs from 'node:fs'
import {performance} from 'node:perf_hooks'
import {BotFleet} from './bot-client.js'
import {resolveLocalHost} from './local-host.js'
const count=Number(process.argv[2]??12),port=Number(process.env.SNAKE_PORT??3090),seconds=Number(process.env.SNAKE_BOT_SECONDS??600),seed=Number(process.env.SNAKE_BOT_SEED??1)
if(!Number.isInteger(count)||count<1||count>64||!Number.isInteger(port)||port<1024||port>65535||!Number.isFinite(seconds)||seconds<1||seconds>3600||!Number.isSafeInteger(seed))throw new Error('Use 1–64 bots, local port, 1–3600 seconds and integer seed')
const host=resolveLocalHost(process.env.SNAKE_BOT_HOST??'127.0.0.1'),origin=`http://${host}:${port}`
const health=await fetch(origin+'/snake-arena/health',{signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw new Error('Arena health unavailable');return r.json()})
if(!['anonymous_local_practice','authenticated_and_guest_practice'].includes(health.mode))throw new Error('Use the local practice arena')
if(process.env.SNAKE_BOT_RESERVE_SLOTS==='2'&&(health.rooms>1||!Number.isInteger(health.maxPlayers)||health.ccu+count>health.maxPlayers-2))throw new Error('Need one practice room with two free human slots; no existing players will be removed')
const fleet=new BotFleet(`ws://${host}:${port}/snake-arena/socket`,origin,count,seed)
fleet.start();fleet.beginMeasurement();const started=performance.now()
console.log(`${count} bots identificados como Bot 1…Bot ${count}; simulación, no playtest humano. ${origin}/play/snake-arena. Duración ${seconds}s; Ctrl+C los retira.`)
let finishing=false
async function finish(){if(finishing)return;finishing=true;clearInterval(progress);clearTimeout(end);const report={kind:'simulated_websocket_clients',seconds:(performance.now()-started)/1000,seed,...fleet.report()};await fleet.close();console.log(JSON.stringify(report,null,2));if(process.env.SNAKE_BOT_REPORT)fs.writeFileSync(process.env.SNAKE_BOT_REPORT,JSON.stringify(report,null,2)+'\n');if(report.welcomed!==count||report.unexpectedCloses||report.parseErrors)process.exitCode=1}
const progress=setInterval(()=>{
  console.log(JSON.stringify({seconds:Math.round((performance.now()-started)/1000),welcomed:fleet.stats.welcomed,open:fleet.open,results:fleet.stats.results,errors:fleet.stats.errors,unexpectedCloses:fleet.stats.unexpectedCloses,closeCodes:fleet.stats.closeCodes}))
  if(fleet.stats.unexpectedCloses>0&&fleet.open===0)void finish()
},10000)
const end=setTimeout(()=>void finish(),seconds*1000)
process.on('SIGINT',()=>void finish());process.on('SIGTERM',()=>void finish())
