import { createClient, createAdminClient } from '@/lib/supabase/server'

// Versión actual de los T&C — incrementar cuando cambien las bases legales
export const TERMS_VERSION = '1.0'

export async function POST(): Promise<Response> {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('profiles')
    .update({ terms_accepted_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    return Response.json({ error: `Error registrando aceptación: ${error.message}` }, { status: 500 })
  }

  return Response.json({ ok: true, version: TERMS_VERSION, acceptedAt: new Date().toISOString() })
}
