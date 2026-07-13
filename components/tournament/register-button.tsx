'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatCLP, cn } from '@/lib/utils'

interface Props {
  tournamentId: string
  entryFeeCents: number
  /** Crédito de torneo (rakeback) disponible del usuario, en centavos. */
  creditBalanceCents?: number
  className?: string
}

export function RegisterButton({ tournamentId, entryFeeCents, creditBalanceCents = 0, className }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<{ href: string; label: string } | null>(null)
  const [needsTerms, setNeedsTerms] = useState(false)
  const [acceptingTerms, setAcceptingTerms] = useState(false)
  const router = useRouter()

  const canUseCredit = entryFeeCents > 0 && creditBalanceCents >= entryFeeCents

  async function doRegister(useCredit = false) {
    setLoading(true)
    setError(null)
    setRecovery(null)

    try {
      if (entryFeeCents > 0) {
        const res = await fetch(`/api/tournaments/${tournamentId}/checkout/flow/create`, {
          method: 'POST',
          ...(useCredit
            ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ useCredit: true }) }
            : {}),
        })
        const data = await res.json()
        if (!res.ok) {
          if (data?.termsRequired) { setNeedsTerms(true); return }
          if (data?.kycRequired || data?.kycPending) {
            setRecovery({ href: '/profile/kyc', label: 'Ir a verificación' })
          } else if (data?.birthDateRequired) {
            setRecovery({ href: '/onboarding', label: 'Completar registro' })
          } else if (data?.emailNotConfirmed) {
            setRecovery({ href: '/verify-email', label: 'Verificar correo' })
          }
          setError(data?.error ?? 'No se pudo procesar la inscripción')
          return
        }
        if (data?.registered) { router.refresh(); return } // inscrito con crédito
        if (data?.redirectUrl) { window.location.href = data.redirectUrl; return }
        setError('No se pudo iniciar el pago')
        return
      }

      const res = await fetch(`/api/tournaments/${tournamentId}/register`, { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        if (data?.termsRequired) { setNeedsTerms(true); return }
        if (data?.birthDateRequired) {
          setRecovery({ href: '/onboarding', label: 'Completar registro' })
        } else if (data?.emailNotConfirmed) {
          setRecovery({ href: '/verify-email', label: 'Verificar correo' })
        }
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
    setRecovery(null)

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
            type="button"
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
    <div className={cn('flex flex-col gap-2', className)}>
      {canUseCredit && (
        <button
          type="button"
          onClick={() => doRegister(true)}
          disabled={loading}
          className="w-full border-2 border-emerald-500 text-emerald-700 py-3 rounded-xl font-medium hover:bg-emerald-50 transition-colors disabled:opacity-50"
        >
          {loading ? 'Procesando...' : 'Canjear participación gratis'}
        </button>
      )}
      <button
        type="button"
        onClick={() => doRegister(false)}
        disabled={loading}
        className="w-full bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading
          ? 'Procesando...'
          : entryFeeCents === 0
          ? 'Inscribirme gratis'
          : `Comprar participación — ${formatCLP(entryFeeCents)}`}
      </button>
      {error && <p className="text-xs text-red-600 text-center">{error}</p>}
      {recovery && (
        <Link
          href={recovery.href}
          className="text-center text-xs font-medium underline underline-offset-4"
        >
          {recovery.label}
        </Link>
      )}
    </div>
  )
}
