import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { financialError } from '@/lib/payouts/review'

export async function POST(req: Request) {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const body = await req.json().catch(() => null)
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!body || !uuid.test(body.holdId ?? '') || !uuid.test(body.userId ?? '') || typeof body.release !== 'boolean'
    || typeof body.reason !== 'string' || body.reason.trim().length < 10 || body.reason.length > 2000) {
    return Response.json({ error: 'Retención, usuario y justificación válidos requeridos' }, { status: 400 })
  }
  try {
    const { error } = await createAdminClient().rpc('set_financial_hold', { p_hold_id: body.holdId, p_user_id: body.userId, p_admin_id: auth.access.userId, p_release: body.release, p_reason: body.reason.trim() })
    return error ? financialError(error) : Response.json({ ok: true })
  } catch { return financialError({ message: 'Respuesta perdida' }) }
}
