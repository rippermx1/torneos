import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { KycSubmission, Profile } from '@/types/database'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ProfileEditForm } from './profile-edit-form'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const adminSupabase = createAdminClient()
  const [{ data }, { data: submissionRows }] = await Promise.all([
    adminSupabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single(),
    adminSupabase
      .from('kyc_submissions')
      .select('status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  const profile = data as Profile | null

  if (!profile) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Mi perfil</h1>
        <p className="text-muted-foreground">Perfil no encontrado. Contacta soporte.</p>
      </div>
    )
  }

  const latestSubmission = (submissionRows?.[0] ?? null) as Pick<KycSubmission, 'status'> | null
  const isPendingReview = profile.kyc_status === 'pending' && latestSubmission?.status === 'pending'
  const kyc = profile.kyc_status === 'approved'
    ? {
        label: 'Verificado ✓',
        color: 'text-green-600',
        hint: 'Tu identidad está verificada para torneos pagados y retiros.',
      }
    : profile.kyc_status === 'rejected'
      ? {
          label: 'Rechazado',
          color: 'text-red-600',
          hint: 'Corrige los datos indicados para habilitar pagos y retiros.',
        }
      : isPendingReview
        ? {
            label: 'En revisión',
            color: 'text-amber-600',
            hint: 'Recibimos tus documentos y te avisaremos al terminar la revisión.',
          }
        : {
            label: 'Sin verificar',
            color: 'text-amber-600',
            hint: 'Verifica tu identidad antes de pagar inscripciones o retirar premios.',
          }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold">Mi perfil</h1>

      {/* KYC banner */}
      <div className={`border rounded-xl p-4 flex items-center justify-between gap-4 ${
        profile.kyc_status === 'approved' ? 'border-green-200 bg-green-50' :
        profile.kyc_status === 'rejected' ? 'border-red-200 bg-red-50' :
        'border-amber-200 bg-amber-50'
      }`}>
        <div>
          <p className={`text-sm font-semibold ${kyc.color}`}>KYC: {kyc.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{kyc.hint}</p>
        </div>
        {profile.kyc_status !== 'approved' && (
          <Link
            href="/profile/kyc"
            className="shrink-0 text-sm font-medium border px-3 py-1.5 rounded-lg hover:bg-white/80 transition-colors"
          >
            {isPendingReview
              ? 'Ver estado'
              : 'Verificar identidad'}
          </Link>
        )}
      </div>

      {/* Formulario editable */}
      <ProfileEditForm
        defaults={{
          username:  profile.username,
          full_name: profile.full_name ?? '',
        }}
      />

      {/* Info de cuenta */}
      <div className="border rounded-xl p-5 space-y-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cuenta</p>
        <Row label="Email" value={user.email ?? '—'} />
        <Row label="Ciudad" value={profile.city ?? '—'} />
        <Row label="Miembro desde" value={new Date(profile.created_at).toLocaleDateString('es-CL')} />
      </div>

      <div className="flex gap-3">
        <Link href="/premios" className="flex-1 text-center border rounded-xl py-2.5 text-sm hover:bg-muted transition-colors">
          Mis premios
        </Link>
        <Link href="/support/dispute" className="flex-1 text-center border rounded-xl py-2.5 text-sm hover:bg-muted transition-colors">
          Mis disputas
        </Link>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}
