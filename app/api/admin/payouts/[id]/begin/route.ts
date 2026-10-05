import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { financialError } from '@/lib/payouts/review'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const { id } = await params
  try {
    const { data, error } = await createAdminClient().rpc('begin_withdrawal_transfer', { p_request_id: id, p_admin_id: auth.access.userId })
    return error ? financialError(error) : Response.json({ ok: true, authorization: data })
  } catch { return financialError({ message: 'Respuesta perdida' }) }
}
