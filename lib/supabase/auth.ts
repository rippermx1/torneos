import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Devuelve el usuario autenticado o null si no hay sesión.
 * Usar en Server Components y Route Handlers.
 */
export async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Igual que getUser() pero redirige a /sign-in si no hay sesión.
 * Para Server Components y Route Handlers que requieren auth.
 */
export async function requireUser() {
  const user = await getUser()
  if (!user) redirect('/sign-in')
  return user
}

/**
 * Verifica si el usuario autenticado tiene is_admin = true en la tabla profiles.
 * Usar para proteger rutas/endpoints de admin.
 */
export async function requireAdmin(): Promise<string> {
  const user = await getUser()
  if (!user) redirect('/sign-in')

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!data?.is_admin) redirect('/')
  return user.id
}
