import type {Result} from './room.js'
import {dailyProgress,dailyWindow,type DailyProgress} from './daily-missions.js'
export type DailyContribution={round_id:string;day:string;user_id:string;lights:number;growth:number;stars:number;observed_at:string}
export type PracticeRun={id:string;user_id:string;score:number;rank:number;kills:number;survived_seconds:number;max_size:number;reason:string;ended_at:string}
export type PracticeReward={round_id:string;mission_id:string;user_id:string;xp:number;earned_at:string}
export interface PracticeStore {best(userId:string):Promise<number>;save(run:PracticeRun):Promise<void>;xp?(userId:string):Promise<number>;saveReward?(reward:PracticeReward):Promise<number>;daily?(userId:string,now?:number):Promise<DailyProgress>;saveDaily?(value:DailyContribution):Promise<{xp:number;daily:DailyProgress}>}
export function restPracticeStore(url:string,key:string):PracticeStore{
  if(!url||!key)throw new Error('Practice persistence requires server credentials')
  const base=url.replace(/\/$/,'')+'/rest/v1/snake_practice_runs'
  async function request(path:string,run?:PracticeRun){
    const response=await fetch(base+path,{method:run?'POST':'GET',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=representation'},body:run?JSON.stringify(run):undefined,signal:AbortSignal.timeout(4000)})
    if(!response.ok)throw new Error('practice_store_unavailable')
    return await response.json() as PracticeRun[]
  }
  const rewards=url.replace(/\/$/,'')+'/rest/v1/'
  async function rewardRequest(path:string,reward?:PracticeReward|DailyContribution,merge=false){
    const response=await fetch(rewards+path,{method:reward?'POST':'GET',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:`resolution=${merge?'merge':'ignore'}-duplicates,return=representation`},body:reward?JSON.stringify(reward):undefined,signal:AbortSignal.timeout(4000)})
    if(!response.ok)throw new Error('practice_xp_unavailable')
    return await response.json()
  }
  async function xp(userId:string){
    const rows=await rewardRequest(`snake_practice_progress?user_id=eq.${encodeURIComponent(userId)}&select=xp`)
    const value=rows[0]?.xp??0
    if(!Number.isSafeInteger(value)||value<0||value>1_000_000_000)throw new Error('practice_xp_unconfirmed')
    return value as number
  }
  async function daily(userId:string,now=Date.now()){
    const rows=await rewardRequest(`snake_practice_daily_progress?user_id=eq.${encodeURIComponent(userId)}&day=eq.${dailyWindow(now).day}&select=lights,growth,stars`)
    const counts=rows[0]??{lights:0,growth:0,stars:0}
    if(['lights','growth','stars'].some(k=>!Number.isSafeInteger(counts[k])||counts[k]<0))throw new Error('daily_progress_unconfirmed')
    return dailyProgress(now,counts)
  }
  return {
    daily,
    saveDaily:async value=>{
      await rewardRequest('snake_practice_daily_contributions?on_conflict=round_id,day',value,true)
      const rows=await rewardRequest(`snake_practice_daily_contributions?round_id=eq.${value.round_id}&day=eq.${value.day}`)
      if(rows.length!==1||rows[0].user_id!==value.user_id||['lights','growth','stars'].some(k=>rows[0][k]<value[k as keyof DailyContribution]))throw new Error('daily_save_unconfirmed')
      const [total,progress]=await Promise.all([xp(value.user_id),daily(value.user_id)])
      return {xp:total,daily:progress}
    },
    xp,
    saveReward:async reward=>{
      await rewardRequest('snake_practice_rewards?on_conflict=round_id,mission_id',reward)
      const rows=await rewardRequest(`snake_practice_rewards?round_id=eq.${encodeURIComponent(reward.round_id)}&mission_id=eq.${encodeURIComponent(reward.mission_id)}`)
      if(rows.length!==1||['round_id','mission_id','user_id','xp'].some(k=>rows[0][k]!==reward[k as keyof PracticeReward]))throw new Error('practice_reward_unconfirmed')
      return xp(reward.user_id)
    },
    best:async userId=>{const rows=await request(`?user_id=eq.${encodeURIComponent(userId)}&select=score&order=score.desc&limit=1`);return rows[0]?.score??0},
    save:async run=>{
      await request('?on_conflict=id',run)
      // Confirm ambiguous retries against the immutable row; POST success alone is insufficient.
      const rows=await request(`?id=eq.${encodeURIComponent(run.id)}&user_id=eq.${encodeURIComponent(run.user_id)}`)
      if(rows.length!==1||['id','user_id','score','rank','kills','survived_seconds','max_size','reason'].some(k=>rows[0][k as keyof PracticeRun]!==run[k as keyof PracticeRun]))throw new Error('practice_save_unconfirmed')
    },
  }
}
export function practiceRun(id:string,userId:string,result:Result,endedAt:number):PracticeRun{
  return {id,user_id:userId,score:result.score,rank:result.rank,kills:result.kills,survived_seconds:result.survivedSeconds,max_size:result.maxSize,reason:result.reason,ended_at:new Date(endedAt).toISOString()}
}
