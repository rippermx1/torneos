'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function OpsAcknowledgement({ id }: { id: string }) {
  const router = useRouter()
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <form className="mt-3 space-y-2" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch(`/api/admin/ops-incidents/${id}/acknowledge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) })
      if (!response.ok) throw new Error((await response.json()).error || 'No se pudo guardar la atención')
      router.refresh()
    } catch (error) { setError(error instanceof Error ? error.message : 'Respuesta incierta; recarga antes de repetir') }
    finally { setBusy(false) }
  }}>
    <label className="block text-sm" htmlFor={`note-${id}`}>Qué vas a revisar y próxima acción</label>
    <textarea id={`note-${id}`} required minLength={10} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} className="w-full rounded border bg-background p-2" />
    <button disabled={busy} className="rounded border px-3 py-2 text-sm">{busy ? 'Guardando…' : 'Asumir atención'}</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>
}
