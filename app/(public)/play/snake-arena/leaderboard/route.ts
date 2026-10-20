import {practiceAccount,practiceOrigin} from '@/lib/game/snake-practice-auth'
import {createAdminClient} from '@/lib/supabase/server'
import {readPracticeLeaderboard} from '@/lib/game/snake-practice-leaderboard'
import {readSeasonLeaderboard,type LeaderboardScope,type SeasonLeaderboard} from '@/lib/game/snake-practice-season'
const headers={'Cache-Control':'no-store'}
async function snapshot(userId:string|undefined,scope:LeaderboardScope){
  const {data,error}=await createAdminClient().rpc(scope==='historical'?'snake_practice_leaderboard_snapshot':'snake_practice_weekly_snapshot',scope==='historical'?{p_owner:userId??null}:{p_owner:userId??null,p_previous:scope==='previous'})
  const board=scope==='historical'?readPracticeLeaderboard(data):readSeasonLeaderboard(data)
  if(error||!board||scope!=='historical'&&(board as SeasonLeaderboard).season.period!==scope)return Response.json({code:'leaderboard_unavailable'},{status:503,headers})
  return Response.json(board,{headers})
}
function scopeOf(request:Request):LeaderboardScope|null{
  const values=new URL(request.url).searchParams.getAll('scope')
  return values.length===0?'historical':values.length===1&&['historical','current','previous'].includes(values[0])?values[0] as LeaderboardScope:null
}
export async function GET(request:Request){
  const scope=scopeOf(request);if(!scope)return Response.json({code:'invalid_scope'},{status:400,headers})
  const account=await practiceAccount()
  if(account.response&&account.response.status!==401)return account.response
  return snapshot(account.userId,scope)
}
export async function POST(request:Request){
  if(!practiceOrigin(request))return Response.json({code:'origin_not_allowed'},{status:403,headers})
  const scope=scopeOf(request);if(!scope)return Response.json({code:'invalid_scope'},{status:400,headers})
  const account=await practiceAccount();if(account.response)return account.response
  let value:unknown
  try{value=await request.json()}catch{return Response.json({code:'invalid_preference'},{status:400,headers})}
  if(!value||typeof value!=='object'||Object.keys(value).length!==1||!('participating' in value)||typeof value.participating!=='boolean')return Response.json({code:'invalid_preference'},{status:400,headers})
  const {error}=await account.supabase.from('snake_practice_leaderboard_preferences').upsert({user_id:account.userId,participating:value.participating},{onConflict:'user_id'})
  if(error)return Response.json({code:'preference_unavailable'},{status:503,headers})
  return snapshot(account.userId,scope)
}
