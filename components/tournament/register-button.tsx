'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCLP, cn } from '@/lib/utils'
import Link from 'next/link'

interface Props {
  tournamentId: string
  entryFeeCents: number
  className?: string
}

export function RegisterButton({ tournamentId, entryFeeCents, className }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [insufficientFunds, setInsufficientFunds] = useState(false)
  const router = useRouter()

  async function handleRegister() {
    setLoading(true)
    setError(null)
    setInsufficientFunds(false)

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/register`, { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        if (data.insufficientFunds) {
          setInsufficientFunds(true)
        } else {
          setError(data.error ?? 'Error al inscribirse')
        }
        return
      }

      router.refresh()
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  if (insufficientFunds) {
    return (
      <div className={cn('space-y-2', className)}>
        <p className="text-sm text-red-600 text-center">
          Saldo insuficiente para la cuota de {formatCLP(entryFeeCents)}.
        </p>
        <Link
          href="/wallet/deposit"
          className="block w-full text-center bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
        >
          Recargar billetera
        </Link>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <button
        onClick={handleRegister}
        disabled={loading}
        className="w-full bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading
          ? 'Inscribiendo...'
          : entryFeeCents === 0
          ? 'Inscribirme gratis'
          : `Inscribirme — ${formatCLP(entryFeeCents)}`}
      </button>
      {error && <p className="text-xs text-red-600 text-center">{error}</p>}
    </div>
  )
}
