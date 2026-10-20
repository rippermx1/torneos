export const DAILY_TIME_ZONE='America/Santiago'
export const DAILY_MISSIONS=[
  {id:'lights',label:'Recoge 30 luces',target:30,xp:60},
  {id:'growth',label:'Completa tamaño 24 en 3 partidas',target:3,xp:75},
  {id:'stars',label:'Consigue 2 núcleos',target:2,xp:100},
] as const
export type DailyProgress={day:string;resetsAt:string;serverNow:number;earned:number;missions:{id:string;value:number;target:number;xp:number;complete:boolean}[]}
const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:DAILY_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'})
export function dailyDay(now:number){const parts=dateFormat.formatToParts(now),value=(type:string)=>parts.find(p=>p.type===type)!.value;return `${value('year')}-${value('month')}-${value('day')}`}
let cached:{start:number;end:number;day:string}|undefined
export function dailyWindow(now:number){
  if(!cached||now<cached.start||now>=cached.end){
    const day=dailyDay(now);let low=Math.floor(now),high=low+36*60*60*1000
    while(high-low>1){const middle=Math.floor((low+high)/2);if(dailyDay(middle)===day)low=middle;else high=middle}
    cached={start:now,end:high,day}
  }
  return {day:cached.day,resetsAt:new Date(cached.end).toISOString(),serverNow:now}
}
export function dailyProgress(now:number,counts:{lights:number;growth:number;stars:number}={lights:0,growth:0,stars:0}):DailyProgress{
  const missions=DAILY_MISSIONS.map(m=>({...m,value:Math.min(m.target,counts[m.id]),complete:counts[m.id]>=m.target}))
  return {...dailyWindow(now),missions,earned:missions.reduce((n,m)=>n+(m.complete?m.xp:0),0)}
}
export function readDailyProgress(value:unknown):DailyProgress|null{
  if(!value||typeof value!=='object')return null
  const p=value as DailyProgress
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.day)||!Number.isSafeInteger(p.serverNow)||!Number.isFinite(Date.parse(p.resetsAt))||Date.parse(p.resetsAt)<=p.serverNow||Date.parse(p.resetsAt)-p.serverNow>36*3600000||!Array.isArray(p.missions)||p.missions.length!==3)return null
  if(dailyDay(p.serverNow)!==p.day||dailyWindow(p.serverNow).resetsAt!==p.resetsAt)return null
  if(p.missions.some((m,i)=>!m||m.id!==DAILY_MISSIONS[i].id||m.target!==DAILY_MISSIONS[i].target||m.xp!==DAILY_MISSIONS[i].xp||!Number.isSafeInteger(m.value)||m.value<0||m.value>m.target||m.complete!==(m.value===m.target)))return null
  return p.earned===p.missions.reduce((n,m)=>n+(m.complete?m.xp:0),0)?p:null
}
export function dailyCelebration(previous:DailyProgress|null,next:DailyProgress){
  if(!previous||previous.day!==next.day)return ''
  const completed=next.missions.filter((m,i)=>m.complete&&!previous.missions[i].complete)
  return completed.length?`Diaria completada · ${completed.map(m=>DAILY_MISSIONS.find(d=>d.id===m.id)!.label).join(' · ')} · +${completed.reduce((n,m)=>n+m.xp,0)} XP guardada`:''
}
