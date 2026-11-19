import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminMfaForApi } from '@/lib/supabase/admin-mfa'
import { recordAdminAction } from '@/lib/admin/audit'
import { dispatchRefund } from '@/lib/flow/refund-worker'

// Compatibility URL: dispatches existing unsent work, never creates a second order.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAdminMfaForApi()
  if (!auth.ok) return auth.response
  const { id } = await params
  const admin = createAdminClient()
  const { data: row, error } = await admin.from('flow_refund_attempts').select('id, status').eq('id', id).single()
  if (error || !row) return Response.json({ error: 'No se pudo leer el reembolso' }, { status: error?.code === 'PGRST116' ? 404 : 503 })
  if (row.status !== 'queued') return Response.json({ error: 'Solo se pueden enviar devoluciones aún no enviadas. Concilia con Flow las operaciones inciertas o fallidas.' }, { status: 409 })
  try {
    const result = await dispatchRefund(id, new URL(req.url).origin)
    await recordAdminAction(admin, { adminId: auth.access.userId, action: 'refund.dispatch',
      targetType: 'flow_refund_attempt', targetId: id, summary: 'Envío de obligación de devolución existente',
      payload: { dispatched: result.dispatched, uncertain: Boolean(result.error) } })
    return Response.json({ ok: !result.error, newAttemptId: id, newStatus: result.error ? 'unknown' : 'pending' }, { status: result.error ? 502 : 200 })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 })
  }
}
