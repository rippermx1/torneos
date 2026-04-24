'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado.' }

  const username = (formData.get('username') as string).trim()
  const fullName = (formData.get('fullName') as string).trim()

  if (username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return { error: 'Nombre de usuario inválido.' }
  }

  const adminSupabase = createAdminClient()
  const { error } = await adminSupabase
    .from('profiles')
    .update({
      username,
      full_name: fullName || null,
    })
    .eq('id', user.id)

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ese nombre de usuario ya está en uso. Elige otro.' }
    }
    return { error: 'Error al guardar. Inténtalo nuevamente.' }
  }

  redirect('/tournaments')
}
