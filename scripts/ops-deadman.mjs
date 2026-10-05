import { pathToFileURL } from 'node:url'
import { assertProviderDispatchAllowed } from '../lib/config/provider-dispatch.mjs'

// No dependency on the app's queue, DB scheduler, runtime or .env files.
// Fixed half-hour payload/key permits bounded response-loss retries by the external runner.
/** @param {Record<string, string | undefined>} env */
export async function checkOperationalDeadman(env=process.env,fetcher=fetch,nowMs=Date.now()) {
  const origin=new URL(env.PRODUCTION_APP_URL || '')
  if(origin.protocol!=='https:' || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash || !env.CRON_SECRET) throw new Error('Monitor externo mal configurado')
  let healthy=false
  try {
    const response=await fetcher(new URL('/api/cron/monitor-status',origin),{headers:{Authorization:`Bearer ${env.CRON_SECRET}`},signal:AbortSignal.timeout(10_000)})
    const body=await response.json(),last=Date.parse(body.lastSuccessAt)
    healthy=response.ok && body.ok===true && Number.isFinite(last) && last<=nowMs+60_000 && nowMs-last<15*60_000
  } catch { /* App unavailable is a monitored failure, not a reason to suppress the independent alarm. */ }
  if(healthy)return {healthy:true,providerAccepted:false}
  assertProviderDispatchAllowed(env)
  if(!env.OPS_ESCALATION_EMAIL || !env.RESEND_API_KEY)throw new Error('Falta suplente o credencial de correo en el monitor externo')
  const bucket=Math.floor(nowMs/(30*60_000))
  const text=`El monitor de obligaciones de ${origin.origin} está caído, vencido o no se pudo comprobar. Ventana UTC: ${new Date(bucket*30*60_000).toISOString()}. Revisar aplicación, base de datos y scheduler; registrar atención y conciliar obligaciones antes de operar.`
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10_000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`ops-deadman/${origin.hostname}/${bucket}`},
    body:JSON.stringify({from:'Torneos <system@torneosplay.cl>',to:[env.OPS_ESCALATION_EMAIL],subject:'[TorneosPlay OPS] Monitor operativo sin éxito reciente',text})})
  if(!response.ok)throw new Error(`Aviso externo rechazado: HTTP ${response.status}`)
  const accepted=await response.json();if(typeof accepted.id!=='string'||!accepted.id)throw new Error('Aviso externo sin identificador de aceptación')
  return {healthy:false,providerAccepted:true,providerId:accepted.id}
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { const result=await checkOperationalDeadman();console.log(JSON.stringify(result));if(!result.healthy)process.exitCode=1 }
  catch(error){console.error(error.message);process.exitCode=1}
}
