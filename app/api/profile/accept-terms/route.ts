import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'

// Versión actual de los T&C — incrementar cuando cambien las bases legales
export const TERMS_VERSION = '1.0'

export async function POST(): Promise<Response> {
  const auth = await requireAnyRoleForApi(['user'])
  if (!auth.ok) return auth.response

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('profiles')
    .update({ terms_accepted_at: new Date().toISOString() })
    .eq('id', auth.access.userId)

  if (error) {
    return Response.json({ error: `Error registrando aceptación: ${error.message}` }, { status: 500 })
  }

  return Response.json({ ok: true, version: TERMS_VERSION, acceptedAt: new Date().toISOString() })
}
