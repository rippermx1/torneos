import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/types/database'
import { OnboardingForm } from './onboarding-form'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const adminSupabase = createAdminClient()
  const { data } = await adminSupabase
    .from('profiles')
    .select('username, full_name, city')
    .eq('id', user.id)
    .single()

  const profile = data as Pick<Profile, 'username' | 'full_name' | 'city'> | null

  // Si ya tiene un username real (no auto-generado), saltar onboarding
  if (profile?.username && !profile.username.startsWith('user_')) {
    redirect('/tournaments')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">¡Bienvenido/a!</h1>
          <p className="text-muted-foreground text-sm">
            Elige tu nombre de usuario para comenzar a competir.
          </p>
        </div>
        <OnboardingForm
          userId={user.id}
          defaultUsername={profile?.username ?? ''}
          defaultFullName={profile?.full_name ?? ''}
        />
      </div>
    </div>
  )
}
