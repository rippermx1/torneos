import {randomUUID} from 'node:crypto'
import {mkdirSync,readdirSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs'
import {join} from 'node:path'
import type {Room,Result,Log} from './room.js'
import {verifyPracticeTicket,type PracticeTicket} from './practice-ticket.js'
import {practiceRun,type PracticeStore,type PracticeRun,type PracticeReward} from './practice-store.js'
import {missionProgress,PRACTICE_MISSIONS} from './missions.js'
import {DailyPractice} from './daily-practice.js'
import type {DailyProgress} from './daily-missions.js'
export type SaveState='none'|'saving'|'saved'|'retrying'
export type PracticeSession={userId:string;playerId:string;room:Room;roundId:string;leaseUntil:number;detachedUntil:number|null;recorded:boolean;saveState:SaveState;best:number;accountXp:number;rewarded:Set<string>}
export class PracticeSessions {
  readonly sessions=new Map<string,PracticeSession>()
  readonly daily:DailyPractice
  private rewards=new Map<string,{reward:PracticeReward;next:number;busy:boolean;retrying:boolean}>()
  private used=new Map<string,number>();private pending=new Map<string,{run:PracticeRun;session?:PracticeSession;roundId:string;next:number;busy:boolean}>()
  constructor(readonly secret:string,readonly store:PracticeStore,readonly now:()=>number=Date.now,readonly log:Log=()=>{},readonly graceMs=15000,readonly outbox?:string){
    this.daily=new DailyPractice(store,now,(user,xp)=>{const current=this.sessions.get(user);if(current)current.accountXp=Math.max(current.accountXp,xp)},outbox?join(outbox,'daily'):undefined)
    if(outbox){mkdirSync(outbox,{recursive:true});for(const file of readdirSync(outbox))if(/^[0-9a-f-]{36}\.json$/.test(file)){
      const run=JSON.parse(readFileSync(join(outbox,file),'utf8')) as PracticeRun
      if(file!==run.id+'.json'||!/^[0-9a-f-]{36}$/.test(run.user_id)||!Number.isFinite(run.score))throw new Error('Invalid practice outbox')
      this.pending.set(run.id,{run,roundId:run.id,next:0,busy:false})
    }
      const directory=join(outbox,'rewards');mkdirSync(directory,{recursive:true})
      for(const file of readdirSync(directory))if(/^[0-9a-f-]{36}-(gather|grow|star)\.json$/.test(file)){
        const reward=JSON.parse(readFileSync(join(directory,file),'utf8')) as PracticeReward
        if(file!==`${reward.round_id}-${reward.mission_id}.json`||!/^[0-9a-f-]{36}$/.test(reward.user_id)||!PRACTICE_MISSIONS.some(m=>m.id===reward.mission_id&&m.xp===reward.xp)||!Number.isFinite(Date.parse(reward.earned_at)))throw new Error('Invalid reward outbox')
        this.rewards.set(file.slice(0,-5),{reward,next:0,busy:false,retrying:false})
      }
    }
  }
  consume(value:unknown,origin:string){
    const ticket=verifyPracticeTicket(value,this.secret,origin,this.now());if(!ticket||this.used.has(ticket.nonce)||this.used.size>=8192)return null
    this.used.set(ticket.nonce,ticket.expiresAt);return ticket
  }
  async best(userId:string){return this.store.best(userId)}
  async xp(userId:string){return this.store.xp?this.store.xp(userId):0}
  async dailyProfile(userId:string){return this.store.daily?this.store.daily(userId,this.now()):undefined}
  progress(s:PracticeSession){
    const pending=[...this.rewards.values()].filter(e=>e.reward.user_id===s.userId)
    return {accountXp:s.accountXp,xpState:pending.some(e=>e.retrying)?'retrying':pending.length?'saving':'saved',pendingXp:pending.reduce((sum,e)=>sum+e.reward.xp,0),...(this.store.daily?this.daily.progress(s.userId):{})}
  }
  get(userId:string){return this.sessions.get(userId)}
  attach(ticket:PracticeTicket,room:Room,playerId:string,best:number,accountXp=0,daily?:DailyProgress){
    if(daily)this.daily.seed(ticket.userId,daily)
    const s:PracticeSession={userId:ticket.userId,playerId,room,roundId:randomUUID(),leaseUntil:ticket.leaseUntil,detachedUntil:null,recorded:false,saveState:'none',best,accountXp,rewarded:new Set()}
    this.sessions.set(s.userId,s);return s
  }
  resume(s:PracticeSession,ticket:PracticeTicket){s.detachedUntil=null;s.leaseUntil=ticket.leaseUntil}
  detach(s:PracticeSession){
    s.detachedUntil=this.now()+this.graceMs
    const p=s.room.players.get(s.playerId);if(p){p.wantsBoost=false;p.boosting=false;p.inputAt=-Infinity;p.target=p.angle}
  }
  restart(s:PracticeSession){this.daily.forget(s.roundId);s.roundId=randomUUID();s.recorded=false;s.saveState='none';s.rewarded.clear()}
  private collect(s:PracticeSession){
    const p=s.room.players.get(s.playerId)
    if(!p||!s.room.config.practiceMissions||!this.store.saveReward)return
    for(const mission of missionProgress(p.life,p.sessionXp,p.ordinaryPickups,p.maxSize,p.rarePickups).missions){
      if(!mission.complete||s.rewarded.has(mission.id))continue
      const reward:PracticeReward={round_id:s.roundId,mission_id:mission.id,user_id:s.userId,xp:mission.xp,earned_at:new Date(this.now()).toISOString()},id=`${s.roundId}-${mission.id}`
      if(this.outbox){const file=join(this.outbox,'rewards',id+'.json');writeFileSync(file+'.tmp',JSON.stringify(reward),{encoding:'utf8',mode:0o600});renameSync(file+'.tmp',file)}
      this.rewards.set(id,{reward,next:0,busy:false,retrying:false});s.rewarded.add(mission.id)
    }
  }
  private record(s:PracticeSession,result:Result){
    if(s.recorded)return
    const run=practiceRun(s.roundId,s.userId,result,this.now())
    if(this.outbox){const file=join(this.outbox,s.roundId+'.json');writeFileSync(file+'.tmp',JSON.stringify(run),{encoding:'utf8',mode:0o600});renameSync(file+'.tmp',file)}
    s.recorded=true;s.saveState='saving';s.best=Math.max(s.best,result.score)
    this.pending.set(s.roundId,{run,session:s,roundId:s.roundId,next:0,busy:false})
  }
  canStart(){return this.pending.size<256&&this.rewards.size<768&&this.daily.pendingCount<768}
  tick(remove:(s:PracticeSession)=>void){
    const now=this.now();for(const [nonce,expires] of this.used)if(expires<=now)this.used.delete(nonce)
    for(const s of this.sessions.values()){
      this.collect(s)
      const p=s.room.players.get(s.playerId)
      if(s.room.config.practiceMissions){this.daily.refresh(s.userId);if(p)this.daily.observe(s.roundId,s.userId,p)}
      if(p?.result)this.record(s,p.result)
      if((s.detachedUntil!==null&&s.detachedUntil<=now)||s.leaseUntil<=now){
        if(p?.alive){const result:Result={score:p.score,rank:s.room.leaderboard().find(r=>r.id===p.id)?.rank??1,kills:p.kills,survivedSeconds:Math.round((s.room.time-p.born)*10)/10,maxSize:p.maxSize,personalBest:Math.max(p.personalBest,p.score),reason:'disconnect'};this.record(s,result)}
        this.sessions.delete(s.userId);this.daily.forget(s.roundId);remove(s)
      }
    }
    this.flush()
  }
  flush(){
    this.daily.flush()
    for(const [id,entry] of this.rewards){
      if(entry.busy||entry.next>this.now()||!this.store.saveReward)continue;entry.busy=true
      void this.store.saveReward(entry.reward).then(xp=>{
        if(!Number.isSafeInteger(xp)||xp<0||xp>1_000_000_000)throw new Error('Invalid confirmed XP')
        if(this.outbox)unlinkSync(join(this.outbox,'rewards',id+'.json'))
        this.rewards.delete(id)
        const current=this.sessions.get(entry.reward.user_id);if(current)current.accountXp=Math.max(current.accountXp,xp)
        this.log('practice_reward_saved',{round:entry.reward.round_id,mission:entry.reward.mission_id})
      }).catch(()=>{entry.busy=false;entry.retrying=true;entry.next=this.now()+2000;this.log('practice_reward_retry',{round:entry.reward.round_id,mission:entry.reward.mission_id})})
    }
    for(const entry of this.pending.values()){
      if(entry.busy||entry.next>this.now())continue;entry.busy=true
      void this.store.save(entry.run).then(()=>{
        if(this.outbox)unlinkSync(join(this.outbox,entry.roundId+'.json'))
        this.pending.delete(entry.roundId);if(entry.session?.roundId===entry.roundId)entry.session.saveState='saved'
        this.log('practice_saved',{round:entry.roundId})
      }).catch(()=>{
        entry.busy=false;entry.next=this.now()+2000;if(entry.session?.roundId===entry.roundId)entry.session.saveState='retrying'
        this.log('practice_save_retry',{round:entry.roundId})
      })
    }
  }
  get pendingCount(){return this.pending.size}
  finish(){for(const s of this.sessions.values()){s.detachedUntil=this.now()}this.tick(()=>{})}
}
