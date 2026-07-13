'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface AdminMfaChallengeProps {
  factorId: string
}

export function AdminMfaChallenge({ factorId }: AdminMfaChallengeProps) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (code.length !== 6) return

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
      if (verifyError) throw verifyError

      router.replace('/admin')
      router.refresh()
    } catch {
      setError('El código no es válido o expiró. Intenta con el código actual de tu aplicación.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-foreground text-background">
            <ShieldCheck aria-hidden="true" className="size-6" />
          </div>
          <h1 className="text-2xl font-bold">Verificación administrativa</h1>
          <p className="text-sm text-muted-foreground">
            Ingresa el código temporal de tu aplicación de autenticación.
          </p>
        </div>

        <form onSubmit={verify} className="rounded-2xl border p-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="mfa-challenge-code" className="text-sm font-semibold">
              Código de 6 dígitos
            </label>
            <div className="relative">
              <KeyRound aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="mfa-challenge-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
                autoFocus
                placeholder="000000"
                aria-describedby={error ? 'mfa-challenge-error' : undefined}
                className="w-full border rounded-xl py-2.5 pl-10 pr-3 text-center font-mono text-lg tracking-[0.35em] bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
              />
            </div>
          </div>

          {error && <p id="mfa-challenge-error" role="alert" className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-foreground text-background py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                Verificando…
              </span>
            ) : (
              'Entrar al panel'
            )}
          </button>
        </form>

        <p className="text-center text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            ← Volver al sitio
          </Link>
        </p>
      </div>
    </main>
  )
}
