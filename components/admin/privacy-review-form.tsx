'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function PrivacyReviewForm({id,kind}:{id:string;kind:string}) {
  const [status,setStatus]=useState('reviewing'),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const router=useRouter()
  async function submit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();const form=new FormData(e.currentTarget);setBusy(true);setError('')
    try{const r=await fetch(`/api/admin/privacy/${id}`,{method:'POST',body:form}),d=await r.json();if(!r.ok){setError(d.error??'No se pudo confirmar el resultado');return}router.refresh()}
    catch{setError('Consulta el estado antes de repetir.')}finally{setBusy(false)}
  }
  return <form onSubmit={submit} className="space-y-2 text-sm">
    <label className="block">Estado<select name="status" value={status} onChange={e=>setStatus(e.target.value)} className="block border rounded p-2"><option value="reviewing">En revisión</option><option value="blocked">Pendiente de antecedentes o retención</option><option value="rejected">Rechazada con fundamento</option>{kind==='access'&&<option value="completed">Entregar respuesta revisada</option>}</select></label>
    <label className="block">Respuesta al usuario<textarea name="reason" required minLength={10} maxLength={2000} className="block border rounded p-2 w-full" /></label>
    {status==='completed'&&<label className="block">Respuesta completa revisada (PDF, JSON o ZIP; máximo 4 MB)<input name="response" type="file" accept="application/pdf,application/json,application/zip" required /></label>}
    <button disabled={busy} className="border rounded px-3 py-2">{busy?'Guardando…':'Guardar respuesta'}</button>{error&&<p role="alert" className="text-red-600">{error}</p>}
  </form>
}
