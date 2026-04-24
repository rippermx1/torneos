'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  tournamentId: string
}

export function TournamentActions({ tournamentId }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  async function handleFinalize() {
    if (!confirm('¿Finalizar este torneo ahora? Se distribuirán los premios.')) return

    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/finalize`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        setResult(`Error: ${data.error}`)
      } else {
        const d = data.result?.detail
        setResult(
          `✓ Finalizado — ${d?.ranked_players ?? 0} jugadores rankeados, ${d?.prizes_awarded ?? 0} premios acreditados`
        )
        router.refresh()
      }
    } catch {
      setResult('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleFinalize}
        disabled={loading}
        className="text-xs bg-amber-500 text-white rounded-lg px-3 py-1.5 hover:bg-amber-600 transition-colors disabled:opacity-50"
      >
        {loading ? 'Finalizando...' : 'Finalizar ahora'}
      </button>
      {result && (
        <span className={`text-xs ${result.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>
          {result}
        </span>
      )}
    </div>
  )
}
