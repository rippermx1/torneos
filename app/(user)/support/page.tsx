import Link from 'next/link'
import { requireUserRole } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { DataRequestForm } from '@/components/account/data-request-form'
import { AccountControls } from '@/components/account/account-controls'
import { formatDateTimeCL } from '@/lib/utils'

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const query = await searchParams
  const requestedPage = Number(query.page ?? 1)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100_000 ? requestedPage : 1
  const access=await requireUserRole(),admin=createAdminClient()
  const [cases,requests]=await Promise.all([
    admin.from('disputes').select('id,case_kind,type,status,description,admin_notes,created_at,acknowledged_at', { count: 'exact' }).eq('user_id',access.userId).order('created_at',{ascending:false}).order('id').range((page - 1) * 50, page * 50 - 1),
    admin.rpc('list_data_requests',{p_actor:access.userId,p_owner_only:true}),
  ])
  if(cases.error||requests.error||cases.count===null)throw new Error('No se pudo cargar el estado de soporte')
  const labels:Record<string,string>={submitted:'Recibida',reviewing:'En revisión',blocked:'Pendiente de revisión o retención',completed:'Respuesta disponible',rejected:'Rechazada'}
  return <div className="space-y-6 max-w-3xl">
    <h1 className="text-2xl font-bold">Mis casos y datos</h1>
    {access.isSuspended&&<p className="border rounded p-3">Tu cuenta está suspendida. Puedes consultar tus históricos, solicitar revisión y ejercer tus derechos sobre datos.</p>}
    <Link href="/support/dispute" className="underline">Enviar consulta, disputa o incidente</Link>
    <section className="space-y-3"><h2 className="font-semibold">Casos de soporte · {cases.count} en total</h2>{(cases.data??[]).map(c=><article key={c.id} className="border rounded p-4 space-y-2"><p className="text-sm">{c.id} · {({consultation:'Consulta',dispute:'Disputa',incident:'Incidente'} as Record<string,string>)[c.case_kind ?? 'dispute']} · {({open:'Abierto',resolved:'Resuelto',rejected:'Rechazado'} as Record<string,string>)[c.status]} · {formatDateTimeCL(c.created_at)}</p><p className="whitespace-pre-wrap">{c.description}</p><p className="text-sm">{c.acknowledged_at?'Atención acusada':'Pendiente de atención'}</p>{c.admin_notes&&<p className="whitespace-pre-wrap">Respuesta: {c.admin_notes}</p>}</article>)}</section>
    <nav aria-label="Páginas de casos" className="flex gap-4 text-sm">
      {page > 1 && <Link href={`/support?page=${page - 1}`} className="underline">Más recientes</Link>}
      {page * 50 < (cases.count ?? 0) && <Link href={`/support?page=${page + 1}`} className="underline">Más antiguos</Link>}
    </nav>
    <DataRequestForm />
    <section className="space-y-3"><h2 className="font-semibold">Solicitudes de datos</h2>{(requests.data??[]).map((r:{id:string;kind:string;status:string;response:string|null;response_storage_path:string|null})=><article key={r.id} className="border rounded p-4"><p>{r.kind==='access'?'Acceso':'Eliminación'} · {labels[r.status]}</p><p className="text-sm">Referencia: {r.id}</p>{r.response&&<p className="whitespace-pre-wrap">{r.response}</p>}{r.response_storage_path&&<a href={`/api/account/data-requests/${r.id}/response`} className="underline">Descargar respuesta privada</a>}</article>)}</section>
    <AccountControls />
  </div>
}
