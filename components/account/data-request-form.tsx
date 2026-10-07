'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DataRequestForm() {
  const [kind,setKind] = useState('access'), [description,setDescription] = useState(''), [message,setMessage] = useState(''), [busy,setBusy] = useState(false)
  const router = useRouter()
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('')
    try {
      const r=await fetch('/api/account/data-requests',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,description}) }), d=await r.json()
      if (!r.ok) {setMessage(d.error??'No se pudo confirmar la solicitud');return}
      setMessage(`Solicitud recibida: ${d.requestId}`);setDescription('');router.refresh()
    } catch {setMessage('No se pudo confirmar el resultado. Revisa tus solicitudes antes de repetir.')}
    finally {setBusy(false)}
  }
  return <form onSubmit={submit} className="space-y-3 border rounded-xl p-4">
    <h2 className="font-semibold">Solicitar acceso o eliminación de datos</h2>
    <p className="text-sm text-muted-foreground">La eliminación requiere revisar las obligaciones pendientes y los registros que deban conservarse. Presentar la solicitud no borra tu cuenta ni liquida pagos.</p>
    <label className="block text-sm">Solicitud<select value={kind} onChange={e=>setKind(e.target.value)} className="block border rounded p-2 w-full"><option value="access">Acceso completo a mis datos</option><option value="erasure">Eliminación de datos</option></select></label>
    <label className="block text-sm">Detalle<textarea value={description} onChange={e=>setDescription(e.target.value)} minLength={10} maxLength={2000} required className="block border rounded p-2 w-full" /></label>
    <button disabled={busy} className="border rounded px-3 py-2">{busy?'Enviando…':'Enviar solicitud'}</button><p role="status" className="text-sm">{message}</p>
  </form>
}
