import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { createAdminClient } from '@/lib/supabase/server'
import { operationalError } from '@/lib/ops/errors'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!/^[0-9a-f-]{36}$/i.test(id) || typeof body?.note !== 'string' || body.note.trim().length < 10 || body.note.length > 2000) {
    return Response.json({ error: 'Plan de atención de 10 a 2000 caracteres requerido' }, { status: 400 })
  }
  try {
    const { error } = await createAdminClient().rpc('acknowledge_ops_incident', { p_id: id, p_actor: auth.access.userId, p_note: body.note.trim() })
    if (error) return operationalError(error)
    return Response.json({ ok: true })
  } catch { return operationalError({ message: 'Respuesta perdida' }) }
}
