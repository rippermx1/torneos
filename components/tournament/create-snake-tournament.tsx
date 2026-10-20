'use client'
import {useState} from 'react'
import {useRouter} from 'next/navigation'
export function CreateSnakeTournament(){
  const router=useRouter(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  return <form className="max-w-lg space-y-5" onSubmit={async event=>{
    event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);setError('')
    try{const response=await fetch('/api/snake-arena/tournaments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:form.get('name'),starts_at:new Date(String(form.get('starts_at'))).toISOString(),duration_seconds:Number(form.get('duration_seconds')),max_players:Number(form.get('max_players'))})}),value=await response.json();if(!response.ok){setError(value.error);return}router.push(`/tournaments/snake-arena/${value.tournament.id}`)}catch{setError('No se pudo crear el torneo.')}finally{setBusy(false)}
  }}>
    <label className="block">Nombre<input name="name" required minLength={3} maxLength={80} className="mt-2 block w-full rounded-lg border p-3"/></label>
    <label className="block">Inicio (hora de tu dispositivo)<input name="starts_at" type="datetime-local" required className="mt-2 block w-full rounded-lg border p-3"/></label>
    <label className="block">Duración en segundos<input name="duration_seconds" type="number" min={60} max={300} defaultValue={120} required className="mt-2 block w-full rounded-lg border p-3"/></label>
    <label className="block">Cupos<input name="max_players" type="number" min={2} max={16} defaultValue={16} required className="mt-2 block w-full rounded-lg border p-3"/></label>
    <p className="text-sm">Reglas snake-free-v1. Inscripción gratuita y sin premios monetarios. Publica con al menos 90 segundos de anticipación. La sala abre 30 segundos antes del inicio y necesita dos inscritos.</p>
    {error&&<p role="alert" className="text-red-600">{error}</p>}<button disabled={busy} className="rounded-lg bg-teal-700 px-5 py-3 text-white disabled:opacity-50">{busy?'Publicando…':'Publicar torneo gratuito'}</button>
  </form>
}
