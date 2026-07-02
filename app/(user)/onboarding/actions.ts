'use server'

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRole } from '@/lib/supabase/auth'
import { redirect } from 'next/navigation'
import { sendWelcomeEmail } from '@/lib/email/account-notifications'
import { isAdult } from '@/lib/identity/verification'

export async function completeOnboarding(formData: FormData) {
  const access = await requireAnyRole(['user'])

  const username = (formData.get('username') as string).trim()
  const fullName = (formData.get('fullName') as string).trim()
  const birthDate = ((formData.get('birthDate') as string | null) ?? '').trim()
  const acceptedTerms = formData.get('acceptedTerms') === 'true'

  if (username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return { error: 'Nombre de usuario inválido.' }
  }

  // Age-gate: la edad se captura y valida aquí (antes solo se declaraba en el
  // checkbox de T&C, y birth_date quedaba nulo hasta el KYC, permitiendo que
  // usuarios sin edad verificada entraran a freerolls con premio).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return { error: 'Ingresa tu fecha de nacimiento.' }
  }

  if (!isAdult(birthDate)) {
    return { error: 'Debes ser mayor de 18 años para usar TorneosPlay.' }
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
        birth_date: birthDate,
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

  after(async () => {
    try {
      const email = access.user.email
      const uname = access.user.user_metadata?.username ?? username
      if (email) await sendWelcomeEmail({ to: email, username: uname })
    } catch (e) {
      console.error('[onboarding] Error enviando email de bienvenida:', e)
    }
  })

  redirect('/tournaments')
}
