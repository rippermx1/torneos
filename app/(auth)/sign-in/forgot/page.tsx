'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/sign-in/reset`,
    })
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <p className="text-4xl">📧</p>
          <h1 className="text-xl font-bold">Revisa tu correo</h1>
          <p className="text-sm text-muted-foreground">
            Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.
          </p>
          <Link href="/sign-in" className="inline-block text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Volver a iniciar sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Restablecer contraseña</h1>
          <p className="text-sm text-muted-foreground">Te enviaremos un enlace a tu email</p>
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

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-foreground text-background py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </form>

        <p className="text-center text-sm">
          <Link href="/sign-in" className="text-muted-foreground hover:text-foreground transition-colors">
            ← Volver
          </Link>
        </p>
      </div>
    </div>
  )
}
