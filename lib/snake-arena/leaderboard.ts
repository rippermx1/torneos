export type CompetitiveStats={points:number;wins:number;tournaments:number}
export type CompetitiveEntry=CompetitiveStats&{name:string;position:number;isMe:boolean}
export type CompetitiveBoard={rules:'snake-league-v1';players:number;entries:CompetitiveEntry[];mine:(CompetitiveStats&{participating:boolean;position:number|null})|null}
const whole=(n:unknown,min=0):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min
const keys=(value:object,allowed:string[])=>Object.keys(value).length===allowed.length&&Object.keys(value).every(k=>allowed.includes(k))
function stats(s:CompetitiveStats){return whole(s.points)&&whole(s.wins)&&whole(s.tournaments)&&s.wins<=s.tournaments&&s.points<=s.tournaments*100&&s.points>=s.wins*100}
export function readCompetitiveBoard(value:unknown):CompetitiveBoard|null{
  if(!value||typeof value!=='object')return null
  const b=value as CompetitiveBoard
  if(!keys(b,['rules','players','entries','mine'])||b.rules!=='snake-league-v1'||!whole(b.players)||!Array.isArray(b.entries)||b.entries.length!==Math.min(20,b.players))return null
  let last:CompetitiveEntry|undefined
  for(const [index,e] of b.entries.entries()){
    if(!e||!keys(e,['name','points','wins','tournaments','position','isMe'])||!stats(e)||e.tournaments===0||typeof e.name!=='string'||!e.name.trim()||e.name.length>20||/[<>\x00-\x1f]/.test(e.name)||typeof e.isMe!=='boolean'||!whole(e.position,1)||e.position>b.players)return null
    if(!last&&e.position!==1)return null
    if(last&&(e.points>last.points||e.points===last.points&&e.wins>last.wins||e.position<last.position))return null
    const tied=last&&e.points===last.points&&e.wins===last.wins
    if(last&&(tied?e.position!==last.position:e.position!==index+1))return null
    last=e
  }
  if(b.entries.filter(e=>e.isMe).length>1)return null
  const row=b.entries.find(e=>e.isMe),m=b.mine
  if(m===null){if(row)return null}else{
    if(!m||!keys(m,['points','wins','tournaments','position','participating'])||!stats(m)||typeof m.participating!=='boolean'||m.position!==null&&(!m.participating||m.tournaments===0||!whole(m.position,1)||m.position>b.players))return null
    if(m.participating&&m.tournaments>0&&m.position===null)return null
    if(row&&(!m.participating||row.position!==m.position||row.points!==m.points||row.wins!==m.wins||row.tournaments!==m.tournaments))return null
    if(m.position!==null&&m.position<=b.entries.length&&!row&&(!last||last.position!==m.position||last.points!==m.points||last.wins!==m.wins))return null
  }
  return b
}
