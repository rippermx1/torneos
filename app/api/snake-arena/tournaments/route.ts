import {requireAdminMfaForApi} from '@/lib/supabase/admin-mfa'
import {snakeAdmin,SNAKE_PUBLIC_COLUMNS,sameOrigin,validateCreation} from '@/lib/snake-arena/server'
export async function GET(){
  const {data,error}=await snakeAdmin().from('snake_tournaments').select(SNAKE_PUBLIC_COLUMNS).order('starts_at',{ascending:false}).limit(30)
  return Response.json(error?{error:'No se pudo consultar los torneos de Snake Arena.'}:{tournaments:data},{status:error?503:200,headers:{'Cache-Control':'no-store'}})
}
export async function POST(req:Request){
  if(!sameOrigin(req))return Response.json({error:'Origen no permitido.'},{status:403})
  const auth=await requireAdminMfaForApi();if(!auth.ok)return auth.response
  const body=validateCreation(await req.json().catch(()=>null))
  if(!body)return Response.json({error:'Indica nombre, inicio con al menos 90 segundos de anticipación, 60–300 segundos y 2–16 cupos. Solo torneos gratuitos.'},{status:400})
  const {data,error}=await snakeAdmin().from('snake_tournaments').insert({...body,created_by:auth.access.userId}).select(SNAKE_PUBLIC_COLUMNS).single()
  return Response.json(error?{error:'No se pudo crear el torneo.'}:{tournament:data},{status:error?503:201})
}
