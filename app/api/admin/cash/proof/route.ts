import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'

export async function GET(req: Request) {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const path = new URL(req.url).searchParams.get('path') ?? ''
  const admin = createAdminClient()
  try {
    const { data, error } = await admin.rpc('read_cash_proof', { p_actor: auth.access.userId, p_path: path })
    if (error || !data) return Response.json({ error: 'Evidencia no disponible' }, { status: error?.code === 'PT404' ? 404 : error?.code === 'PT403' ? 403 : 503 })
    const proof = await admin.storage.from('cash-proofs').createSignedUrl(data, 60)
    if (proof.error || !proof.data) throw new Error('Sin acceso')
    return new Response(null, { status: 303, headers: { Location: proof.data.signedUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
  } catch { return Response.json({ error: 'No se pudo confirmar el acceso a la evidencia' }, { status: 503 }) }
}
