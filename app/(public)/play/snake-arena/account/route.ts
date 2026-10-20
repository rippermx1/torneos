import {practiceAccount} from '@/lib/game/snake-practice-auth'
import {dailyProgress,dailyWindow} from '@/lib/game/snake-daily-missions'
export async function GET(){
  const account=await practiceAccount();if(account.response)return account.response
  const now=Date.now()
  const [history,best,progress,daily]=await Promise.all([account.supabase.from('snake_practice_runs').select('id,score,rank,kills,survived_seconds,max_size,reason,ended_at').eq('user_id',account.userId).order('ended_at',{ascending:false}).limit(20),account.supabase.from('snake_practice_runs').select('score').eq('user_id',account.userId).order('score',{ascending:false}).limit(1),account.supabase.from('snake_practice_progress').select('xp').eq('user_id',account.userId).limit(1),account.supabase.from('snake_practice_daily_progress').select('lights,growth,stars').eq('user_id',account.userId).eq('day',dailyWindow(now).day).limit(1)])
  if(history.error||best.error||progress.error||daily.error)return Response.json({code:'history_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})
  const xp=progress.data[0]?.xp??0
  return Response.json({userId:account.userId,name:account.name,best:best.data[0]?.score??0,xp,level:Math.floor(xp/100)+1,daily:dailyProgress(now,daily.data[0]),history:history.data},{headers:{'Cache-Control':'no-store'}})
}
