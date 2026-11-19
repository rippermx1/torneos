import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { createAdminClient } from '@/lib/supabase/server'
import { operationalError } from '@/lib/ops/errors'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || !['retry', 'manual_receipt'].includes(body.action) || typeof body.note !== 'string' || body.note.trim().length < 10 || body.note.length > 2000) {
    return Response.json({ error: 'Acción y evidencia de recepción o corrección requeridas' }, { status: 400 })
  }
  try {
    const { error } = await createAdminClient().rpc('review_ops_notification', { p_id: id, p_actor: auth.access.userId, p_action: body.action, p_note: body.note.trim() })
    if (error) return operationalError(error)
    return Response.json({ ok: true })
  } catch { return operationalError({ message: 'Respuesta perdida' }) }
}
