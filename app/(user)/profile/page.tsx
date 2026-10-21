import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ProfileEditForm } from './profile-edit-form'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data } = await createAdminClient()
    .from('profiles')
    .select('id, username, full_name, created_at')
    .eq('id', user.id)
    .single()
  const profile = data as Pick<Profile, 'id' | 'username' | 'full_name' | 'created_at'> | null

  if (!profile) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Mi perfil</h1>
        <p className="text-muted-foreground">Perfil no encontrado. Contacta soporte.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold">Mi perfil</h1>
      <div className="border rounded-xl p-4 space-y-2">
        <p className="text-sm font-semibold">Tu cuenta de 2048 gratuito</p>
        <p className="text-sm text-muted-foreground">
          Practica, juega el desafío diario y consulta tu actividad. No necesitas
          RUT, documentos ni datos bancarios. La ayuda es una demostración y el
          ticket es informativo, sin compra disponible.
        </p>
      </div>
      <ProfileEditForm defaults={{ username: profile.username, full_name: profile.full_name ?? '' }} />
      <div className="border rounded-xl p-5 space-y-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cuenta</p>
        <Row label="Email" value={user.email ?? '—'} />
        <Row label="Miembro desde" value={new Date(profile.created_at).toLocaleDateString('es-CL')} />
      </div>
      <div className="flex gap-3">
        <Link href="/play" className="flex-1 text-center border rounded-xl py-2.5 text-sm hover:bg-muted transition-colors">
          Jugar 2048
        </Link>
        <Link href="/support/dispute" className="flex-1 text-center border rounded-xl py-2.5 text-sm hover:bg-muted transition-colors">
          Soporte
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
