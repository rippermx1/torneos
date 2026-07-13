'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Check, Copy, KeyRound, LoaderCircle, ShieldCheck, Smartphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ADMIN_MFA_CHALLENGE_PATH } from '@/lib/supabase/admin-mfa-policy'

interface Enrollment {
  factorId: string
  qrCode: string
  secret: string
}

function qrCodeSource(qrCode: string): string {
  if (qrCode.startsWith('data:')) return qrCode
  return `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`
}

export function AdminMfaSetup() {
  const router = useRouter()
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function beginEnrollment() {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
      if (factorsError || !factors) throw factorsError ?? new Error('No se pudieron consultar los factores')

      if (factors.totp.length > 0) {
        router.replace(ADMIN_MFA_CHALLENGE_PATH)
        router.refresh()
        return
      }

      const abandonedFactors = factors.all.filter(
        (factor) => factor.factor_type === 'totp' && factor.status === 'unverified',
      )

      for (const factor of abandonedFactors) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
        if (unenrollError) throw unenrollError
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'TorneosPlay Admin',
      })

      if (enrollError || !data || data.type !== 'totp') {
        throw enrollError ?? new Error('No se pudo crear el segundo factor')
      }

      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      })
    } catch {
      setError('No pudimos iniciar la activación. Intenta nuevamente en unos segundos.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyEnrollment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!enrollment || code.length !== 6) return

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollment.factorId,
        code,
      })

      if (verifyError) throw verifyError

      router.replace('/admin')
      router.refresh()
    } catch {
      setError('El código no es válido o expiró. Revisa la hora de tu dispositivo e intenta otra vez.')
    } finally {
      setLoading(false)
    }
  }

  async function copySecret() {
    if (!enrollment) return
    await navigator.clipboard.writeText(enrollment.secret)
    setCopied(true)
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-foreground text-background">
            <ShieldCheck aria-hidden="true" className="size-6" />
          </div>
          <h1 className="text-2xl font-bold">Protege el panel administrativo</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Desde ahora las operaciones sensibles requieren un código temporal además de tu contraseña.
          </p>
        </div>

        {!enrollment ? (
          <div className="rounded-2xl border p-5 space-y-5">
            <div className="flex gap-3">
              <Smartphone aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">Necesitas una app de autenticación</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Puedes usar Google Authenticator, Microsoft Authenticator, 1Password o cualquier app compatible con TOTP.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={beginEnrollment}
              disabled={loading}
              className="w-full bg-foreground text-background py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  Preparando…
                </span>
              ) : (
                'Activar verificación en dos pasos'
              )}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border p-5 space-y-5">
            <div className="space-y-2 text-center">
              <p className="text-sm font-semibold">1. Escanea este código con tu app</p>
              <div className="mx-auto w-fit rounded-xl border bg-white p-3">
                <Image
                  src={qrCodeSource(enrollment.qrCode)}
                  alt="Código QR para vincular la aplicación de autenticación"
                  width={208}
                  height={208}
                  unoptimized
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                Si no puedes escanearlo, ingresa esta clave manualmente:
              </p>
              <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-2">
                <code className="min-w-0 flex-1 break-all text-center text-xs font-semibold tracking-wide">
                  {enrollment.secret}
                </code>
                <button
                  type="button"
                  onClick={copySecret}
                  className="shrink-0 rounded-lg p-2 hover:bg-background"
                  aria-label="Copiar clave de configuración"
                >
                  {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
                </button>
              </div>
            </div>

            <form onSubmit={verifyEnrollment} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="mfa-setup-code" className="text-sm font-semibold">
                  2. Ingresa el código de 6 dígitos
                </label>
                <div className="relative">
                  <KeyRound aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="mfa-setup-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    required
                    autoFocus
                    placeholder="000000"
                    aria-describedby={error ? 'mfa-setup-error' : undefined}
                    className="w-full border rounded-xl py-2.5 pl-10 pr-3 text-center font-mono text-lg tracking-[0.35em] bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
                  />
                </div>
              </div>

              {error && <p id="mfa-setup-error" role="alert" className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full bg-foreground text-background py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? 'Verificando…' : 'Confirmar y entrar al panel'}
              </button>
            </form>
          </div>
        )}

        {!enrollment && error && <p role="alert" className="text-center text-sm text-red-600">{error}</p>}

        <p className="text-center text-xs text-muted-foreground">
          Esta protección es obligatoria para aprobar retiros, administrar pagos y modificar torneos.
        </p>
        <p className="text-center text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            ← Volver al sitio
          </Link>
        </p>
      </div>
    </main>
  )
}
