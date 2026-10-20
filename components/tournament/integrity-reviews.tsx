'use client'

import { useState } from 'react'
import type { IntegrityReview } from '@/lib/anticheat/integrity'

export function IntegrityReviews({ tournamentId, reviews, finalizing, users }: {
  tournamentId: string; reviews: IntegrityReview[] | null; finalizing: boolean
  users: Record<string, { id: string; name: string }>
}) {
  const [items, setItems] = useState(reviews)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function decide(item: IntegrityReview, sanction = false) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch(sanction ? `/api/admin/users/${users[item.gameId]?.id}/ban` : `/api/admin/tournaments/${tournamentId}/integrity`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanction ? { ban: true, reason: reasons[`${item.gameId}:${item.code}`] }
          : { gameId: item.gameId, code: item.code, reason: reasons[`${item.gameId}:${item.code}`] }),
      })
      if (!response.ok) throw new Error('No se confirmó la decisión. Actualiza la página antes de reintentar.')
      const data = await response.json()
      if (data.ok !== true || sanction && data.banned !== true) throw new Error('No se confirmó la decisión. Actualiza la página antes de reintentar.')
      setItems(current => current?.map(r => sanction
        ? users[r.gameId]?.id === users[item.gameId]?.id && r.code !== 'settled_sanction' ? { ...r, decision: 'sanctioned' } : r
        : r.gameId === item.gameId && r.code === item.code ? { ...r, decision: 'cleared' } : r) ?? null)
      setMessage(sanction ? 'Cuenta suspendida y partidas sin liquidar invalidadas. Los resultados ya liquidados requieren revisión de incidencias.'
        : 'Señal descartada con motivo registrado. Puedes volver a intentar finalizar el torneo.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se confirmó la decisión.') }
    finally { setBusy(false) }
  }
  return <section className="border rounded-xl p-4 space-y-3" aria-label="Revisión de integridad">
    <h2 className="font-semibold">Revisión de integridad</h2>
    <p className="text-sm text-muted-foreground">Las señales requieren revisión. Una cadencia regular no demuestra automatización.</p>
    {items === null ? <p role="alert" className="text-sm text-red-700">No se pudo comprobar la integridad. La finalización requiere una comprobación confirmada.</p>
      : items.length === 0 ? <p className="text-sm">{finalizing ? 'Sin señales pendientes detectadas.' : 'La revisión completa se realiza al cerrar la ventana de juego.'}</p>
        : items.map(item => {
          const key = `${item.gameId}:${item.code}`
          return <article key={key} className="border rounded-lg p-3 space-y-2">
            <p className="text-sm font-medium">{users[item.gameId]?.name ?? 'Jugador'} · {item.code === 'regular_pace'
              ? 'Cadencia regular' : item.code === 'identity_collision' ? 'Identidad compartida' : 'Sanción posterior a liquidación'} · {item.decision === 'pending' ? 'Pendiente' : item.decision === 'cleared' ? 'Descartada' : 'Sancionada'}</p>
            <div className="flex flex-wrap gap-4 text-sm underline">
              <a href={`/admin/tournaments/${tournamentId}/games/${item.gameId}`}>Revisar partida</a>
              {users[item.gameId] && <a href={`/admin/users/${users[item.gameId].id}/wallet`}>Revisar cuenta</a>}
            </div>
            {item.decision === 'pending' && item.code !== 'settled_sanction' && finalizing && <>
              <label className="block text-sm">Motivo de la decisión
                <textarea className="block w-full border rounded p-2 mt-1" maxLength={1000} rows={2}
                  value={reasons[key] ?? ''} onChange={event => setReasons(current => ({ ...current, [key]: event.target.value }))} />
              </label>
              <button className="border rounded px-3 py-2 text-sm disabled:opacity-50" disabled={busy || (reasons[key]?.trim().length ?? 0) < 10}
                onClick={() => decide(item)}>Descartar señal con motivo</button>
              {users[item.gameId] && <button className="border border-red-300 text-red-700 rounded px-3 py-2 text-sm disabled:opacity-50 ml-2"
                disabled={busy || (reasons[key]?.trim().length ?? 0) < 10} onClick={() => decide(item, true)}>Sancionar infracción confirmada</button>}
            </>}
            {item.code === 'settled_sanction' && <p className="text-sm">La liquidación permanece registrada. Revisar con el procedimiento de incidencias.</p>}
          </article>
        })}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>
}
