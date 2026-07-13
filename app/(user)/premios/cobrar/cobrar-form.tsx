'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCLP } from '@/lib/utils'
import Link from 'next/link'

const BANKS = [
  'Banco de Chile', 'BancoEstado', 'Santander', 'BCI', 'Scotiabank',
  'Itaú', 'BICE', 'Security', 'Falabella', 'Ripley', 'Consorcio', 'Coopeuch',
]

interface Props {
  /** Monto a pagar en esta solicitud (total adeudado, con tope por solicitud). */
  payoutCents: number
  /** Remanente que queda pendiente si el total supera el tope por solicitud. */
  remainingCents: number
}

export function CobrarForm({ payoutCents, remainingCents }: Props) {
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [accountRut, setAccountRut] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!bankName || !bankAccount || !accountRut || !accountHolder) {
      setError('Completa todos los datos bancarios')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/wallet/withdraw/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: payoutCents,
          bankName, bankAccount, accountRut, accountHolder,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al solicitar el pago')
        return
      }
      setSuccess(true)
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-sm space-y-4">
        <div className="border rounded-xl p-6 text-center space-y-3">
          <p className="text-2xl">✓</p>
          <h2 className="text-lg font-semibold">Pago en proceso</h2>
          <p className="text-sm text-muted-foreground">
            Recibimos tu solicitud de pago de {formatCLP(payoutCents)}. El equipo la revisa y el
            monto se acredita en tu cuenta bancaria en 1–3 días hábiles.
          </p>
        </div>
        <button
          onClick={() => router.push('/premios')}
          className="w-full border rounded-xl py-3 text-sm hover:bg-muted transition-colors"
        >
          Volver a mis premios
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-sm space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/premios" className="text-sm text-muted-foreground hover:text-foreground">← Mis premios</Link>
        <h1 className="text-2xl font-bold">Cobrar premios</h1>
      </div>

      <div className="border rounded-xl p-4 space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Se pagará por transferencia</p>
        <p className="text-2xl font-bold">{formatCLP(payoutCents)}</p>
        {remainingCents > 0 && (
          <p className="text-xs text-muted-foreground">
            El máximo por solicitud es {formatCLP(payoutCents)}. Los {formatCLP(remainingCents)} restantes
            quedan pendientes para tu próximo cobro.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset className="border rounded-xl p-4 space-y-3">
          <legend className="text-sm font-medium px-1">Cuenta bancaria de destino</legend>
          <p className="text-xs text-muted-foreground">
            Debe estar a tu nombre y coincidir exactamente con el nombre y RUT verificados (KYC).
          </p>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Banco</label>
            <select
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              required
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
            >
              <option value="">Selecciona un banco</option>
              {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Número de cuenta</label>
            <input
              type="text"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              required
              placeholder="Ej: 12345678"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">RUT del titular</label>
            <input
              type="text"
              value={accountRut}
              onChange={(e) => setAccountRut(e.target.value)}
              required
              placeholder="Ej: 12.345.678-9"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Nombre del titular</label>
            <input
              type="text"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              required
              placeholder="Nombre completo"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {loading ? 'Enviando...' : `Cobrar ${formatCLP(payoutCents)}`}
        </button>

        <p className="text-xs text-muted-foreground text-center">
          Sin comisión para cuentas bancarias chilenas. El pago se acredita en 1–3 días hábiles
          tras la aprobación.
        </p>
      </form>
    </div>
  )
}
