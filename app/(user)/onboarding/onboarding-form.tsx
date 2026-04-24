'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { completeOnboarding } from './actions'

interface Props {
  userId: string  // kept for compatibility but not sent to form (server action gets user from session)
  defaultUsername: string
  defaultFullName: string
}

export function OnboardingForm({ userId, defaultUsername, defaultFullName }: Props) {
  const [username, setUsername] = useState(defaultUsername.startsWith('user_') ? '' : defaultUsername)
  const [fullName, setFullName] = useState(defaultFullName)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (username.trim().length < 3) {
      setError('El nombre de usuario debe tener al menos 3 caracteres.')
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setError('Solo se permiten letras, números y guión bajo.')
      return
    }
    if (!acceptedTerms) {
      setError('Debes aceptar los términos y condiciones para continuar.')
      return
    }

    const fd = new FormData()
    fd.append('username', username.trim())
    fd.append('fullName', fullName.trim())

    startTransition(async () => {
      const result = await completeOnboarding(fd)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="username" className="text-sm font-medium">
          Nombre de usuario <span aria-hidden="true">*</span>
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="ej: GamerCL_99"
          maxLength={30}
          required
          autoFocus
          className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
        />
        <p className="text-xs text-muted-foreground">Letras, números y guión bajo. Mínimo 3 caracteres.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="fullName" className="text-sm font-medium">
          Nombre completo <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="ej: Juan Pérez"
          maxLength={80}
          className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
        />
      </div>

      {/* Términos y condiciones */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-foreground"
        />
        <span className="text-sm text-muted-foreground leading-relaxed">
          Soy mayor de 18 años y acepto los{' '}
          <Link
            href="/legal/terminos"
            target="_blank"
            className="underline underline-offset-2 text-foreground"
          >
            Términos y Condiciones
          </Link>{' '}
          y la{' '}
          <Link
            href="/legal/privacidad"
            target="_blank"
            className="underline underline-offset-2 text-foreground"
          >
            Política de Privacidad
          </Link>
          {'. '}
          Entiendo que Torneos 2048 es una competencia de habilidad, no un juego de azar.
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-foreground text-background py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {isPending ? 'Guardando…' : 'Comenzar a jugar'}
      </button>
    </form>
  )
}
