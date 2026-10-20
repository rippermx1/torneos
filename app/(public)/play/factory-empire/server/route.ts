import {createClient,createAdminClient} from '@/lib/supabase/server'
import {getAllowedOrigins} from '@/lib/env'
import {readColonyCommand} from '@/lib/game/factory-3d-domain'
import {ColonyPersistenceError,persistColony,type ColonyStore} from '@/lib/game/factory-3d-persistence'
import {checkRateLimit,rateLimitResponse} from '@/lib/security/rate-limit'

export const runtime='nodejs'
const reply=(data: unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
export async function POST(request: Request) {
  const origin=request.headers.get('origin')
  if(!origin||!getAllowedOrigins().includes(origin)||request.headers.get('sec-fetch-site')==='cross-site')return reply({code:'origin_rejected'},403)
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({code:'invalid_command'},415)
  // Bound the stream, including chunked requests without Content-Length.
  const reader=request.body?.getReader();if(!reader)return reply({code:'invalid_command'},400)
  let text='';const decoder=new TextDecoder();let bytes=0
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096){await reader.cancel();return reply({code:'command_too_large'},413)}text+=decoder.decode(value,{stream:true})}}
  catch{return reply({code:'invalid_command'},400)}
  text+=decoder.decode()
  let input: unknown;try{input=JSON.parse(text)}catch{return reply({code:'invalid_command'},400)}
  const command=readColonyCommand(input);if(!command)return reply({code:'invalid_command'},400)
  try {
    const supabase=await createClient(),{data:{user},error}=await supabase.auth.getUser()
    if(error&&error.name!=='AuthSessionMissingError'&&error.status!==401)return reply({code:'account_unavailable'},503)
    if(error||!user)return reply({code:'authentication_required'},401)
    if(!user.email_confirmed_at)return reply({code:'confirmed_account_required'},403)
    // An identity precondition prevents a pending command from account A being
    // applied to account B after the browser session changes. It grants no access.
    const expectedAccount=request.headers.get('x-factory-account')
    if((command.action.kind!=='sync'&&!expectedAccount)||(expectedAccount&&expectedAccount!==user.id))return reply({code:'account_changed'},403)
    const admin=createAdminClient()
    const [profile,roles]=await Promise.all([admin.from('profiles').select('is_banned').eq('id',user.id).single(),admin.from('profile_roles').select('role').eq('profile_id',user.id)])
    if(profile.error||roles.error)return reply({code:'account_unavailable'},503)
    if(profile.data.is_banned||!roles.data.some(r=>r.role==='user'))return reply({code:'account_unavailable'},403)
    const limit=await checkRateLimit({key:`factory-3d:${user.id}`,limit:360,windowMs:60000,onError:'deny'})
    if(!limit.ok){const response=rateLimitResponse(limit);response.headers.set('Cache-Control','no-store');return response}
    async function rpc(name: string,args: Record<string,unknown>) {
      // Narrow cast until the repository regenerates all schema types together.
      const {data,error}=await (admin.rpc as unknown as (name: string,args: Record<string,unknown>)=>Promise<{data: unknown;error: {message: string}|null}>)(name,args)
      if(error)throw new ColonyPersistenceError(error.message.includes('command_payload_conflict')?'command_payload_conflict':'storage_unavailable')
      return data
    }
    const store: ColonyStore={
      load:async(userId,commandId,hash)=>await rpc('factory_3d_load',{p_user:userId,p_command:commandId,p_action_hash:hash}) as Awaited<ReturnType<ColonyStore['load']>>,
      commit:async(userId,commandId,hash,revision,receipt)=>await rpc('factory_3d_commit',{p_user:userId,p_command:commandId,p_action_hash:hash,p_expected:revision,p_receipt:receipt}) as Awaited<ReturnType<ColonyStore['commit']>>,
    }
    return reply({...await persistColony(store,user.id,command),accountId:user.id})
  }catch(error){const code=error instanceof ColonyPersistenceError?error.code:'storage_unavailable';return reply({code},code==='command_payload_conflict'?409:503)}
}
