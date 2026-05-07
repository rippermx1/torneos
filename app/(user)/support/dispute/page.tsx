'use client'

import { useState } from 'react'
import type { DisputeType } from '@/types/database'
import Link from 'next/link'

const DISPUTE_TYPES: { value: DisputeType; label: string; desc: string }[] = [
  { value: 'payment', label: 'Problema de pago', desc: 'Inscripción no acreditada, cobro incorrecto, retiro no procesado' },
  { value: 'tournament_result', label: 'Resultado de torneo', desc: 'Puntaje o ranking incorrecto, premio no recibido' },
  { value: 'technical', label: 'Problema técnico', desc: 'Error durante la partida, desconexión' },
  { value: 'other', label: 'Otro', desc: 'Otro tipo de problema' },
]

export default function DisputePage() {
  const [type, setType] = useState<DisputeType | ''>('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!type) { setError('Selecciona el tipo de problema'); return }
    if (description.trim().length < 20) { setError('La descripción debe tener al menos 20 caracteres'); return }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/support/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, description }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al enviar'); return }
      setSuccess(true)
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-sm space-y-4">
        <div className="border rounded-xl p-6 text-center space-y-3">
          <p className="text-2xl">✓</p>
          <h2 className="text-lg font-semibold">Disputa enviada</h2>
          <p className="text-sm text-muted-foreground">
            Tu reporte fue recibido. Te responderemos a la brevedad.
          </p>
        </div>
        <Link href="/" className="block text-center text-sm underline underline-offset-4">
          Volver al inicio
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reportar un problema</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Describe tu situación con el mayor detalle posible. Respondemos en 1–2 días hábiles.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-medium">Tipo de problema</p>
          <div className="space-y-2">
            {DISPUTE_TYPES.map(({ value, label, desc }) => (
              <label
                key={value}
                className={`flex items-start gap-3 border rounded-xl p-3 cursor-pointer transition-colors ${
                  type === value ? 'border-foreground bg-muted/40' : 'hover:bg-muted/20'
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={value}
                  checked={type === value}
                  onChange={() => setType(value)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Descripción <span className="text-muted-foreground font-normal">(mín. 20 caracteres)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Describe qué ocurrió, en qué torneo, cuándo, y qué esperabas que pasara..."
            maxLength={2000}
            required
            className="w-full border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
          <p className="text-xs text-muted-foreground text-right">{description.length}/2000</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || !type || description.trim().length < 20}
          className="w-full bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {loading ? 'Enviando...' : 'Enviar reporte'}
        </button>
      </form>
    </div>
  )
}
