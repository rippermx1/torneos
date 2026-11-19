import { createAdminClient } from '@/lib/supabase/server'
import { accountError } from '@/lib/account/requests'

export async function kycDocument(actor: string, id: string, side: string | null, ownerOnly: boolean): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !side || !['front','back'].includes(side)) return Response.json({ error: 'Documento inválido' }, { status: 400 })
  const admin = createAdminClient()
  const permitted = await admin.rpc('read_kyc_document', { p_actor: actor, p_submission: id, p_side: side, p_owner_only: ownerOnly })
  if (permitted.error) return accountError(permitted.error)
  const url = await admin.storage.from('kyc-documents').createSignedUrl(permitted.data, 60)
  if (url.error || !url.data) return Response.json({ error: 'Documento no disponible' }, { status: 503 })
  return new Response(null, { status: 303, headers: { Location: url.data.signedUrl, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
}
