import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { createAdminClient } from '@/lib/supabase/server'
import { readCommunity2048Report } from '@/lib/analytics/2048-community'

const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(request: Request) {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  if (new URL(request.url).search) return Response.json({ error: 'Este informe muestra los últimos 30 retos y no admite parámetros.' }, { status: 400, headers })
  try { return Response.json(await readCommunity2048Report(createAdminClient()), { headers }) }
  catch { return Response.json({ error: 'No se pudo confirmar la participación comunitaria. No se muestran ceros estimados.' }, { status: 503, headers }) }
}
