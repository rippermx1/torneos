import { createAdminClient } from '@/lib/supabase/server'
import { requireAnyRoleForApi } from '@/lib/supabase/auth'
import { recordAdminAction } from '@/lib/admin/audit'
import { settleFlowPayment } from '@/lib/flow/settlement'
import type { FlowPaymentAttempt } from '@/types/database'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAnyRoleForApi(['admin', 'owner'])
  if (!auth.ok) return auth.response

  const adminId = auth.access.userId
  const { id: attemptId } = await params

  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body JSON inválido' }, { status: 400 })
  }
  const token = body.token?.trim()
  if (!token) {
    return Response.json({ error: 'Falta flow_token' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: attemptRow } = await supabase
    .from('flow_payment_attempts')
    .select('*')
    .eq('id', attemptId)
    .single()

  const attempt = attemptRow as FlowPaymentAttempt | null
  if (!attempt) {
    return Response.json({ error: 'Intento no encontrado' }, { status: 404 })
  }

  if (attempt.flow_token && attempt.flow_token !== token) {
    return Response.json(
      { error: 'El token no corresponde con el intento' },
      { status: 422 },
    )
  }

  try {
    const result = await settleFlowPayment(token)
    await recordAdminAction(supabase, {
      adminId,
      action: 'flow.reverify',
      targetType: 'flow_payment_attempt',
      targetId: attemptId,
      summary: `Reverificación manual: ${result.credited ? 'acreditado' : `estado ${result.status.status}`}`,
      payload: {
        commerce_order: attempt.commerce_order,
        flow_status_code: result.status.status,
        credited: result.credited,
      },
    })
    return Response.json({ ok: true, credited: result.credited, status: result.status.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: message }, { status: 502 })
  }
}
