import {practiceAccount,practiceOrigin} from '@/lib/game/snake-practice-auth'
import {sameOrigin,snakeAdmin} from '@/lib/snake-arena/server'
import {readCompetitiveBoard} from '@/lib/snake-arena/leaderboard'
const headers={'Cache-Control':'no-store'}
function accountFailure(response:Response){response.headers.set('Cache-Control','no-store');return response}
async function snapshot(owner?:string){
  try{
    const {data,error}=await snakeAdmin().rpc('snake_competitive_snapshot',{p_owner:owner??null})
    const board=readCompetitiveBoard(data)
    if(error||!board||(owner===undefined?board.mine!==null:board.mine===null))return Response.json({code:'classification_unavailable'},{status:503,headers})
    return Response.json(board,{headers})
  }catch{return Response.json({code:'classification_unavailable'},{status:503,headers})}
}
export async function GET(){
  const account=await practiceAccount()
  if(account.response&&account.response.status!==401)return accountFailure(account.response)
  return snapshot(account.userId)
}
export async function POST(request:Request){
  if(!sameOrigin(request)&&!practiceOrigin(request))return Response.json({code:'origin_not_allowed'},{status:403,headers})
  const account=await practiceAccount();if(account.response)return accountFailure(account.response)
  const value:unknown=await request.json().catch(()=>null)
  if(!value||typeof value!=='object'||Object.keys(value).length!==1||!('participating' in value)||typeof value.participating!=='boolean')return Response.json({code:'invalid_preference'},{status:400,headers})
  const {error}=await account.supabase.from('snake_competitive_preferences').upsert({user_id:account.userId,participating:value.participating},{onConflict:'user_id'})
  if(error)return Response.json({code:'preference_unavailable'},{status:503,headers})
  return snapshot(account.userId)
}
