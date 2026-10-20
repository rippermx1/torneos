import {Room,type Player} from './room.js'
import type {Config} from './config.js'
// Versioned rules are independent of mutable practice configuration.
export const FREE_RULES:Config=Object.freeze({maxPlayers:16,maxRooms:8,width:100,height:100,resourceCount:240,baseSpeed:7,turnSpeed:4,growthRate:2,radius:0.65,initialMass:12,maxMass:120,simulationHz:25,snapshotHz:10,boostMultiplier:1.6,boostMassPerSecond:2,boostMinMass:8,boostInputTimeout:.35,respawnPolicy:'manual'})
export type MatchDefinition={id:string;startsAt:string;duration:number;maxPlayers:number;roster:{id:string;name:string}[]}
export type FinalRow={id:string;score:number;kills:number;survived_ms:number;reason:string}
export class TournamentMatch {
  readonly room:Room
  readonly starts:number
  readonly ends:number
  readonly connected=new Set<string>()
  readonly disconnected=new Map<string,number>()
  readonly ended=new Map<string,FinalRow>()
  state:'countdown'|'live'|'finalizing'|'completed'|'cancelled'='countdown'
  constructor(readonly definition:MatchDefinition,random=Math.random){
    this.starts=Date.parse(definition.startsAt);this.ends=this.starts+definition.duration*1000
    this.room=new Room(definition.id,Object.freeze({...FREE_RULES,maxPlayers:definition.maxPlayers}),random)
    for(const player of definition.roster)this.room.add(player.id,player.name)
  }
  connect(id:string){
    if(!this.room.players.has(id)||this.connected.has(id)||['completed','cancelled','finalizing'].includes(this.state))return false
    this.connected.add(id);this.disconnected.delete(id)
    // Each transport has its own sequence; no life, position or score is reset.
    this.room.players.get(id)!.ack=-1
    return true
  }
  disconnect(id:string,now:number){this.connected.delete(id);if(this.state==='live')this.disconnected.set(id,now)}
  private eliminate(p:Player,reason:string,now:number){
    if(this.ended.has(p.id))return
    this.ended.set(p.id,{id:p.id,score:p.score,kills:p.kills,survived_ms:Math.max(0,Math.min(this.definition.duration*1000,Math.floor(now-this.starts))),reason})
    p.alive=false;p.boosting=false;p.wantsBoost=false
  }
  input(id:string,seq:number,angle:number,boost:boolean){return this.state==='live'&&this.room.input(id,seq,angle,boost)}
  tick(now:number){
    if(this.state==='countdown'&&now>=this.starts){
      this.state='live';for(const p of this.room.players.values())if(!this.connected.has(p.id))this.eliminate(p,'no_show',this.starts)
    }
    if(this.state!=='live')return
    // The fixed deadline wins over queued inputs/ticks after event-loop delays.
    if(now>=this.ends){for(const p of this.room.players.values())this.eliminate(p,'timeout',this.ends);this.state='finalizing';return}
    for(const [id,at] of this.disconnected)if(now-at>=10000)this.eliminate(this.room.players.get(id)!,'disconnect',at+10000)
    this.room.step()
    for(const p of this.room.players.values())if(p.result&&!this.ended.has(p.id))this.eliminate(p,({boundary:'wall',head_collision:'head',body_collision:'body'} as Record<string,string>)[p.result.reason]??'body',now)
  }
  rows(){return [...this.ended.values()].sort((a,b)=>b.score-a.score||b.survived_ms-a.survived_ms||b.kills-a.kills||a.id.localeCompare(b.id))}
  snapshot(now:number){return {...this.room.snapshot(),leaderboard:[...this.room.players.values()].sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).map((p,i)=>({id:p.id,name:p.name,score:p.score,rank:i+1})),competition:{id:this.definition.id,state:this.state,startsAt:this.starts,endsAt:this.ends,serverNow:now,rulesVersion:'snake-free-v1'}}}
}
