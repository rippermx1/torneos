'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export function PayoutCompletionForm({ requestId, status, canTransfer, canReconcile }: { requestId: string; status: string; canTransfer: boolean; canReconcile: boolean }) {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState<'complete' | 'reject' | 'begin' | 'reconcile' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const [authorizedNow, setAuthorizedNow] = useState(false)
  const [outcome, setOutcome] = useState('unknown')

  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(status === 'approved' || authorizedNow ? 'complete' : 'reconcile')
    setError(null)

    try {
      const body = new FormData(event.currentTarget)
      body.set('outcome', outcome)
      const response = await fetch(`/api/admin/payouts/${requestId}/${authorizedNow ? 'complete' : 'reconcile'}`, {
        method: 'POST',
        body,
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'No se pudo registrar la transferencia')
        setAuthorizedNow(false)
        router.refresh()
        return
      }
      router.refresh()
    } catch {
      setError('Resultado incierto. Consulta el estado; no repitas la transferencia.')
      setAuthorizedNow(false)
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  async function reject() {
    if (notes.trim().length < 10) {
      setError('Escribe el motivo para cancelar el pago autorizado')
      return
    }

    setLoading('reject')
    setError(null)
    try {
      const response = await fetch(`/api/admin/payouts/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'No se pudo cancelar el pago')
        return
      }
      router.refresh()
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(null)
    }
  }

  async function begin() {
    setLoading('begin'); setError(null)
    try {
      const response = await fetch(`/api/admin/payouts/${requestId}/begin`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok || !data.authorization) { setError(data.error ?? 'Consulta el estado; no transfieras'); router.refresh(); return }
      setAuthorizedNow(true)
    } catch { setError('Autorización incierta. Consulta el estado y concilia antes de transferir.'); router.refresh() }
    finally { setLoading(null) }
  }
  const started = status === 'transferring' || status === 'reconciling' || authorizedNow
  return (
    <form onSubmit={complete} className="space-y-3 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        {authorizedNow ? 'Autorización recibida. Realiza una sola transferencia por el importe y destino revisados. Luego registra su comprobante.'
          : started ? 'La transferencia ya fue iniciada. Consulta el banco; no vuelvas a transferir. Otro operador debe conciliar el resultado con evidencia bancaria.'
          : 'Antes de transferir, el operador responsable debe obtener la autorización. Si la respuesta se pierde, consulta y concilia; no repitas la transferencia.'}
      </p>
      {!started && <button type="button" disabled={!!loading || !canTransfer} onClick={begin} className="border rounded px-3 py-2">Obtener autorización e iniciar transferencia</button>}
      {started && !authorizedNow && <label className="block text-sm">Resultado bancario
        <select value={outcome} onChange={e => setOutcome(e.target.value)} className="border p-2 ml-2">
          <option value="unknown">Incierto: mantener en conciliación</option>
          {canReconcile && <><option value="paid">Banco confirma pago</option><option value="not_sent">Banco confirma que no se envió</option></>}
        </select>
      </label>}
      {started && <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Referencia bancaria única
          <input name="transferReference" required={authorizedNow || outcome !== 'unknown'} maxLength={120} className="w-full border rounded p-2" />
        </label>
        <label className="text-xs">Comprobante bancario privado
          <input name="evidence" type="file" required={authorizedNow || outcome !== 'unknown'} accept="application/pdf,image/jpeg,image/png,image/webp" className="w-full border rounded p-2" />
        </label>
      </div>}
      <textarea name="notes" value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} placeholder="Justificación y evidencia bancaria revisada" rows={2} className="w-full border rounded p-2 text-sm" />
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
      <div className="flex gap-2">
        {started && <button type="submit" disabled={!!loading} className="border rounded px-3 py-2">{authorizedNow ? 'Registrar transferencia pagada' : 'Registrar conciliación'}</button>}
        {!started && <button type="button" disabled={!!loading} onClick={reject} className="border rounded px-3 py-2">Cancelar antes de transferir</button>}
      </div>
    </form>
  )
}
