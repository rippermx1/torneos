import {createAdminClient} from '@/lib/supabase/server'
import {publicDirectory,publicVisit,readCommunityQuery} from '@/lib/game/factory-3d-community'
import {communityRpc,communityReply,communityFailure} from '@/lib/game/factory-3d-community-server'
import {checkRateLimit,rateLimitResponse,getRequestIp} from '@/lib/security/rate-limit'
export const runtime='nodejs'
export async function GET(request:Request) {
  const query=readCommunityQuery(new URL(request.url));if(!query)return communityReply({code:'invalid_directory_query'},400)
  try{
    const limit=await checkRateLimit({key:`factory-community:${getRequestIp(request)}`,limit:120,windowMs:60000,onError:'deny'})
    if(!limit.ok){const r=rateLimitResponse(limit);r.headers.set('Cache-Control','no-store');return r}
    const data=await communityRpc(createAdminClient(),'factory_3d_community',{p_id:query.id,p_order:query.order,p_offset:query.offset})
    if(query.id){const visit=publicVisit(data);return visit?communityReply({...visit,prizeEligible:false}):communityReply({code:'colony_not_public'},404)}
    return communityReply({...publicDirectory(data,query.offset),order:query.order})
  }catch(e){return communityFailure(e)}
}
