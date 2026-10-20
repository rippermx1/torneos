import {mkdirSync,readdirSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs'
import {join} from 'node:path'
import {dailyProgress,dailyWindow,readDailyProgress,type DailyProgress} from './daily-missions.js'
import type {DailyContribution,PracticeStore} from './practice-store.js'
import type {Player} from './room.js'
type Entry={value:DailyContribution;revision:number;busy:boolean;retrying:boolean;next:number}
export class DailyPractice {
  private entries=new Map<string,Entry>()
  private rounds=new Map<string,{lights:number;stars:number;grew:boolean;day:string;counts:{lights:number;growth:number;stars:number}}>()
  private profiles=new Map<string,DailyProgress>()
  private reads=new Map<string,{busy:boolean;next:number;failed:boolean}>()
  constructor(private store:PracticeStore,private now:()=>number,private confirmed:(user:string,xp:number)=>void,private directory?:string){
    if(directory){mkdirSync(directory,{recursive:true});for(const file of readdirSync(directory))if(/^[0-9a-f-]{36}-\d{4}-\d{2}-\d{2}\.json$/.test(file)){
      const value=JSON.parse(readFileSync(join(directory,file),'utf8')) as DailyContribution
      if(file!==`${value.round_id}-${value.day}.json`||!/^[0-9a-f-]{36}$/.test(value.user_id)||['lights','growth','stars'].some(k=>!Number.isSafeInteger(value[k as keyof DailyContribution]))||value.lights<0||value.lights>30||value.growth<0||value.growth>1||value.stars<0||value.stars>2||dailyWindow(Date.parse(value.observed_at)).day!==value.day)throw new Error('Invalid daily outbox')
      this.entries.set(file.slice(0,-5),{value,revision:1,busy:false,retrying:false,next:0})
    }}
  }
  seed(user:string,progress:DailyProgress){
    if(!readDailyProgress(progress))throw new Error('Invalid daily profile')
    const old=this.profiles.get(user)
    if(old&&old.day>progress.day)return
    if(old?.day===progress.day)progress=dailyProgress(progress.serverNow,Object.fromEntries(progress.missions.map((m,i)=>[m.id,Math.max(m.value,old.missions[i].value)])) as {lights:number;growth:number;stars:number})
    this.profiles.set(user,progress)
  }
  progress(user:string){
    const current=this.profiles.get(user),window=dailyWindow(this.now()),pending=[...this.entries.values()].filter(e=>e.value.user_id===user)
    const fresh=current?.day===window.day
    return {daily:fresh?{...current!,...window}:dailyProgress(this.now()),dailyState:pending.some(e=>e.retrying)||this.reads.get(user)?.failed?'retrying':pending.length||!fresh?'saving':'saved'}
  }
  refresh(user:string){
    if(!this.store.daily||this.profiles.get(user)?.day===dailyWindow(this.now()).day)return
    const old=this.reads.get(user);if(old?.busy||(old&&old.next>this.now()))return
    this.reads.set(user,{busy:true,next:0,failed:false})
    void this.store.daily(user,this.now()).then(p=>{this.seed(user,p);this.reads.delete(user)}).catch(()=>this.reads.set(user,{busy:false,next:this.now()+2000,failed:true}))
  }
  forget(round:string){this.rounds.delete(round)}
  observe(round:string,user:string,p:Player){
    if(!this.store.saveDaily)return
    const now=this.now(),day=dailyWindow(now).day,old=this.rounds.get(round)??{lights:0,stars:0,grew:false,day,counts:{lights:0,growth:0,stars:0}}
    const counts=old.day===day?{...old.counts}:{lights:0,growth:0,stars:0}
    counts.lights=Math.min(30,counts.lights+Math.max(0,p.ordinaryPickups-old.lights));counts.stars=Math.min(2,counts.stars+Math.max(0,p.rarePickups-old.stars))
    if(p.maxSize>=24&&!old.grew)counts.growth=1
    this.rounds.set(round,{lights:p.ordinaryPickups,stars:p.rarePickups,grew:old.grew||p.maxSize>=24,day,counts})
    if(counts.lights===old.counts.lights&&counts.growth===old.counts.growth&&counts.stars===old.counts.stars&&old.day===day)return
    if(!counts.lights&&!counts.growth&&!counts.stars)return
    const value:DailyContribution={round_id:round,day,user_id:user,...counts,observed_at:new Date(now).toISOString()},id=`${round}-${day}`,entry=this.entries.get(id)
    if(this.directory){const file=join(this.directory,id+'.json');writeFileSync(file+'.tmp',JSON.stringify(value),{encoding:'utf8',mode:0o600});renameSync(file+'.tmp',file)}
    this.entries.set(id,{value,revision:(entry?.revision??0)+1,busy:entry?.busy??false,retrying:entry?.retrying??false,next:entry?.next??0})
  }
  flush(){
    for(const [id,entry] of this.entries){
      if(entry.busy||entry.next>this.now()||!this.store.saveDaily)continue;entry.busy=true
      const revision=entry.revision,value={...entry.value}
      void this.store.saveDaily(value).then(result=>{
        if(!Number.isSafeInteger(result.xp)||result.xp<0||result.xp>1_000_000_000)throw new Error('Invalid daily XP')
        this.seed(value.user_id,result.daily);this.confirmed(value.user_id,result.xp)
        const latest=this.entries.get(id)!
        if(latest.revision===revision){if(this.directory)unlinkSync(join(this.directory,id+'.json'));this.entries.delete(id)}
        else{latest.busy=false;latest.retrying=false;latest.next=this.now()+1000}
      }).catch(()=>{const latest=this.entries.get(id)!;latest.busy=false;latest.retrying=true;latest.next=this.now()+2000})
    }
  }
  get pendingCount(){return this.entries.size}
}
