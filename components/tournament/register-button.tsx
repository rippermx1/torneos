'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatCLP, cn } from '@/lib/utils'

interface Props {
  tournamentId: string
  entryFeeCents: number
  className?: string
}

export function RegisterButton({ tournamentId, entryFeeCents, className }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsTerms, setNeedsTerms] = useState(false)
  const [acceptingTerms, setAcceptingTerms] = useState(false)
  const router = useRouter()

  async function doRegister() {
    setLoading(true)
    setError(null)

    try {
      if (entryFeeCents > 0) {
        const res = await fetch(`/api/tournaments/${tournamentId}/checkout/flow/create`, {
          method: 'POST',
        })
        const data = await res.json()
        if (!res.ok || !data?.redirectUrl) {
          if (data?.termsRequired) { setNeedsTerms(true); return }
          setError(data?.error ?? 'No se pudo iniciar el pago')
          return
        }
        window.location.href = data.redirectUrl
        return
      }

      const res = await fetch(`/api/tournaments/${tournamentId}/register`, { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        if (data?.termsRequired) { setNeedsTerms(true); return }
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

  async function handleAcceptAndRegister() {
    setAcceptingTerms(true)
    setError(null)

    try {
      const res = await fetch('/api/profile/accept-terms', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Error al registrar la aceptación.')
        return
      }
      setNeedsTerms(false)
      await doRegister()
    } catch {
      setError('Error de conexión')
    } finally {
      setAcceptingTerms(false)
    }
  }

  if (needsTerms) {
    return (
      <div className={cn('rounded-xl border bg-muted/30 px-4 py-4 space-y-3', className)}>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Acepta los Términos antes de inscribirte</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Para participar en torneos necesitas aceptar las{' '}
            <Link href="/legal/terminos" target="_blank" className="underline underline-offset-2 hover:text-foreground">
              Bases Legales
            </Link>
            {' '}(competencia de habilidad, política antifraude, condiciones de pago y retiro).
          </p>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Link
            href="/legal/terminos"
            target="_blank"
            className="flex-1 text-xs text-center border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
          >
            Leer términos
          </Link>
          <button
            onClick={handleAcceptAndRegister}
            disabled={acceptingTerms || loading}
            className="flex-1 text-xs bg-foreground text-background rounded-lg px-3 py-2 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {acceptingTerms || loading ? 'Procesando…' : 'Acepto e inscribirme'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <button
        onClick={doRegister}
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
