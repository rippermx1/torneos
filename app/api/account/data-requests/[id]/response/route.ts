import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { accountError } from '@/lib/account/requests'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRoleForApi(['user'], { allowSuspended: true }); if (!auth.ok) return auth.response
  const { id } = await params, admin = createAdminClient()
  const result = await admin.rpc('read_data_response', { p_actor: auth.access.userId, p_id: id })
  if (result.error) return accountError(result.error)
  const file = await admin.storage.from('data-responses').createSignedUrl(result.data, 60, { download: true })
  if (file.error || !file.data) return Response.json({ error: 'Respuesta no disponible' }, { status: 503 })
  return new Response(null, { status: 303, headers: { Location: file.data.signedUrl, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
}
