'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export function PayoutCompletionForm({ requestId }: { requestId: string }) {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState<'complete' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading('complete')
    setError(null)

    try {
      const response = await fetch(`/api/admin/payouts/${requestId}/complete`, {
        method: 'POST',
        body: new FormData(event.currentTarget),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'No se pudo registrar la transferencia')
        return
      }
      router.refresh()
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(null)
    }
  }

  async function reject() {
    if (!notes.trim()) {
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

  return (
    <form onSubmit={complete} className="space-y-3 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        Transfiere desde la cuenta de la SpA. Registra el pago sólo después de confirmar la salida bancaria.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Referencia bancaria</span>
          <input
            name="transferReference"
            required
            maxLength={120}
            placeholder="Ej. folio o ID de transferencia"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Comprobante bancario</span>
          <input
            name="evidence"
            type="file"
            required
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="w-full border rounded-lg px-3 py-1.5 text-sm file:mr-2 file:border-0 file:bg-transparent"
          />
        </label>
      </div>
      <textarea
        name="notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Notas de conciliación (opcional; obligatorias si cancelas)"
        rows={2}
        className="w-full border rounded-lg px-3 py-2 text-xs resize-none"
      />
      {error ? <p className="text-xs text-red-600" role="alert">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading !== null}
          className="flex-1 bg-green-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading === 'complete' ? 'Guardando...' : 'Registrar transferencia pagada'}
        </button>
        <button
          type="button"
          onClick={reject}
          disabled={loading !== null}
          className="border border-red-300 text-red-700 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading === 'reject' ? 'Cancelando...' : 'Cancelar'}
        </button>
      </div>
    </form>
  )
}
