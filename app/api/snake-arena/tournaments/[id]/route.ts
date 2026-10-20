import {getUser} from '@/lib/supabase/auth'
import {snakeAdmin,SNAKE_PUBLIC_COLUMNS,UUID} from '@/lib/snake-arena/server'
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;if(!UUID.test(id))return Response.json({error:'Torneo no encontrado.'},{status:404})
  const db=snakeAdmin(),user=await getUser()
  const [{data:tournament,error},{data:results,error:resultsError},{count,error:countError}]=await Promise.all([
    db.from('snake_tournaments').select(SNAKE_PUBLIC_COLUMNS).eq('id',id).maybeSingle(),
    db.from('snake_results').select('*').eq('tournament_id',id).order('rank'),
    db.from('snake_entries').select('*',{count:'exact',head:true}).eq('tournament_id',id)
  ])
  if(error||resultsError||countError)return Response.json({error:'No se pudo consultar el torneo.'},{status:503})
  if(!tournament)return Response.json({error:'Torneo no encontrado.'},{status:404})
  const {data:entry}=user?await db.from('snake_entries').select('registered_at').eq('tournament_id',id).eq('user_id',user.id).maybeSingle():{data:null}
  return Response.json({tournament,results:results??[],participants:count??0,registered:!!entry,authenticated:!!user,serverNow:Date.now()},{headers:{'Cache-Control':'private, no-store'}})
}
