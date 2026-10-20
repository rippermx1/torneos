import {getAllowedOrigins} from '@/lib/env'
import {readSharing} from '@/lib/game/factory-3d-community'
import {communityAccount,communityRpc,settleCommunityAccount,communityReply,communityFailure} from '@/lib/game/factory-3d-community-server'
import {checkRateLimit,rateLimitResponse} from '@/lib/security/rate-limit'
export const runtime='nodejs'
export async function GET() {
  try{const {id,admin}=await communityAccount();return communityReply({accountId:id,sharing:await communityRpc(admin,'factory_3d_sharing',{p_user:id})})}catch(e){return communityFailure(e)}
}
export async function POST(request:Request) {
  if(!getAllowedOrigins().includes(request.headers.get('origin')??'')||request.headers.get('sec-fetch-site')==='cross-site')return communityReply({code:'origin_rejected'},403)
  if(!request.headers.get('content-type')?.startsWith('application/json'))return communityReply({code:'invalid_publication'},415)
  const reader=request.body?.getReader();if(!reader)return communityReply({code:'invalid_publication'},400)
  let text='',bytes=0;const decoder=new TextDecoder()
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024){await reader.cancel();return communityReply({code:'publication_too_large'},413)}text+=decoder.decode(value,{stream:true})}text+=decoder.decode()}catch{return communityReply({code:'invalid_publication'},400)}
  let input:unknown;try{input=JSON.parse(text)}catch{return communityReply({code:'invalid_publication'},400)}
  const intent=readSharing(input);if(!intent)return communityReply({code:'invalid_publication'},400)
  try{
    const {id,admin}=await communityAccount()
    if(request.headers.get('x-factory-account')!==id)return communityReply({code:'account_changed'},403)
    const limit=await checkRateLimit({key:`factory-sharing:${id}`,limit:20,windowMs:60000,onError:'deny'})
    if(!limit.ok){const r=rateLimitResponse(limit);r.headers.set('Cache-Control','no-store');return r}
    if(intent.visible)await settleCommunityAccount(admin,id)
    return communityReply({accountId:id,sharing:await communityRpc(admin,'factory_3d_share',{p_user:id,p_visible:intent.visible,p_alias:intent.alias??null})})
  }catch(e){return communityFailure(e)}
}
