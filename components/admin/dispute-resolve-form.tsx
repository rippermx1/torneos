'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  disputeId: string
  acknowledged?: boolean
}

export function DisputeResolveForm({ disputeId, acknowledged = false }: Props) {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState<'resolved' | 'rejected' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  async function acknowledge() {
    setError(null)
    setLoading('resolved')
    try {
      const res = await fetch(`/api/admin/disputes/${disputeId}/acknowledge`, { method: 'POST' })
      if (!res.ok) { setError((await res.json()).error ?? 'No se pudo registrar el acuse'); return }
      router.refresh()
    } catch { setError('Error de conexión') } finally { setLoading(null) }
  }

  async function handle(resolution: 'resolved' | 'rejected') {
    if (!notes.trim()) { setError('Las notas son obligatorias'); return }

    setLoading(resolution)
    setError(null)
    try {
      const res = await fetch(`/api/admin/disputes/${disputeId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution, notes: notes.trim() }),
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
      {!acknowledged && <button type="button" disabled={!!loading} onClick={acknowledge} className="border rounded px-3 py-2 text-sm">Registrar acuse de atención</button>}
      <label htmlFor={`case-response-${disputeId}`} className="text-sm">Respuesta visible para el titular</label>
      <textarea
        id={`case-response-${disputeId}`}
        minLength={10}
        maxLength={2000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notas de resolución (se mostrarán al usuario)"
        rows={2}
        className="w-full border rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-foreground/20"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => handle('resolved')}
          disabled={!!loading}
          className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {loading === 'resolved' ? 'Guardando...' : '✓ Resolver'}
        </button>
        <button
          onClick={() => handle('rejected')}
          disabled={!!loading}
          className="flex-1 border border-slate-300 text-slate-600 rounded-lg py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {loading === 'rejected' ? 'Guardando...' : 'Rechazar'}
        </button>
      </div>
    </div>
  )
}
