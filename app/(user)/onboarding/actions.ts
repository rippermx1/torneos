'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRole } from '@/lib/supabase/auth'
import { redirect } from 'next/navigation'

export async function completeOnboarding(formData: FormData) {
  const access = await requireAnyRole(['user'])

  const username = (formData.get('username') as string).trim()
  const fullName = (formData.get('fullName') as string).trim()
  const acceptedTerms = formData.get('acceptedTerms') === 'true'

  if (username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return { error: 'Nombre de usuario inválido.' }
  }

  if (!acceptedTerms) {
    return { error: 'Debes aceptar los términos y condiciones para continuar.' }
  }

  const adminSupabase = createAdminClient()
  const { error } = await adminSupabase
    .from('profiles')
    .upsert(
      {
        id: access.userId,
        username,
        full_name: fullName || null,
        terms_accepted_at: new Date().toISOString(),
      },
      {
        onConflict: 'id',
      }
    )

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ese nombre de usuario ya está en uso. Elige otro.' }
    }
    return { error: 'Error al guardar. Inténtalo nuevamente.' }
  }

  redirect('/tournaments')
}
