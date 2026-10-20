import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/types/database'
import { OnboardingForm } from './onboarding-form'
import { isAdult } from '@/lib/identity/verification'
import { hasAcceptedCurrentTerms } from '@/lib/legal/terms'
import { getOnboardingReturnPath, getTournamentReturnPath, withAuthDestination } from '@/lib/auth/redirect'
import Link from 'next/link'

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const destination = getOnboardingReturnPath((await searchParams).next)
  const tournamentHref = getTournamentReturnPath(destination)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(withAuthDestination('/sign-in', withAuthDestination('/onboarding', destination)))

  const adminSupabase = createAdminClient()
  const { data } = await adminSupabase
    .from('profiles')
    .select('username, full_name, city, birth_date, terms_accepted_at, terms_version')
    .eq('id', user.id)
    .single()

  const profile = data as Pick<
    Profile,
    'username' | 'full_name' | 'city' | 'birth_date' | 'terms_accepted_at' | 'terms_version'
  > | null

  const hasRealUsername = Boolean(profile?.username && !profile.username.startsWith('user_'))
  const hasCurrentTerms = hasAcceptedCurrentTerms(
    profile?.terms_accepted_at,
    profile?.terms_version
  )

  if (hasRealUsername && isAdult(profile?.birth_date) && hasCurrentTerms) {
    redirect(destination)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">¡Bienvenido/a!</h1>
          <p className="text-muted-foreground text-sm">
            Elige tu nombre de usuario para comenzar a competir.
          </p>
          {tournamentHref && <p className="pt-2 text-sm text-muted-foreground">Al terminar volverás al torneo elegido. <Link href={tournamentHref} className="underline">Ver torneo</Link></p>}
        </div>
        <OnboardingForm
          defaultUsername={profile?.username ?? ''}
          defaultFullName={profile?.full_name ?? ''}
          defaultBirthDate={profile?.birth_date ?? ''}
          defaultAcceptedTerms={hasCurrentTerms}
          returnTo={destination}
        />
      </div>
    </div>
  )
}
