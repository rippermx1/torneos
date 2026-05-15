import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@/lib/supabase/auth'
import { ResendVerificationButton } from '@/components/auth/resend-verification-button'

export default async function VerifyEmailPage() {
  const user = await getUser()

  // Sin sesión → al login
  if (!user) redirect('/sign-in')

  // Ya verificado → al inicio (no debería llegar aquí)
  if (user.email_confirmed_at) redirect('/')

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">

        <div className="space-y-2">
          <p className="text-5xl">📧</p>
          <h1 className="text-2xl font-bold">Verifica tu correo</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Te enviamos un enlace de activación a{' '}
            <span className="font-medium text-foreground">{user.email}</span>.
            Haz clic en el enlace para activar tu cuenta y acceder a los torneos.
          </p>
        </div>

        <div className="rounded-xl border bg-muted/30 px-5 py-4 space-y-1 text-left text-sm">
          <p className="font-medium">¿No lo encuentras?</p>
          <ul className="text-muted-foreground space-y-1 text-xs list-disc list-inside">
            <li>Revisa la carpeta de spam o correo no deseado</li>
            <li>Asegúrate de que el email sea correcto</li>
            <li>Espera unos minutos y vuelve a intentarlo</li>
          </ul>
        </div>

        <ResendVerificationButton />

        <div className="flex flex-col gap-1.5 items-center pt-2">
          <Link
            href="/sign-in"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Ya confirmé → Iniciar sesión
          </Link>
          <Link
            href="/sign-in"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Usar otro email
          </Link>
        </div>

      </div>
    </div>
  )
}
