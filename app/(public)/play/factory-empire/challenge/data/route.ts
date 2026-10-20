import {createAdminClient} from '@/lib/supabase/server'
import {readChallengeQuery} from '@/lib/game/factory-3d-challenge'
import {challengeReply,challengeFailure,challengeRpc,projectChallengeBoard} from '@/lib/game/factory-3d-challenge-server'
import {checkRateLimit,rateLimitResponse,getRequestIp} from '@/lib/security/rate-limit'
export const runtime='nodejs'
export async function GET(request:Request){
  const q=readChallengeQuery(new URL(request.url));if(!q)return challengeReply({code:'invalid_directory_query'},400)
  try{
    const limit=await checkRateLimit({key:`factory-challenge-board:${getRequestIp(request)}`,limit:120,windowMs:60000,onError:'deny'})
    if(!limit.ok){const r=rateLimitResponse(limit);r.headers.set('Cache-Control','no-store');return r}
    const raw=await challengeRpc(createAdminClient(),'factory_3d_challenge_board',{p_edition:q.edition,p_offset:q.offset})
    return challengeReply(projectChallengeBoard(raw,q.offset))
  }catch(e){return challengeFailure(e)}
}
