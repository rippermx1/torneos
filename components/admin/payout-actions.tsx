'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  requestId: string
  claimed?: boolean
  canApprove?: boolean
}

export function PayoutActions({ requestId, claimed = false, canApprove = true }: Props) {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState<'claim' | 'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handle(action: 'claim' | 'approve' | 'reject') {
    if (action !== 'claim' && notes.trim().length < 10) {
      setError('Documenta la verificación o rechazo con al menos 10 caracteres')
      return
    }

    setLoading(action)
    setError(null)
    try {
      const res = await fetch(`/api/admin/payouts/${requestId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error'); return }
      router.refresh()
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Importe y destino verificados; motivo si rechazas (10 a 2000 caracteres)"
        maxLength={2000}
        rows={2}
        className="w-full border rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-foreground/20"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => handle(claimed ? 'approve' : 'claim')}
          disabled={!!loading || (claimed && !canApprove)}
          className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Procesando...' : claimed ? (canApprove ? 'Autorizar como segundo operador' : 'Esperando segundo operador') : 'Reclamar como operador responsable'}
        </button>
        <button
          onClick={() => handle('reject')}
          disabled={!!loading}
          className="flex-1 border border-red-300 text-red-600 rounded-lg py-2 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {loading === 'reject' ? 'Rechazando...' : '✕ Rechazar'}
        </button>
      </div>
    </div>
  )
}
