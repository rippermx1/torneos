'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCLP } from '@/lib/utils'
import Link from 'next/link'

const BANKS = [
  'Banco de Chile', 'BancoEstado', 'Santander', 'BCI', 'Scotiabank',
  'Itaú', 'BICE', 'Security', 'Falabella', 'Ripley', 'Consorcio', 'Coopeuch',
]

const MIN_WITHDRAW_CENTS = 500000 // $5.000 CLP — debe coincidir con /legal/reembolso

const PRESETS = [
  { label: '$5.000', cents: 500000 },
  { label: '$10.000', cents: 1000000 },
  { label: '$20.000', cents: 2000000 },
  { label: '$50.000', cents: 5000000 },
]

export default function WithdrawPage() {
  const [amountCents, setAmountCents] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [accountRut, setAccountRut] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const customCents = custom ? Math.round(parseFloat(custom) * 100) : null
  const finalAmount = amountCents ?? customCents

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!finalAmount || finalAmount < MIN_WITHDRAW_CENTS) { setError('Monto mínimo de retiro: $5.000'); return }
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
          amountCents: finalAmount,
          bankName, bankAccount, accountRut, accountHolder,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.insufficientFunds) {
          setError(`Saldo insuficiente. Tienes ${formatCLP(data.balanceCents)} disponibles.`)
        } else {
          setError(data.error ?? 'Error al solicitar retiro')
        }
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
          <h2 className="text-lg font-semibold">Solicitud enviada</h2>
          <p className="text-sm text-muted-foreground">
            Tu solicitud de retiro de {formatCLP(finalAmount!)} fue recibida.
            El equipo la revisará en 1–3 días hábiles. El monto ya fue descontado de tu saldo.
          </p>
        </div>
        <button
          onClick={() => router.push('/wallet')}
          className="w-full border rounded-xl py-3 text-sm hover:bg-muted transition-colors"
        >
          Volver a mi billetera
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-sm space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/wallet" className="text-sm text-muted-foreground hover:text-foreground">← Billetera</Link>
        <h1 className="text-2xl font-bold">Retirar saldo</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Monto */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Monto a retirar</p>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map(({ label, cents }) => (
              <button
                key={cents}
                type="button"
                onClick={() => { setAmountCents(cents); setCustom('') }}
                className={`border rounded-xl py-2.5 text-sm font-medium transition-colors ${
                  amountCents === cents ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted'
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
              onChange={(e) => { setCustom(e.target.value); setAmountCents(null) }}
              min="1000"
              step="1000"
              className="w-full border rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
        </div>

        {/* Datos bancarios */}
        <fieldset className="border rounded-xl p-4 space-y-3">
          <legend className="text-sm font-medium px-1">Datos bancarios</legend>

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
          disabled={loading || !finalAmount || finalAmount < MIN_WITHDRAW_CENTS}
          className="w-full bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {loading ? 'Enviando...' : finalAmount && finalAmount >= MIN_WITHDRAW_CENTS
            ? `Solicitar retiro de ${formatCLP(finalAmount)}`
            : 'Solicitar retiro'}
        </button>

        <p className="text-xs text-muted-foreground text-center">
          El monto se descuenta de tu saldo al enviar. Se acredita en tu cuenta bancaria en 1–3 días hábiles tras la aprobación.
        </p>
      </form>
    </div>
  )
}
