import { requireAdminMfa } from '@/lib/supabase/admin-mfa'
import { createAdminClient } from '@/lib/supabase/server'
import { PrivacyReviewForm } from '@/components/admin/privacy-review-form'
import { formatDateTimeCL } from '@/lib/utils'

export default async function PrivacyPage() {
  const access=await requireAdminMfa(),admin=createAdminClient()
  const result=await admin.rpc('list_data_requests',{p_actor:access.userId,p_owner_only:false})
  if(result.error)throw new Error('No se pudieron cargar las solicitudes')
  return <div className="space-y-5 max-w-3xl"><h1 className="text-2xl font-bold">Solicitudes de datos</h1>
    <p className="text-sm text-muted-foreground">Revisa titularidad y alcance. La eliminación permanece pendiente de política legal de retención, archivos y copias. No prometas borrar obligaciones vigentes.</p>
    {(result.data??[]).map((r:{id:string;user_id:string;kind:string;status:string;description:string;response:string|null;created_at:string})=><article key={r.id} className="border rounded-xl p-4 space-y-3"><p>{r.kind==='access'?'Acceso':'Eliminación'} · {({submitted:'Recibida',reviewing:'En revisión',blocked:'Pendiente',completed:'Respuesta disponible',rejected:'Rechazada'} as Record<string,string>)[r.status]} · {formatDateTimeCL(r.created_at)}</p><p className="text-xs">Solicitud {r.id} · Titular {r.user_id}</p><p className="whitespace-pre-wrap">{r.description}</p>{r.response&&<p className="whitespace-pre-wrap">Respuesta: {r.response}</p>}{!['completed','rejected'].includes(r.status)&&<PrivacyReviewForm id={r.id} kind={r.kind}/>}</article>)}
  </div>
}
