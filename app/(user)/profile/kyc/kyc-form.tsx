'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  defaults: {
    rut: string
    birth_date: string
    phone: string
    city: string
    full_name: string
  }
}

export function KycForm({ defaults }: Props) {
  const [form, setForm] = useState(defaults)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [maxBirthDate] = useState(
    () => new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().split('T')[0]!
  )

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.rut.trim()) { setError('El RUT es obligatorio.'); return }
    if (!form.full_name.trim()) { setError('El nombre completo es obligatorio.'); return }
    if (!form.birth_date) { setError('La fecha de nacimiento es obligatoria.'); return }
    if (!form.phone.trim()) { setError('El teléfono es obligatorio.'); return }
    if (!form.city.trim()) { setError('La ciudad es obligatoria.'); return }

    startTransition(async () => {
      const res = await fetch('/api/profile/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al enviar. Intenta de nuevo.')
        return
      }
      setSuccess(true)
      router.refresh()
    })
  }

  if (success) {
    return (
      <div className="border rounded-xl p-6 text-center space-y-2">
        <p className="text-3xl">📋</p>
        <p className="font-semibold">Datos enviados</p>
        <p className="text-sm text-muted-foreground">
          El equipo revisará tu solicitud en 1–2 días hábiles. Te notificaremos cuando esté listo.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Nombre completo *" htmlFor="full_name">
        <input
          id="full_name"
          type="text"
          value={form.full_name}
          onChange={set('full_name')}
          placeholder="Como aparece en tu cédula de identidad"
          required
          className={INPUT_CLS}
        />
      </Field>

      <Field label="RUT *" htmlFor="rut">
        <input
          id="rut"
          type="text"
          value={form.rut}
          onChange={set('rut')}
          placeholder="12.345.678-9"
          required
          className={INPUT_CLS}
        />
        <p className="text-xs text-muted-foreground">Con puntos y guión. Ej: 12.345.678-9</p>
      </Field>

      <Field label="Fecha de nacimiento *" htmlFor="birth_date">
        <input
          id="birth_date"
          type="date"
          value={form.birth_date}
          onChange={set('birth_date')}
          required
          max={maxBirthDate}
          className={INPUT_CLS}
        />
        <p className="text-xs text-muted-foreground">Debes ser mayor de 18 años.</p>
      </Field>

      <Field label="Teléfono *" htmlFor="phone">
        <input
          id="phone"
          type="tel"
          value={form.phone}
          onChange={set('phone')}
          placeholder="+56 9 1234 5678"
          required
          className={INPUT_CLS}
        />
      </Field>

      <Field label="Ciudad *" htmlFor="city">
        <input
          id="city"
          type="text"
          value={form.city}
          onChange={set('city')}
          placeholder="Santiago, Valparaíso, Concepción…"
          required
          className={INPUT_CLS}
        />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {isPending ? 'Enviando…' : 'Enviar para verificación'}
      </button>
    </form>
  )
}

const INPUT_CLS =
  'w-full border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20'

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}
