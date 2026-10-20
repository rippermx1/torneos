import type {Config} from './config.js'
import {Grid,distanceSquared,type Point} from './grid.js'
import type {Appearance} from './cosmetics.js'
import {missionProgress} from './missions.js'
import {insideArena,sampleArena,clampArena} from './geometry.js'
export const RARE_RESOURCE={firstSeconds:4,intervalSeconds:20,lifetimeSeconds:12,mass:10,score:50} as const
export const LIGHT_RAIN={firstSeconds:8,intervalSeconds:45,lifetimeSeconds:15,clusters:3,perCluster:8,spread:2.2} as const
export const DEATH_ORBS={lifetimeSeconds:45,maxPerDeath:120,maxPerRoom:256} as const
export type Food=Point & {id:number;kind?:'rare'|'rain'|'death';expiresTick?:number}
export type Result={score:number;rank:number;kills:number;survivedSeconds:number;maxSize:number;personalBest:number;reason:string}
export type Player=Point & {id:string;name:string;appearance:Appearance;alive:boolean;angle:number;target:number;ack:number;mass:number;score:number;kills:number;body:Point[];born:number;maxSize:number;personalBest:number;rarePickups:number;ordinaryPickups:number;life:number;sessionXp:number;missionEarned:number;result:Result|null;boosting:boolean;wantsBoost:boolean;boostDebt:number;inputAt:number}
export type Log=(event:string,data:Record<string,unknown>)=>void
export const silent:Log=()=>{}
export function turn(angle:number,target:number,limit:number){const delta=Math.atan2(Math.sin(target-angle),Math.cos(target-angle));return angle+Math.max(-limit,Math.min(limit,delta))}
export class Room {
  players=new Map<string,Player>(); food:Food[]=[]; tick=0; time=0; private nextFood=0
  private nextRainTick:number; private rainEndsTick:number|null=null
  private nextRareTick:number
  constructor(public id:string,public config:Config,private random= Math.random,private log:Log=silent){this.nextRainTick=LIGHT_RAIN.firstSeconds*config.simulationHz;this.nextRareTick=RARE_RESOURCE.firstSeconds*config.simulationHz;this.refill()}
  private refill(){let ordinary=this.food.reduce((n,f)=>n+(f.kind?0:1),0);while(ordinary++<this.config.resourceCount)this.food.push({id:++this.nextFood,...sampleArena(this.config,this.random,3)})}
  private expireDeathOrbs(){this.food=this.food.filter(f=>f.kind!=='death'||this.tick<(f.expiresTick??0))}
  private dropDeathOrbs(p:Player){
    if(!this.config.deathOrbs||!p.body.length)return
    // Convert remaining mass, never score or peak size. Remainders are not minted.
    const count=Math.min(DEATH_ORBS.maxPerDeath,Math.floor(p.mass/this.config.growthRate)),expiresTick=this.tick+DEATH_ORBS.lifetimeSeconds*this.config.simulationHz
    let excess=this.food.filter(f=>f.kind==='death').length+count-DEATH_ORBS.maxPerRoom
    if(excess>0)this.food=this.food.filter(f=>f.kind!=='death'||excess--<=0)
    for(let i=0;i<count;i++){
      const point=p.body[Math.floor(i*(p.body.length-1)/Math.max(1,count-1))]
      this.food.push({id:++this.nextFood,...clampArena(this.config,point,this.config.radius+.4),kind:'death',expiresTick})
    }
    if(count)this.log('death_orbs_spawned',{room:this.id,player:p.id,orbs:count,mass:count*this.config.growthRate,expiresTick})
  }
  private updateRain(){
    if(!this.config.lightRain)return
    this.food=this.food.filter(f=>f.kind!=='rain'||this.tick<(f.expiresTick??0))
    if(this.rainEndsTick!==null&&this.tick>=this.rainEndsTick)this.rainEndsTick=null
    if(this.tick<this.nextRainTick||this.rainEndsTick!==null)return
    const live=[...this.players.values()].filter(p=>p.alive)
    if(!live.length)return
    const c=this.config,expiresTick=this.tick+LIGHT_RAIN.lifetimeSeconds*c.simulationHz
    let spawned=0
    for(let attempt=0;attempt<24&&spawned<LIGHT_RAIN.clusters;attempt++){
      const anchor=live[Math.min(live.length-1,Math.floor(this.random()*live.length))]
      const angle=this.random()*Math.PI*2,d=10+this.random()*6,center={x:anchor.x+Math.cos(angle)*d,y:anchor.y+Math.sin(angle)*d}
      const points=Array.from({length:LIGHT_RAIN.perCluster},(_,i)=>({x:center.x+Math.cos(i*Math.PI*2/LIGHT_RAIN.perCluster)*LIGHT_RAIN.spread,y:center.y+Math.sin(i*Math.PI*2/LIGHT_RAIN.perCluster)*LIGHT_RAIN.spread}))
      if(points.some(b=>!insideArena(c,b,5)||live.some(p=>p.body.some(a=>distanceSquared(a,b)<(c.radius*4)**2)))||this.food.some(f=>f.kind==='rain'&&distanceSquared(f,center)<(LIGHT_RAIN.spread*3)**2))continue
      for(const point of points)this.food.push({...point,id:++this.nextFood,kind:'rain',expiresTick})
      spawned++
    }
    if(spawned){this.rainEndsTick=expiresTick;this.nextRainTick=this.tick+LIGHT_RAIN.intervalSeconds*c.simulationHz;this.log('light_rain_started',{room:this.id,clusters:spawned,lights:spawned*LIGHT_RAIN.perCluster,endsTick:expiresTick})}
    else this.nextRainTick=this.tick+c.simulationHz
  }
  private updateRare(){
    if(!this.config.rareResources)return
    this.food=this.food.filter(f=>f.kind!=='rare'||this.tick<(f.expiresTick??0))
    if(this.tick<this.nextRareTick||this.food.some(f=>f.kind==='rare'))return
    const live=[...this.players.values()].filter(p=>p.alive)
    if(!live.length)return
    // Spawn in view of a living creature, clear of bodies and away from the boundary.
    for(let attempt=0;attempt<16;attempt++){
      const anchor=live[Math.min(live.length-1,Math.floor(this.random()*live.length))],angle=this.random()*Math.PI*2,d=8+this.random()*4
      const x=anchor.x+Math.cos(angle)*d,y=anchor.y+Math.sin(angle)*d
      if(!insideArena(this.config,{x,y},6)||live.some(p=>p.body.some(b=>distanceSquared({x,y},b)<(this.config.radius*4)**2)))continue
      this.food.push({id:++this.nextFood,x,y,kind:'rare',expiresTick:this.tick+RARE_RESOURCE.lifetimeSeconds*this.config.simulationHz})
      this.nextRareTick=this.tick+RARE_RESOURCE.intervalSeconds*this.config.simulationHz
      return
    }
    this.nextRareTick=this.tick+this.config.simulationHz
  }
  add(id:string,name:string,appearance:Appearance='aurora'){
    if(this.players.size>=this.config.maxPlayers) throw new Error('room_full')
    const p:Player={id,name,appearance,x:0,y:0,alive:false,angle:0,target:0,ack:-1,mass:0,score:0,kills:0,body:[],born:0,maxSize:0,personalBest:0,rarePickups:0,ordinaryPickups:0,life:0,sessionXp:0,missionEarned:0,result:null,boosting:false,wantsBoost:false,boostDebt:0,inputAt:-Infinity}
    this.players.set(id,p)
    if(!this.spawn(p)){this.players.delete(id);throw new Error('spawn_busy')}
    return p
  }
  private spawn(p:Player){
    const c=this.config
    for(let attempt=0;attempt<100;attempt++){
      const {x,y}=sampleArena(c,this.random,12)
      const candidate=Array.from({length:c.initialMass},(_,i)=>({x:x-i*c.radius,y}))
      if(candidate.some(b=>!insideArena(c,b,c.radius)))continue
      if([...this.players.values()].some(other=>other.id!==p.id && other.alive && other.body.some(b=>candidate.some(a=>distanceSquared(a,b)<(c.radius*4)**2)))) continue
      Object.assign(p,{x,y,alive:true,angle:0,target:0,mass:c.initialMass,score:0,kills:0,body:candidate,born:this.time,maxSize:c.initialMass,rarePickups:0,ordinaryPickups:0,life:p.life+1,missionEarned:0,result:null,boosting:false,wantsBoost:false,boostDebt:0,inputAt:-Infinity})
      this.log('match_started',{room:this.id,player:p.id});return true
    }
    return false
  }
  restart(id:string){const p=this.players.get(id);return !!p && !p.alive && this.spawn(p)}
  remove(id:string){this.players.delete(id)}
  input(id:string,seq:number,angle:number,boost=false){const p=this.players.get(id);if(!p?.alive || seq<=p.ack)return false;p.ack=seq;p.target=angle;p.wantsBoost=boost;p.inputAt=this.time;return true}
  leaderboard(){return [...this.players.values()].filter(p=>p.alive).sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id)).map((p,i)=>({id:p.id,name:p.name,score:p.score,rank:i+1}))}
  step(){
    const c=this.config,dt=1/c.simulationHz;this.tick++;this.time+=dt;this.expireDeathOrbs()
    const live=[...this.players.values()].filter(p=>p.alive)
    for(const p of live){
      p.boosting=p.wantsBoost && this.time-p.inputAt<=c.boostInputTimeout && p.mass>c.boostMinMass
      if(p.boosting){
        // Carry fractional debt across releases: tapping cannot avoid the mass cost.
        p.boostDebt+=c.boostMassPerSecond*dt
        const cost=Math.min(p.mass-c.boostMinMass,Math.floor(p.boostDebt+1e-9))
        p.mass-=cost;p.boostDebt=Math.max(0,p.boostDebt-cost);p.body.length=Math.min(p.body.length,p.mass)
        if(p.mass===c.boostMinMass)p.boosting=false
      }
      const speed=c.baseSpeed*(p.boosting?c.boostMultiplier:1)
      p.angle=turn(p.angle,p.target,c.turnSpeed*dt);p.x+=Math.cos(p.angle)*speed*dt;p.y+=Math.sin(p.angle)*speed*dt
      p.body[0]={x:p.x,y:p.y}
      // Segments follow at fixed spacing. The server owns both shape and head.
      for(let i=1;i<p.body.length;i++){
        const a=p.body[i-1],b=p.body[i],dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy)
        if(d>c.radius){b.x=a.x-dx*c.radius/d;b.y=a.y-dy*c.radius/d}
      }
    }
    const grid=new Grid<Point & {owner:string;head:boolean}>(c.radius*4)
    for(const p of live) p.body.forEach((b,i)=>grid.add({...b,owner:p.id,head:i===0}))
    const deaths=new Map<string,{reason:string;killer?:string}>()
    for(const p of live){
      if(!insideArena(c,p,c.radius)){deaths.set(p.id,{reason:'boundary'});continue}
      const hit=grid.near(p.x,p.y,c.radius*2).find(b=>b.owner!==p.id && distanceSquared(p,b)<(c.radius*1.65)**2)
      if(hit) deaths.set(p.id,{reason:hit.head?'head_collision':'body_collision',killer:hit.head?undefined:hit.owner})
    }
    // Resolve all deaths before scoring; simultaneous hits cannot depend on map order.
    for(const d of deaths.values()) if(d.killer && !deaths.has(d.killer)){const killer=this.players.get(d.killer)!;killer.kills++;killer.score+=25}
    const ranks=new Map(this.leaderboard().map(p=>[p.id,p.rank]))
    for(const [id,d] of deaths){
      const p=this.players.get(id)!;p.alive=false;p.boosting=false;p.wantsBoost=false;p.personalBest=Math.max(p.personalBest,p.score)
      this.dropDeathOrbs(p)
      p.result={score:p.score,rank:ranks.get(id)??live.length,kills:p.kills,survivedSeconds:Math.round((this.time-p.born)*10)/10,maxSize:p.maxSize,personalBest:p.personalBest,reason:d.reason}
      this.log('death',{room:this.id,player:id,...p.result});this.log('match_finished',{room:this.id,player:id,...p.result})
    }
    this.updateRare();this.updateRain()
    const foodGrid=new Grid<Food>(c.radius*4);for(const f of this.food)foodGrid.add(f)
    const consumed=new Set<number>()
    for(const p of live){
      if(!p.alive) continue
      for(const f of foodGrid.near(p.x,p.y,c.radius+0.4)){
        if(consumed.has(f.id) || distanceSquared(p,f)>(c.radius+0.4)**2)continue
        const rare=f.kind==='rare'&&c.rareResources===true
        consumed.add(f.id);p.score+=rare?RARE_RESOURCE.score:10;p.mass=Math.min(c.maxMass,p.mass+(rare?RARE_RESOURCE.mass:c.growthRate));p.maxSize=Math.max(p.maxSize,p.mass)
        if(rare){p.rarePickups++;this.log('rare_collected',{room:this.id,player:p.id,resource:f.id})}else p.ordinaryPickups++
        if(f.kind==='death')this.log('death_orb_collected',{room:this.id,player:p.id,resource:f.id})
        while(p.body.length<p.mass)p.body.push({...p.body[p.body.length-1]})
      }
    }
    if(c.practiceMissions)for(const p of live){
      if(!p.alive)continue
      const earned=missionProgress(p.life,p.sessionXp,p.ordinaryPickups,p.maxSize,p.rarePickups).earned
      p.sessionXp=Math.min(1_000_000_000,p.sessionXp+Math.max(0,earned-p.missionEarned));p.missionEarned=earned
    }
    this.food=this.food.filter(f=>!consumed.has(f.id));this.refill()
    if(this.rainEndsTick!==null&&!this.food.some(f=>f.kind==='rain'))this.rainEndsTick=null
  }
  snapshot(tickMs=0){return {v:1,type:'snapshot',tick:this.tick,...(this.config.lightRain?{lightRain:{nextSpawnTick:this.nextRainTick,endsTick:this.rainEndsTick,simulationHz:this.config.simulationHz,remaining:this.food.filter(f=>f.kind==='rain').length}}:{}),...(this.config.rareResources?{specialResource:{nextSpawnTick:this.nextRareTick,score:RARE_RESOURCE.score,mass:RARE_RESOURCE.mass,simulationHz:this.config.simulationHz}}:{}),players:[...this.players.values()].map(({target,born,result,maxSize,personalBest,wantsBoost,boostDebt,inputAt,ordinaryPickups,life,sessionXp,missionEarned,...p})=>({...p,...(this.config.practiceMissions?{practiceProgress:missionProgress(life,sessionXp,ordinaryPickups,maxSize,p.rarePickups)}:{})})),food:this.food,leaderboard:this.leaderboard(),metrics:{tickMs,entities:this.food.length+[...this.players.values()].reduce((n,p)=>n+(p.alive?p.body.length:0),0),ccu:this.players.size}}}
}
