import WebSocket from 'ws'
import {performance} from 'node:perf_hooks'
import type {Config} from './config.js'
import type {Food,Player} from './room.js'
import {edgeDistance} from './geometry.js'
export type BotWorld={players:Player[];food:Food[];tick:number}
export function botDirection(me:Player,world:BotWorld,c:Config,bias=0){
  // Uses observed snapshots only; never sends positions, mass or scores.
  let goal=me.angle,best=Infinity
  for(const food of world.food){const dx=food.x-me.x,dy=food.y-me.y,d=dx*dx+dy*dy,a=Math.atan2(dy,dx),turn=Math.abs(Math.atan2(Math.sin(a-me.angle),Math.cos(a-me.angle))),cost=d*(1+turn*.4)/(food.kind==='rare'?5:1);if(cost<best){best=cost;goal=a}}
  const threats=world.players.filter(p=>p.alive&&p.id!==me.id).flatMap(p=>p.body.filter(b=>(b.x-me.x)**2+(b.y-me.y)**2<225))
  let selected=me.angle,lowest=Infinity
  for(const offset of [-1.5,-1,-.5,0,.5,1,1.5]){
    const angle=me.angle+offset,delta=Math.abs(Math.atan2(Math.sin(angle-goal),Math.cos(angle-goal)))
    let cost=delta+Math.abs(offset)*.08+bias*Math.sin(angle)*.01
    for(const seconds of [.4,.8,1.2]){
      const x=me.x+Math.cos(angle)*c.baseSpeed*seconds,y=me.y+Math.sin(angle)*c.baseSpeed*seconds,edge=edgeDistance(c,{x,y})
      if(edge<6)cost+=(6-edge)**2*3
      for(const b of threats){const d=Math.hypot(x-b.x,y-b.y);if(d<4)cost+=(4-d)**2*8}
    }
    if(cost<lowest){lowest=cost;selected=angle}
  }
  return Math.atan2(Math.sin(selected),Math.cos(selected))
}
export function botBoost(me:Player,world:BotWorld,c:Config,angle:number){
  if(me.mass<=c.boostMinMass+2)return false
  const speed=c.baseSpeed*c.boostMultiplier,x=me.x+Math.cos(angle)*speed,y=me.y+Math.sin(angle)*speed
  if(edgeDistance(c,{x,y})<8)return false
  if(world.players.some(p=>p.alive&&p.id!==me.id&&p.body.some(b=>(b.x-x)**2+(b.y-y)**2<64)))return false
  return world.food.some(f=>(f.x-me.x)**2+(f.y-me.y)**2>36 && (f.x-x)**2+(f.y-y)**2<36)
}
// Bounded histogram; percentile is the upper edge of a 1 ms bucket.
export class TimingHistogram {
  private bins=new Uint32Array(5001);count=0;sum=0;min=Infinity;max=0;overflow=0
  add(ms:number){if(!Number.isFinite(ms)||ms<0)return;this.count++;this.sum+=ms;this.min=Math.min(this.min,ms);this.max=Math.max(this.max,ms);if(ms>5000)this.overflow++;this.bins[Math.min(5000,Math.ceil(ms))]++}
  report(){let n=0,p95:number|null=null;const p95Overflow=this.count>0&&Math.ceil(this.count*.95)>this.count-this.overflow;for(let i=0;i<this.bins.length;i++){n+=this.bins[i];if(this.count&&n>=Math.ceil(this.count*.95)){p95=p95Overflow?null:i;break}}return {samples:this.count,meanMs:this.count?this.sum/this.count:null,minMs:this.count?this.min:null,maxMs:this.count?this.max:null,p95UpperBucketMs:p95,p95Overflow,bucketMs:1,overflowAbove5000Ms:this.overflow}}
}
export class BotFleet {
  private clients:WebSocket[]=[];private timer:ReturnType<typeof setInterval>|undefined;private stopped=false;private measuring=false
  readonly stats={welcomed:0,snapshots:0,receivedBytes:0,sentBytes:0,inputs:0,boostInputs:0,boostSnapshots:0,results:0,restarts:0,errors:0,unexpectedCloses:0,parseErrors:0,acknowledgedInputs:0,maxSnapshotBytes:0,maxMass:0,confirmedOrdinaryPickups:0,confirmedRarePickups:0,rooms:new Set<string>(),codes:{} as Record<string,number>,closeCodes:{} as Record<string,number>}
  readonly gaps=new TimingHistogram();readonly rtt=new TimingHistogram()
  constructor(readonly url:string,readonly origin:string,readonly count:number,readonly seed=1){}
  start(){
    const states=Array.from({length:this.count},(_,i)=>({id:'',world:null as BotWorld|null,config:null as Config|null,seq:0,lastAck:-1,lastSnapshot:0,measuredSnapshot:false,nextJoin:0,nextRestart:0,pingAt:0,nonce:0,pendingPing:0,bias:Math.sin(i+this.seed)}))
    this.clients=states.map((s,i)=>{
      const ws=new WebSocket(this.url,{origin:this.origin})
      const send=(data:unknown)=>{if(ws.readyState!==WebSocket.OPEN)return;const text=JSON.stringify(data);ws.send(text);if(this.measuring)this.stats.sentBytes+=Buffer.byteLength(text)}
      ws.on('open',()=>{send({v:1,type:'join',name:`Bot ${i+1}`,appearance:(['aurora','nebula','solar'] as const)[i%3]});s.nextJoin=performance.now()+1000})
      ws.on('message',raw=>{
        const now=performance.now();if(this.measuring)this.stats.receivedBytes+=Buffer.byteLength(raw.toString())
        let m:Record<string,unknown>;try{m=JSON.parse(raw.toString());if(!m||m.v!==1)throw new Error('Invalid version')}catch{this.stats.parseErrors++;return}
        if(m.type==='welcome'){s.id=m.id as string;s.config=m.config as Config;this.stats.rooms.add(m.room as string);this.stats.welcomed++}
        if(m.type==='snapshot'){
          const prior=s.world?.players.find(p=>p.id===s.id)
          s.world=m as unknown as BotWorld;const me=s.world.players.find(p=>p.id===s.id)
          if(this.measuring&&me?.alive){
            this.stats.maxMass=Math.max(this.stats.maxMass,me.mass)
            const continuing=prior?.alive&&me.score>=prior.score&&me.kills>=prior.kills&&me.rarePickups>=prior.rarePickups
            const rare=me.rarePickups-(continuing?prior.rarePickups:0)
            const foodScore=me.score-(continuing?prior.score:0)-25*(me.kills-(continuing?prior.kills:0))-50*rare
            if(foodScore>=0&&foodScore%10===0)this.stats.confirmedOrdinaryPickups+=foodScore/10
            this.stats.confirmedRarePickups+=Math.max(0,rare)
          }
          if(this.measuring){if(me?.boosting)this.stats.boostSnapshots++;this.stats.snapshots++;this.stats.maxSnapshotBytes=Math.max(this.stats.maxSnapshotBytes,Buffer.byteLength(raw.toString()));if(s.measuredSnapshot)this.gaps.add(now-s.lastSnapshot);s.measuredSnapshot=true;if(me&&me.ack>s.lastAck)this.stats.acknowledgedInputs+=me.ack-s.lastAck}
          if(me)s.lastAck=me.ack
          s.lastSnapshot=now
        }
        if(m.type==='result'){if(this.measuring)this.stats.results++;s.nextRestart=now+750}
        if(m.type==='pong'&&m.nonce===s.nonce&&s.pendingPing){if(this.measuring)this.rtt.add(now-s.pendingPing);s.pendingPing=0}
        if(m.type==='error'){const code=String(m.code);if(this.measuring){this.stats.errors++;this.stats.codes[code]=(this.stats.codes[code]??0)+1}if(code==='spawn_busy')s.nextJoin=now+1000;if(code==='restart_unavailable')s.nextRestart=now+1000}
      })
      ws.on('error',()=>{if(!this.stopped)this.stats.errors++})
      ws.on('close',(code,reason)=>{if(!this.stopped){this.stats.unexpectedCloses++;const key=code+':'+reason.toString().slice(0,120);this.stats.closeCodes[key]=(this.stats.closeCodes[key]??0)+1}})
      return ws
    })
    this.timer=setInterval(()=>{
      const now=performance.now()
      states.forEach((s,i)=>{
        const ws=this.clients[i];if(ws.readyState!==WebSocket.OPEN)return
        const send=(data:unknown)=>{const text=JSON.stringify(data);ws.send(text);if(this.measuring)this.stats.sentBytes+=Buffer.byteLength(text)}
        if(!s.id){if(now>=s.nextJoin){send({v:1,type:'join',name:`Bot ${i+1}`,appearance:(['aurora','nebula','solar'] as const)[i%3]});s.nextJoin=now+1000}return}
        if(now-s.pingAt>=2000){s.pingAt=now;s.pendingPing=now;s.nonce++;send({v:1,type:'ping',nonce:s.nonce})}
        const me=s.world?.players.find(p=>p.id===s.id)
        if(me?.alive&&s.config&&s.world){const angle=botDirection(me,s.world,s.config,s.bias),boost=botBoost(me,s.world,s.config,angle);send({v:1,type:'input',seq:s.seq++,angle,boost});if(this.measuring){this.stats.inputs++;if(boost)this.stats.boostInputs++}}
        else if(me&&!me.alive&&now>=s.nextRestart){send({v:1,type:'restart'});s.nextRestart=now+1000;if(this.measuring)this.stats.restarts++}
      })
    },100)
  }
  beginMeasurement(){this.measuring=true}
  get open(){return this.clients.filter(c=>c.readyState===WebSocket.OPEN).length}
  report(){return {...this.stats,rooms:[...this.stats.rooms],open:this.open,snapshotGap:this.gaps.report(),rtt:this.rtt.report()}}
  async close(){this.stopped=true;clearInterval(this.timer);await Promise.all(this.clients.map(ws=>new Promise<void>(resolve=>{if(ws.readyState===WebSocket.CLOSED){resolve();return}const timeout=setTimeout(()=>{ws.terminate();resolve()},1000);ws.once('close',()=>{clearTimeout(timeout);resolve()});ws.close()})))}
}
