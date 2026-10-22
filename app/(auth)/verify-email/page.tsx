import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@/lib/supabase/auth'
import { ResendVerificationButton } from '@/components/auth/resend-verification-button'
import { getOnboardingPath, getOnboardingReturnPath, withAuthDestination } from '@/lib/auth/redirect'

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const destination = getOnboardingReturnPath((await searchParams).next)
  const signInHref = withAuthDestination('/sign-in', getOnboardingPath(destination))
  const user = await getUser()

  if (user?.email_confirmed_at) redirect(destination)

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">

        <div className="space-y-2">
          <p className="text-5xl">📧</p>
          <h1 className="text-2xl font-bold">Verifica tu correo</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Si tu cuenta está pendiente, puedes solicitar otro enlace de confirmación con el email que usaste al registrarte.
            Después de confirmar podrás completar tus datos y volver a 2048 gratuito.
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

        <ResendVerificationButton returnTo={destination} email={user?.email ?? ''} />

        <div className="flex flex-col gap-1.5 items-center pt-2">
          <Link
            href={signInHref}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Ya confirmé → Iniciar sesión
          </Link>
          <Link
            href="/play"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Jugar 2048 gratis mientras esperas
          </Link>
        </div>

      </div>
    </div>
  )
}
