import Link from 'next/link'
import {requireAdminMfa} from '@/lib/supabase/admin-mfa'
import {funnelEnabled,readFunnelState} from '@/lib/analytics/snake-funnel-server'
import {funnelSummary} from '@/lib/analytics/snake-funnel'
import {SnakeFunnelReport} from '@/components/admin/snake-funnel-report'
export const dynamic='force-dynamic'
export default async function Page(){
  await requireAdminMfa()
  let report:ReturnType<typeof funnelSummary>|null=null,error=false
  if(funnelEnabled())try{report=funnelSummary(await readFunnelState())}catch{error=true}
  return <div className="mx-auto max-w-4xl space-y-6"><Link href="/admin/reports" className="text-sm underline">Volver a informes</Link><header className="space-y-2"><h1 className="text-2xl font-bold">De Snake a los torneos</h1><p className="text-sm text-muted-foreground">Piloto para conseguir más participantes: recorrido desde la práctica hasta la inscripción en un torneo gratuito de Snake Arena.</p></header>{report?<SnakeFunnelReport report={report}/>:<p role="status">{error?'No se pudo leer la medición. No se muestran cifras incompletas.':'La medición no está activada en este ambiente.'}</p>}<p className="text-sm text-muted-foreground">Datos de uso del piloto; las confirmaciones no acreditan ingresos ni participantes humanos únicos.</p></div>
}
