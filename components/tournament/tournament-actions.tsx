'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  tournamentId: string
  canFinalize?: boolean
  canCancel?: boolean
}

export function TournamentActions({ tournamentId, canFinalize, canCancel }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  async function handleFinalize() {
    if (!confirm('¿Finalizar este torneo ahora? Se distribuirán los premios.')) return
    await callAction('finalize', '✓ Finalizado')
  }

  async function handleCancel() {
    if (!confirm('¿Cancelar este torneo? Se reembolsará la inscripción a todos los inscritos.')) return
    await callAction('cancel', '✓ Cancelado')
  }

  async function callAction(action: 'finalize' | 'cancel', successPrefix: string) {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/${action}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        setResult(`Error: ${data.error}`)
      } else {
        if (action === 'finalize') {
          const d = data.result?.detail
          setResult(
            `${successPrefix} — ${d?.ranked_players ?? 0} jugadores rankeados, ${d?.prizes_awarded ?? 0} premios acreditados`
          )
        } else {
          const d = data.result
          setResult(
            `${successPrefix} — ${d?.refunds_issued ?? 0} reembolsos emitidos`
          )
        }
        router.refresh()
      }
    } catch {
      setResult('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {canFinalize && (
        <button
          onClick={handleFinalize}
          disabled={loading}
          className="text-xs bg-amber-500 text-white rounded-lg px-3 py-1.5 hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {loading ? 'Procesando...' : 'Finalizar ahora'}
        </button>
      )}
      {canCancel && (
        <button
          onClick={handleCancel}
          disabled={loading}
          className="text-xs border border-red-300 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {loading ? 'Procesando...' : 'Cancelar torneo'}
        </button>
      )}
      {result && (
        <span className={`text-xs ${result.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>
          {result}
        </span>
      )}
    </div>
  )
}
