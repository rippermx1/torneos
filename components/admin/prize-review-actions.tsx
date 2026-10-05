'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function PrizeReviewActions({ reviewId, userId, activeHolds }: { reviewId: string; userId: string; activeHolds: { id: string; reason: string }[] }) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  async function act(decision: 'approved' | 'held' | 'hold' | 'release', holdId?: string) {
    if (reason.trim().length < 10) { setError('Documenta el motivo con al menos 10 caracteres'); return }
    setLoading(true); setError('')
    try {
      // Stable ID across transport retries of this manual hold.
      const key = `financial-hold:${reviewId}`
      let id = holdId ?? sessionStorage.getItem(key)
      if (decision === 'hold' && !id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id) }
      const res = await fetch(decision === 'hold' || decision === 'release' ? '/api/admin/financial-holds' : `/api/admin/prize-reviews/${reviewId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decision === 'hold' || decision === 'release'
          ? { holdId: id, userId, release: decision === 'release', reason: reason.trim() }
          : { decision, reason: reason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'No se pudo registrar'); router.refresh(); return }
      if (decision === 'hold' || decision === 'release') sessionStorage.removeItem(key)
      setReason(''); router.refresh()
    } catch { setError('Resultado incierto. Consulta el estado antes de repetir.'); router.refresh() }
    finally { setLoading(false) }
  }
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Revisa la partida, identidad y disputas. Las heurísticas orientan la revisión; no prueban que el jugador sea humano.</p>
    <textarea aria-label="Justificación de revisión" value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} rows={3} className="w-full border rounded p-2" placeholder="Evidencia revisada y motivo de la decisión (10 a 2000 caracteres)" />
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
    <div className="flex gap-3 flex-wrap">
      <button disabled={loading} onClick={() => act('approved')} className="border rounded px-3 py-2">Aprobar premio</button>
      <button disabled={loading} onClick={() => act('held')} className="border rounded px-3 py-2">Retener premio</button>
      <button disabled={loading} onClick={() => act('hold')} className="border rounded px-3 py-2">Retener todos los premios del usuario</button>
    </div>
    {activeHolds.map(h => <p key={h.id} className="text-sm">Retención: {h.reason} <button disabled={loading} onClick={() => act('release', h.id)} className="underline">Liberar retención</button></p>)}
    <p className="text-xs text-muted-foreground">Liberar una retención o resolver una disputa requiere volver a revisar los premios antes de cobrarlos.</p>
  </div>
}
