'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GoogleButton } from '@/components/auth/google-button'

export default function SignUpPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const confirmUrl = new URL('/auth/confirm', window.location.origin)
    confirmUrl.searchParams.set('next', '/onboarding')

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: confirmUrl.toString(),
      },
    })

    if (signUpError) {
      setError(signUpError.message === 'User already registered'
        ? 'Ya existe una cuenta con ese email.'
        : 'Error al crear la cuenta. Inténtalo nuevamente.')
      setLoading(false)
      return
    }

    // Si Supabase devuelve sesión directamente (confirmación deshabilitada)
    if (data.session) {
      router.push('/onboarding')
      router.refresh()
      return
    }

    // Si requiere confirmación de email
    setCheckEmail(true)
    setLoading(false)
  }

  if (checkEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <p className="text-4xl">📧</p>
          <h1 className="text-xl font-bold">Revisa tu correo</h1>
          <p className="text-sm text-muted-foreground">
            Te enviamos un enlace de confirmación a <strong>{email}</strong>.
            Haz clic en el enlace para activar tu cuenta.
          </p>
          <Link href="/sign-in" className="inline-block text-sm text-muted-foreground hover:text-foreground transition-colors">
            Ya confirmé → Iniciar sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Crear cuenta</h1>
          <p className="text-sm text-muted-foreground">Únete a los torneos de 2048</p>
        </div>

        <GoogleButton redirectTo="/onboarding" />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs text-muted-foreground">
            <span className="bg-background px-2">o regístrate con email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              autoComplete="email"
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              autoComplete="new-password"
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirm" className="text-sm font-medium">Confirmar contraseña</label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repite la contraseña"
              required
              autoComplete="new-password"
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
            />
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Al crear tu cuenta aceptas nuestros{' '}
            <Link href="/legal/terminos" target="_blank" className="underline underline-offset-2 text-foreground">
              Términos y Condiciones
            </Link>{' '}
            y la{' '}
            <Link href="/legal/privacidad" target="_blank" className="underline underline-offset-2 text-foreground">
              Política de Privacidad
            </Link>.
          </p>

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-foreground text-background py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{' '}
          <Link href="/sign-in" className="font-medium text-foreground hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
