import {requireAnyRoleForApi} from '@/lib/supabase/auth'
import {createAdminClient} from '@/lib/supabase/server'
import {checkRateLimit,rateLimitResponse} from '@/lib/security/rate-limit'
import {CURRENT_TERMS_VERSION,hasAcceptedCurrentTerms} from '@/lib/legal/terms'
import {isAdult} from '@/lib/identity/verification'
import {snakeAdmin,sameOrigin,UUID} from '@/lib/snake-arena/server'
import {signTicket} from '@/games/snake-arena/server/src/ticket'
import {recordConfirmedSnakeRegistration} from '@/lib/analytics/snake-funnel-server'
import {practiceOrigin} from '@/lib/game/snake-practice-auth'
export async function POST(req:Request,{params}:{params:Promise<{id:string;action:string}>}){
  if(!sameOrigin(req)&&!practiceOrigin(req))return Response.json({error:'Origen no permitido.'},{status:403})
  const {id,action}=await params;if(!UUID.test(id)||!['register','ticket'].includes(action))return Response.json({error:'Acción no encontrada.'},{status:404})
  const auth=await requireAnyRoleForApi(['user']);if(!auth.ok)return auth.response
  const user=auth.access.userId,db=snakeAdmin()
  const rate=await checkRateLimit({key:`snake:${action}:${user}`,limit:30,windowMs:120000});if(!rate.ok)return rateLimitResponse(rate)
  if(action==='register'){
    const {error}=await db.rpc('snake_register',{p_tournament:id,p_user:user,p_terms:CURRENT_TERMS_VERSION})
    const reasons:Record<string,string>={not_found:'Torneo no encontrado.',profile_required:'Completa tu perfil, verifica tu correo y acepta los términos vigentes.',registration_closed:'Las inscripciones están cerradas.',capacity:'No quedan cupos.'}
    if(error){const reason=Object.keys(reasons).find(k=>error.message.includes(k));return Response.json({error:reason?reasons[reason]:'No se pudo confirmar la inscripción.'},{status:reason?409:503})}
    await recordConfirmedSnakeRegistration(req,async()=>{
      const {data,error}=await db.from('snake_entries').select('registered_at').eq('tournament_id',id).eq('user_id',user).maybeSingle()
      if(error)throw new Error('Registration metric unavailable')
      return data?.registered_at??null
    })
    return Response.json({registered:true})
  }
  const [{data:entry},{data:tournament},{data:profile}]=await Promise.all([
    db.from('snake_entries').select('user_id').eq('tournament_id',id).eq('user_id',user).maybeSingle(),
    db.from('snake_tournaments').select('status').eq('id',id).maybeSingle(),
    createAdminClient().from('profiles').select('is_banned,birth_date,terms_accepted_at,terms_version').eq('id',user).maybeSingle()
  ])
  if(!entry||!profile||profile.is_banned||!isAdult(profile.birth_date)||!hasAcceptedCurrentTerms(profile.terms_accepted_at,profile.terms_version))return Response.json({error:'Inscripción y perfil habilitado requeridos.'},{status:403})
  if(!tournament||!['locked','live'].includes(tournament.status))return Response.json({error:'La sala abre 30 segundos antes del inicio.'},{status:409})
  const secret=process.env.SNAKE_TOURNAMENT_SECRET
  if(!secret||secret.length<32)return Response.json({error:'El servidor de torneos no está disponible.'},{status:503})
  return Response.json({ticket:signTicket({user,tournament:id,exp:Date.now()+60000,version:1},secret)},{headers:{'Cache-Control':'no-store'}})
}
