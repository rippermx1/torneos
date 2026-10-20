export type PracticeLeaderboard={players:number;entries:{name:string;score:number;position:number;isMe:boolean}[];mine:{participating:boolean;best:number;position:number|null}|null}
const whole=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max
export function readPracticeLeaderboard(value:unknown):PracticeLeaderboard|null{
  if(!value||typeof value!=='object')return null
  const p=value as PracticeLeaderboard
  if(!whole(p.players)||!Array.isArray(p.entries)||p.entries.length!==Math.min(p.players,20))return null
  let lastScore=Infinity,lastPosition=0
  for(const e of p.entries){
    if(!e||typeof e.name!=='string'||!e.name.trim()||e.name.length>20||/[<>\x00-\x1f]/.test(e.name)||!whole(e.score,1,10000000)||!whole(e.position,1,p.players)||typeof e.isMe!=='boolean'||e.score>lastScore||e.position<lastPosition)return null
    if(lastScore===e.score&&lastPosition!==e.position)return null
    lastScore=e.score;lastPosition=e.position
  }
  if(p.entries.filter(e=>e.isMe).length>1)return null
  if(p.mine!==null){
    const m=p.mine
    if(!m||typeof m.participating!=='boolean'||!whole(m.best,0,10000000)||(m.position!==null&&!whole(m.position,1,p.players))||(!m.participating&&m.position!==null))return null
    const row=p.entries.find(e=>e.isMe)
    if(row&&(!m.participating||row.position!==m.position||row.score!==m.best))return null
  }else if(p.entries.some(e=>e.isMe))return null
  return p
}
