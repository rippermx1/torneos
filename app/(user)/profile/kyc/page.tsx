import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { KycForm } from './kyc-form'
import type { Profile } from '@/types/database'
import Link from 'next/link'

export default async function KycPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const adminSupabase = createAdminClient()
  const { data } = await adminSupabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const profile = data as Profile | null
  if (!profile) redirect('/onboarding')

  if (profile.kyc_status === 'approved') {
    return (
      <div className="max-w-lg space-y-4">
        <div>
          <Link href="/profile" className="text-sm text-muted-foreground hover:text-foreground">← Mi perfil</Link>
          <h1 className="text-2xl font-bold mt-3">Verificación KYC</h1>
        </div>
        <div className="border rounded-xl p-6 text-center space-y-2">
          <p className="text-3xl">✅</p>
          <p className="font-semibold">Identidad verificada</p>
          <p className="text-sm text-muted-foreground">
            Tu cuenta está verificada. Puedes solicitar retiros sin restricciones.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Link href="/profile" className="text-sm text-muted-foreground hover:text-foreground">← Mi perfil</Link>
        <h1 className="text-2xl font-bold mt-3">Verificación de identidad</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Para solicitar retiros necesitas completar la verificación KYC.
        </p>
      </div>

      {profile.kyc_status === 'rejected' && (
        <div className="border border-red-200 bg-red-50 rounded-xl p-4 text-sm text-red-700">
          Tu verificación anterior fue rechazada. Puedes corregir tus datos y volver a enviarlos.
        </div>
      )}

      {profile.kyc_status === 'pending' && (profile.rut || profile.phone) && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-700">
          Datos enviados. En revisión por el equipo — normalmente en 1–2 días hábiles.
        </div>
      )}

      <KycForm
        defaults={{
          rut:        profile.rut ?? '',
          birth_date: profile.birth_date ?? '',
          phone:      profile.phone ?? '',
          city:       profile.city ?? '',
          full_name:  profile.full_name ?? '',
        }}
      />

      <p className="text-xs text-muted-foreground leading-relaxed">
        Tus datos se usan exclusivamente para verificar tu identidad antes de procesar retiros.
        No se comparten con terceros. Ver{' '}
        <Link href="/legal/privacidad" className="underline underline-offset-2">Política de Privacidad</Link>.
      </p>
    </div>
  )
}
