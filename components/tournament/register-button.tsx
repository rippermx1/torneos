'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCLP, cn } from '@/lib/utils'

interface Props {
  tournamentId: string
  entryFeeCents: number
  className?: string
}

export function RegisterButton({ tournamentId, entryFeeCents, className }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleRegister() {
    setLoading(true)
    setError(null)

    try {
      if (entryFeeCents > 0) {
        // Torneo pagado: redirigir a Flow checkout (Ruta 1).
        const res = await fetch(`/api/tournaments/${tournamentId}/checkout/flow/create`, {
          method: 'POST',
        })
        const data = await res.json()
        if (!res.ok || !data?.redirectUrl) {
          setError(data?.error ?? 'No se pudo iniciar el pago')
          return
        }
        window.location.href = data.redirectUrl
        return
      }

      // Freeroll: inscripción directa.
      const res = await fetch(`/api/tournaments/${tournamentId}/register`, { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Error al inscribirse')
        return
      }

      router.refresh()
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <button
        onClick={handleRegister}
        disabled={loading}
        className="w-full bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading
          ? 'Procesando...'
          : entryFeeCents === 0
          ? 'Inscribirme gratis'
          : `Inscribirme — ${formatCLP(entryFeeCents)}`}
      </button>
      {error && <p className="text-xs text-red-600 text-center">{error}</p>}
    </div>
  )
}
