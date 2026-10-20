'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function RefundCreditNoteForm({ refundId }: { refundId: string }) {
  const router = useRouter()
  const [number, setNumber] = useState('')
  const [evidence, setEvidence] = useState('')
  const [verified, setVerified] = useState(false)
  const [issuedOn, setIssuedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/refunds/${refundId}/credit-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, issuedOn, evidence, verified }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'No se pudo registrar la nota de crédito')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar la nota de crédito')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-medium text-amber-900">Nota de crédito pendiente</p>
      <input aria-label="Respaldo de N/C" className="w-full rounded-md border bg-white px-2 py-1 text-xs" placeholder="Referencia al documento original SII / RCV" value={evidence} onChange={(e) => setEvidence(e.target.value)} minLength={3} maxLength={500} required />
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} required />Verifiqué documento y correspondencia contra SII / RCV</label>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Folio de nota de crédito"
          value={number}
          onChange={(event) => setNumber(event.target.value)}
          placeholder="Folio / número"
          maxLength={80}
          required
          className="min-w-36 rounded-md border bg-white px-2 py-1 text-xs"
        />
        <input
          aria-label="Fecha de emisión"
          type="date"
          value={issuedOn}
          onChange={(event) => setIssuedOn(event.target.value)}
          required
          className="rounded-md border bg-white px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-amber-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Guardando…' : 'Registrar N/C'}
        </button>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </form>
  )
}
