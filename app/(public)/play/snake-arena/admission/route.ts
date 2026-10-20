import {randomUUID} from 'node:crypto'
import {practiceAccount,practiceOrigin} from '@/lib/game/snake-practice-auth'
import {signPracticeTicket} from '@/games/snake-arena/server/src/practice-ticket'
export async function POST(request:Request){
  const origin=practiceOrigin(request);if(!origin)return Response.json({code:'invalid_origin'},{status:403})
  const secret=process.env.SNAKE_PRACTICE_SECRET
  if(!secret||secret.length<32)return Response.json({code:'practice_unavailable'},{status:503})
  const account=await practiceAccount();if(account.response)return account.response
  const now=Date.now(),ticket=signPracticeTicket({purpose:'snake-practice-v1',userId:account.userId,name:account.name,origin,nonce:randomUUID(),issuedAt:now,expiresAt:now+30000,leaseUntil:now+300000},secret)
  return Response.json({ticket,userId:account.userId},{headers:{'Cache-Control':'no-store'}})
}
