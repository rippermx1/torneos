import {requireAdminMfaForApi} from '@/lib/supabase/admin-mfa'
import {funnelEnabled,readFunnelState} from '@/lib/analytics/snake-funnel-server'
import {funnelSummary} from '@/lib/analytics/snake-funnel'
export const runtime='nodejs'
export async function GET(){
  const auth=await requireAdminMfaForApi();if(!auth.ok)return auth.response
  if(!funnelEnabled())return Response.json({enabled:false},{headers:{'Cache-Control':'private, no-store'}})
  try{return Response.json({enabled:true,report:funnelSummary(await readFunnelState())},{headers:{'Cache-Control':'private, no-store'}})}catch{return Response.json({error:'Medición no disponible.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
