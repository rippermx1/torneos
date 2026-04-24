'use client'

import { useState } from 'react'
import { formatCLP } from '@/lib/utils'
import Link from 'next/link'

const PRESETS = [
  { label: '$2.000', cents: 200000 },
  { label: '$5.000', cents: 500000 },
  { label: '$10.000', cents: 1000000 },
  { label: '$20.000', cents: 2000000 },
  { label: '$50.000', cents: 5000000 },
]

export default function DepositPage() {
  const [selected, setSelected] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const customCents = custom ? Math.round(parseFloat(custom) * 100) : null
  const amountCents = selected ?? customCents

  async function handleDeposit() {
    if (!amountCents || amountCents < 100000) {
      setError('El monto mínimo es $1.000')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/wallet/deposit/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al iniciar pago'); return }

      // Redirigir a Mercado Pago
      window.location.href = data.initPoint
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-sm space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/wallet" className="text-sm text-muted-foreground hover:text-foreground">← Billetera</Link>
        <h1 className="text-2xl font-bold">Recargar saldo</h1>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Elige un monto</p>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map(({ label, cents }) => (
            <button
              key={cents}
              onClick={() => { setSelected(cents); setCustom('') }}
              className={`border rounded-xl py-3 text-sm font-medium transition-colors ${
                selected === cents
                  ? 'bg-foreground text-background border-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <input
            type="number"
            placeholder="Otro monto (CLP)"
            value={custom}
            onChange={(e) => { setCustom(e.target.value); setSelected(null) }}
            min="1000"
            max="500000"
            step="1000"
            className="w-full border rounded-xl pl-7 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
      </div>

      {amountCents && amountCents >= 100000 && (
        <div className="bg-muted/50 rounded-xl p-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Monto a recargar</span>
            <span className="font-semibold">{formatCLP(amountCents)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Serás redirigido a Mercado Pago para completar el pago.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleDeposit}
        disabled={loading || !amountCents || amountCents < 100000}
        className="w-full bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {loading ? 'Redirigiendo...' : `Pagar con Mercado Pago`}
      </button>

      <p className="text-xs text-muted-foreground text-center">
        Procesado con Mercado Pago. Tu saldo se acredita automáticamente tras confirmar el pago.
      </p>
    </div>
  )
}
