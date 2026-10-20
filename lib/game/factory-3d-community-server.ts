import {createClient,createAdminClient} from '@/lib/supabase/server'
import {ColonyPersistenceError,persistColony,type ColonyStore} from './factory-3d-persistence'
import {randomUUID} from 'node:crypto'
export class CommunityError extends Error {constructor(public code:string,public status=503){super(code)}}
export async function communityAccount() {
  const client=await createClient(),{data:{user},error}=await client.auth.getUser()
  if(error&&error.name!=='AuthSessionMissingError'&&error.status!==401)throw new CommunityError('account_unavailable')
  if(!user||error)throw new CommunityError('authentication_required',401)
  if(!user.email_confirmed_at)throw new CommunityError('confirmed_account_required',403)
  const admin=createAdminClient(),[profile,roles]=await Promise.all([admin.from('profiles').select('is_banned').eq('id',user.id).single(),admin.from('profile_roles').select('role').eq('profile_id',user.id)])
  if(profile.error||roles.error)throw new CommunityError('account_unavailable')
  if(profile.data.is_banned||!roles.data.some(r=>r.role==='user'))throw new CommunityError('account_unavailable',403)
  return {id:user.id,admin}
}
export async function communityRpc(admin:ReturnType<typeof createAdminClient>,name:string,args:Record<string,unknown>) {
  const {data,error}=await (admin.rpc as unknown as (name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>)(name,args)
  if(error)throw new CommunityError('community_unavailable')
  return data
}
export async function settleCommunityAccount(admin:ReturnType<typeof createAdminClient>,userId:string) {
  const store:ColonyStore={load:async(userId,commandId,hash)=>await communityRpc(admin,'factory_3d_load',{p_user:userId,p_command:commandId,p_action_hash:hash}) as Awaited<ReturnType<ColonyStore['load']>>,commit:async(userId,commandId,hash,revision,receipt)=>await communityRpc(admin,'factory_3d_commit',{p_user:userId,p_command:commandId,p_action_hash:hash,p_expected:revision,p_receipt:receipt}) as Awaited<ReturnType<ColonyStore['commit']>>}
  try{await persistColony(store,userId,{commandId:randomUUID(),action:{kind:'sync'}})}catch(e){throw new CommunityError(e instanceof ColonyPersistenceError?'community_unavailable':'account_unavailable')}
}
export const communityReply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
export const communityFailure=(e:unknown)=>communityReply({code:e instanceof CommunityError?e.code:'community_unavailable'},e instanceof CommunityError?e.status:503)
