import 'server-only'
import {createClient,createAdminClient} from '@/lib/supabase/server'
export async function practiceAccount(){
  const supabase=await createClient(),{data:{user},error}=await supabase.auth.getUser()
  if(error&&error.name!=='AuthSessionMissingError'&&error.status!==401)return {response:Response.json({code:'account_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
  if(error||!user)return {response:Response.json({code:'authentication_required'},{status:401,headers:{'Cache-Control':'no-store'}})}
  if(!user.email_confirmed_at)return {response:Response.json({code:'confirmed_account_required'},{status:403})}
  const admin=createAdminClient()
  const [profile,roles]=await Promise.all([admin.from('profiles').select('username,is_banned').eq('id',user.id).single(),admin.from('profile_roles').select('role').eq('profile_id',user.id)])
  if(profile.error||roles.error)return {response:Response.json({code:'account_unavailable'},{status:503})}
  if(profile.data.is_banned||!roles.data.some(r=>r.role==='user'))return {response:Response.json({code:'account_unavailable'},{status:403})}
  return {supabase,userId:user.id,name:(profile.data.username.replace(/[<>\x00-\x1f]/g,'').trim()||'Jugador').slice(0,20)}
}
export function practiceOrigin(request:Request){
  const origin=request.headers.get('origin')
  const allowed=(process.env.SNAKE_PRACTICE_ORIGINS??'').split(',').map(s=>s.trim())
  return origin&&allowed.includes(origin)?origin:null
}
