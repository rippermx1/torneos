'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function OpsNotificationReview({ id }: { id: string }) {
  const router = useRouter()
  const [action, setAction] = useState('retry'), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <form className="mt-3 space-y-2" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch(`/api/admin/ops-notifications/${id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note }) })
      if (!response.ok) throw new Error((await response.json()).error || 'No se pudo registrar la atención del aviso')
      router.refresh()
    } catch (error) { setError(error instanceof Error ? error.message : 'Respuesta incierta; recarga antes de repetir') }
    finally { setBusy(false) }
  }}>
    <label className="block text-sm" htmlFor={`action-${id}`}>Atención del aviso</label>
    <select id={`action-${id}`} value={action} onChange={e => setAction(e.target.value)} className="rounded border bg-background p-2">
      <option value="retry">Reintentar tras corregir la causa</option><option value="manual_receipt">Confirmar recepción por canal alternativo</option>
    </select>
    <label className="block text-sm" htmlFor={`evidence-${id}`}>{action === 'retry' ? 'Corrección aplicada' : 'Evidencia de recepción y persona contactada'}</label>
    <textarea id={`evidence-${id}`} required minLength={10} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} className="w-full rounded border bg-background p-2" />
    <p className="text-xs text-muted-foreground">Registrar recepción por otro canal no confirma entrega de correo ni resuelve el incidente. Asume también su atención.</p>
    <button disabled={busy} className="rounded border px-3 py-2 text-sm">{busy ? 'Guardando…' : 'Registrar atención del aviso'}</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>
}
