'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { completeOnboarding } from './actions'
import { isAdult } from '@/lib/identity/verification'
import { CURRENT_TERMS_VERSION } from '@/lib/legal/terms'

interface Props {
  defaultUsername: string
  defaultFullName: string
  defaultBirthDate: string
  defaultAcceptedTerms: boolean
  returnTo: string
}

export function OnboardingForm({
  defaultUsername,
  defaultFullName,
  defaultBirthDate,
  defaultAcceptedTerms,
  returnTo,
}: Props) {
  const [username, setUsername] = useState(defaultUsername.startsWith('user_') ? '' : defaultUsername)
  const [fullName, setFullName] = useState(defaultFullName)
  const [birthDate, setBirthDate] = useState(defaultBirthDate)
  const [acceptedTerms, setAcceptedTerms] = useState(defaultAcceptedTerms)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  // Fecha máxima seleccionable = hace 18 años (impide elegir una edad < 18).
  const maxBirthDate = useMemo(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 18)
    return d.toISOString().slice(0, 10)
  }, [])

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
    if (!birthDate) {
      setError('Ingresa tu fecha de nacimiento.')
      return
    }
    if (!isAdult(birthDate)) {
      setError('Debes tener al menos 18 años para completar esta cuenta.')
      return
    }
    if (!acceptedTerms) {
      setError('Debes aceptar los términos y condiciones para continuar.')
      return
    }

    const fd = new FormData()
    fd.append('username', username.trim())
    fd.append('fullName', fullName.trim())
    fd.append('birthDate', birthDate)
    fd.append('acceptedTerms', 'true')
    fd.append('next', returnTo)

    startTransition(async () => {
      const result = await completeOnboarding(fd)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tu cuenta es opcional para practicar y jugar el diario gratuito. Este registro de cuenta es para
        mayores de 18 años; la fecha de nacimiento permite comprobar ese requisito. No necesitas KYC,
        RUT, documentos de identidad ni datos bancarios para jugar gratis.
        {' '}<Link href="/play" className="underline text-foreground">Continuar con la práctica gratuita</Link>.
      </p>
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

      <div className="space-y-1.5">
        <label htmlFor="birthDate" className="text-sm font-medium">
          Fecha de nacimiento <span aria-hidden="true">*</span>
        </label>
        <input
          id="birthDate"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          max={maxBirthDate}
          required
          className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
        />
        <p className="text-xs text-muted-foreground">La cuenta requiere al menos 18 años. El servicio gratuito no ofrece premios en dinero.</p>
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
          Tengo al menos 18 años y acepto los{' '}
          <Link
            href="/legal/terminos"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 text-foreground"
          >
            Términos y Condiciones
          </Link>{' '}
          y la{' '}
          <Link
            href="/legal/privacidad"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 text-foreground"
          >
            Política de Privacidad
          </Link>
          {'. '}
          Versión {CURRENT_TERMS_VERSION} del servicio gratuito. Entiendo que el entrenamiento es una
          demostración sin anuncios reales y que el ticket todavía no está disponible. Esta aceptación
          no autoriza publicidad, cobros ni el uso de datos bancarios.
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
        {isPending ? 'Guardando…' : 'Completar cuenta gratuita'}
      </button>
    </form>
  )
}
