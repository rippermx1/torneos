import {dailyDay} from './snake-daily-missions'
import {readPracticeLeaderboard,type PracticeLeaderboard} from './snake-practice-leaderboard'
export type LeaderboardScope='historical'|'current'|'previous'
export type PracticeSeason={day:string;startsAt:string;endsAt:string;serverNow:number;period:'current'|'previous'}
export type SeasonLeaderboard=PracticeLeaderboard&{season:PracticeSeason}
function shift(day:string,days:number){return new Date(Date.parse(day+'T00:00:00Z')+days*86400000).toISOString().slice(0,10)}
function midnight(day:string){
  let low=Date.parse(day+'T00:00:00Z')-86400000,high=low+3*86400000
  while(high-low>1){const mid=Math.floor((low+high)/2);if(dailyDay(mid)<day)low=mid;else high=mid}
  return high
}
export function practiceWeek(now:number,previous=false):PracticeSeason{
  const local=dailyDay(now),weekday=new Date(local+'T00:00:00Z').getUTCDay()
  const day=shift(local,-((weekday+6)%7)-(previous?7:0))
  return {day,startsAt:new Date(midnight(day)).toISOString(),endsAt:new Date(midnight(shift(day,7))).toISOString(),serverNow:now,period:previous?'previous':'current'}
}
export function readSeasonLeaderboard(value:unknown):SeasonLeaderboard|null{
  const board=readPracticeLeaderboard(value);if(!board)return null
  const s=(value as SeasonLeaderboard).season
  if(!s||!Number.isSafeInteger(s.serverNow)||s.serverNow<0||!['current','previous'].includes(s.period)||typeof s.day!=='string'||typeof s.startsAt!=='string'||typeof s.endsAt!=='string')return null
  let expected:PracticeSeason
  try{expected=practiceWeek(s.serverNow,s.period==='previous')}catch{return null}
  if(s.day!==expected.day||Date.parse(s.startsAt)!==Date.parse(expected.startsAt)||Date.parse(s.endsAt)!==Date.parse(expected.endsAt))return null
  return value as SeasonLeaderboard
}
export function seasonLabel(s:PracticeSeason){
  const date=new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',day:'numeric',month:'short'})
  return `${date.format(Date.parse(s.startsAt))} – ${date.format(Date.parse(s.endsAt)-1)}`
}
