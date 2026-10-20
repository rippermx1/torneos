import {FUNNEL_TTL,readFunnelEvent} from '@/lib/analytics/snake-funnel'
import {FUNNEL_COOKIE,funnelEnabled,funnelOrigin,funnelSession,newFunnelSession,signFunnelSession,recordFunnel} from '@/lib/analytics/snake-funnel-server'
export const runtime='nodejs'
let windowAt=0,requests=0
export async function POST(request:Request){
  if(!funnelEnabled())return new Response(null,{status:204})
  if(!funnelOrigin(request))return Response.json({error:'Origen no permitido.'},{status:403})
  if(Date.now()-windowAt>=60000){windowAt=Date.now();requests=0}
  if(++requests>1200)return new Response(null,{status:429,headers:{'Retry-After':'60'}})
  if(!request.headers.get('content-type')?.startsWith('application/json'))return new Response(null,{status:415})
  const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400})
  let body='',bytes=0;const decoder=new TextDecoder()
  for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>512){await reader.cancel();return new Response(null,{status:413})}body+=decoder.decode(chunk.value,{stream:true})}
  let parsed;try{parsed=readFunnelEvent(JSON.parse(body))}catch{return new Response(null,{status:400})}
  if(!parsed)return new Response(null,{status:400})
  let session=funnelSession(request);const created=!session
  if(!session&&parsed.event!=='practice_view')return new Response(null,{status:202})
  session??=newFunnelSession()
  try{
    await recordFunnel(session,parsed.event,parsed)
    const headers:Record<string,string>={'Cache-Control':'no-store'}
    if(created)headers['Set-Cookie']=`${FUNNEL_COOKIE}=${signFunnelSession(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${FUNNEL_TTL/1000}${request.headers.get('origin')?.startsWith('https:')?'; Secure':''}`
    return new Response(null,{status:204,headers})
  }catch{return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}})}
}
